const PERPLEXITY_CHAT_COMPLETIONS_URL =
  "https://api.perplexity.ai/chat/completions";
const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

type PerplexityProvider = "perplexity" | "openrouter";

export interface PerplexitySearchInput {
  query: string;
  model?: string;
}

interface PerplexityChatResponse {
  model?: unknown;
  citations?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

export class MissingPerplexityApiKeyError extends Error {
  constructor(provider: PerplexityProvider = "perplexity") {
    super(
      provider === "openrouter"
        ? "OPENROUTER_API_KEY is required when PERPLEXITY_API_PROVIDER=openrouter"
        : "PERPLEXITY_API_KEY is required to use perplexity-search"
    );
    this.name = "MissingPerplexityApiKeyError";
  }
}

export class PerplexityApiRequestError extends Error {
  statusCode: number;
  responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    super(`Perplexity API returned status ${statusCode}`);
    this.name = "PerplexityApiRequestError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const asNonEmptyString = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

interface SearchProviderConfig {
  provider: PerplexityProvider;
  apiKey: string;
  completionsUrl: string;
  defaultModel: string;
  headers: Record<string, string>;
}

const resolvePerplexityProvider = (): PerplexityProvider => {
  const configuredProvider = asNonEmptyString(
    process.env.PERPLEXITY_API_PROVIDER
  )?.toLowerCase();

  if (configuredProvider === "openrouter") {
    return "openrouter";
  }

  if (configuredProvider === "perplexity") {
    return "perplexity";
  }

  if (asNonEmptyString(process.env.PERPLEXITY_API_KEY)) {
    return "perplexity";
  }

  if (asNonEmptyString(process.env.OPENROUTER_API_KEY)) {
    return "openrouter";
  }

  return "perplexity";
};

const resolveSearchProviderConfig = (): SearchProviderConfig => {
  const provider = resolvePerplexityProvider();

  if (provider === "openrouter") {
    const apiKey = asNonEmptyString(process.env.OPENROUTER_API_KEY);
    if (!apiKey) {
      throw new MissingPerplexityApiKeyError(provider);
    }

    const httpReferer = asNonEmptyString(process.env.OPENROUTER_HTTP_REFERER);
    const appName = asNonEmptyString(process.env.OPENROUTER_APP_NAME);

    return {
      provider,
      apiKey,
      completionsUrl:
        asNonEmptyString(process.env.OPENROUTER_CHAT_COMPLETIONS_URL) ??
        OPENROUTER_CHAT_COMPLETIONS_URL,
      defaultModel: "perplexity/sonar-pro",
      headers: {
        ...(httpReferer ? { "HTTP-Referer": httpReferer } : {}),
        ...(appName ? { "X-Title": appName } : {}),
      },
    };
  }

  const apiKey = asNonEmptyString(process.env.PERPLEXITY_API_KEY);
  if (!apiKey) {
    throw new MissingPerplexityApiKeyError(provider);
  }

  return {
    provider,
    apiKey,
    completionsUrl:
      asNonEmptyString(process.env.PERPLEXITY_CHAT_COMPLETIONS_URL) ??
      PERPLEXITY_CHAT_COMPLETIONS_URL,
    defaultModel: "sonar-pro",
    headers: {},
  };
};

export const runPerplexitySearch = async (
  input: PerplexitySearchInput
): Promise<{
  answer: string;
  citations: string[];
  model: string;
}> => {
  const providerConfig = resolveSearchProviderConfig();
  const model =
    input.model ?? process.env.PERPLEXITY_MODEL ?? providerConfig.defaultModel;
  const requestBody = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a concise search assistant. Return factual responses and include sources.",
      },
      {
        role: "user",
        content: input.query,
      },
    ],
  };

  const response = await fetch(providerConfig.completionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      "Content-Type": "application/json",
      ...providerConfig.headers,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new PerplexityApiRequestError(response.status, errorBody);
  }

  const payload = (await response.json()) as PerplexityChatResponse;
  const answer = payload.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || answer.trim().length === 0) {
    throw new PerplexityApiRequestError(
      502,
      "Perplexity API returned an empty answer payload"
    );
  }

  const responseModel =
    typeof payload.model === "string" && payload.model.length > 0
      ? payload.model
      : model;

  return {
    answer,
    citations: toStringArray(payload.citations),
    model: responseModel,
  };
};
