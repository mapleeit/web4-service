const PERPLEXITY_CHAT_COMPLETIONS_URL =
  "https://api.perplexity.ai/chat/completions";

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
  constructor() {
    super("PERPLEXITY_API_KEY is required to use perplexity-search");
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

export const runPerplexitySearch = async (
  input: PerplexitySearchInput
): Promise<{
  answer: string;
  citations: string[];
  model: string;
}> => {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new MissingPerplexityApiKeyError();
  }

  const model = input.model ?? process.env.PERPLEXITY_MODEL ?? "sonar-pro";
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

  const response = await fetch(PERPLEXITY_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
