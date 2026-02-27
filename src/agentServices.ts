import { runPerplexitySearch } from "./perplexitySearch";

interface PaymentOption {
  network: `${string}:${string}`;
  payTo: string;
  facilitator: string;
}

export interface X402PaymentTerms {
  scheme: "exact";
  network: `${string}:${string}`;
  asset: "USDC";
  price: string;
  payTo: string;
  facilitator: string;
}

export interface AgentServiceDescriptor {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  payment?: X402PaymentTerms;
  paymentOptions?: X402PaymentTerms[];
}

export interface PaidRouteDefinition {
  method: "POST";
  path: string;
  description: string;
  payment: X402PaymentTerms;
  paymentOptions?: X402PaymentTerms[];
}

export class AgentServiceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentServiceInputError";
  }
}

interface AgentService extends AgentServiceDescriptor {
  handler: (
    input: Record<string, unknown>
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

const DEFAULT_X402_PRICE = "$0.02";
const DEFAULT_X402_FACILITATOR = "https://x402.org/facilitator";

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const dedupeByNetwork = (options: PaymentOption[]): PaymentOption[] => {
  const seen = new Set<string>();
  return options.filter((item) => {
    if (seen.has(item.network)) {
      return false;
    }
    seen.add(item.network);
    return true;
  });
};

const parsePaymentOptions = (): PaymentOption[] => {
  const raw = asNonEmptyString(process.env.X402_PAYMENT_OPTIONS);
  if (!raw) {
    throw new Error(
      "X402_PAYMENT_OPTIONS is required. Set it to a JSON array, e.g. " +
        '[{"network":"eip155:8453","payTo":"0x..."}]'
    );
  }

  const defaultFacilitator =
    asNonEmptyString(process.env.X402_FACILITATOR_URL) ??
    DEFAULT_X402_FACILITATOR;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("X402_PAYMENT_OPTIONS must be a valid JSON array");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("X402_PAYMENT_OPTIONS must be a non-empty JSON array");
  }

  const paymentOptions = parsed.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(
        `X402_PAYMENT_OPTIONS[${index}] must be an object with network and payTo fields`
      );
    }

    const option = item as Record<string, unknown>;
    const networkRaw = asNonEmptyString(option.network);
    if (!networkRaw) {
      throw new Error(`X402_PAYMENT_OPTIONS[${index}].network is required`);
    }

    const normalized = networkRaw.trim();
    if (!normalized.startsWith("eip155:")) {
      throw new Error(
        `X402_PAYMENT_OPTIONS[${index}].network must be an EVM CAIP-2 identifier (e.g. eip155:8453), received: ${networkRaw}`
      );
    }

    const payTo = asNonEmptyString(option.payTo);
    if (!payTo) {
      throw new Error(`X402_PAYMENT_OPTIONS[${index}].payTo is required`);
    }

    return {
      network: normalized as `${string}:${string}`,
      payTo,
      facilitator: asNonEmptyString(option.facilitator) ?? defaultFacilitator,
    };
  });

  return dedupeByNetwork(paymentOptions);
};

const toPaymentTerms = (
  options: PaymentOption[],
  price: string
): X402PaymentTerms[] =>
  options.map((option) => ({
    scheme: "exact",
    network: option.network,
    asset: "USDC",
    price,
    payTo: option.payTo,
    facilitator: option.facilitator,
  }));

const resolvePaymentTerms = (
  price: string
): {
  primary: X402PaymentTerms;
  options?: X402PaymentTerms[];
} => {
  const terms = toPaymentTerms(parsePaymentOptions(), price);
  return {
    primary: terms[0],
    options: terms.length > 1 ? terms : undefined,
  };
};

const createAgentServices = (): AgentService[] => {
  const servicePrice =
    asNonEmptyString(process.env.X402_PRICE) ?? DEFAULT_X402_PRICE;
  const paymentTerms = resolvePaymentTerms(servicePrice);

  return [
    {
      id: "echo",
      name: "Echo Agent Tool",
      description: "Free utility endpoint for connectivity and payload checks.",
      endpoint: "/agent/services/echo/invoke",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          message: { type: "string" },
          echoedAt: { type: "string", format: "date-time" },
        },
      },
      handler: (input) => {
        const message = asNonEmptyString(input.message) ?? "hello agent";
        return {
          message,
          echoedAt: new Date().toISOString(),
        };
      },
    },
    {
      id: "perplexity-search",
      name: "Perplexity Web Search (Paid)",
      description:
        "Paid web search endpoint powered by Perplexity for agent workflows.",
      endpoint: "/agent/services/perplexity-search/invoke",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" },
          model: { type: "string" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          citations: { type: "array", items: { type: "string" } },
          model: { type: "string" },
        },
      },
      payment: paymentTerms.primary,
      paymentOptions: paymentTerms.options,
      handler: async (input) => {
        const query = asNonEmptyString(input.query);
        if (!query) {
          throw new AgentServiceInputError("query must be a non-empty string");
        }

        const model = asNonEmptyString(input.model);
        return runPerplexitySearch({ query, model });
      },
    },
  ];
};

const getService = (serviceId: string): AgentService | undefined =>
  createAgentServices().find((service) => service.id === serviceId);

const removeTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

const toServiceDescriptor = (service: AgentService): AgentServiceDescriptor => ({
  id: service.id,
  name: service.name,
  description: service.description,
  endpoint: service.endpoint,
  inputSchema: service.inputSchema,
  outputSchema: service.outputSchema,
  payment: service.payment,
  paymentOptions: service.paymentOptions,
});

export const listAgentServices = (): AgentServiceDescriptor[] =>
  createAgentServices().map(toServiceDescriptor);

export const getAgentServiceDescriptor = (
  serviceId: string
): AgentServiceDescriptor | undefined => {
  const service = getService(serviceId);
  if (!service) {
    return undefined;
  }

  return toServiceDescriptor(service);
};

export const listPaidRouteDefinitions = (): PaidRouteDefinition[] =>
  createAgentServices()
    .filter((service) => service.payment)
    .map((service) => ({
      method: "POST",
      path: service.endpoint,
      description: service.description,
      payment: service.payment as X402PaymentTerms,
      paymentOptions: service.paymentOptions,
    }));

export const invokeAgentService = async (
  serviceId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> => {
  const service = getService(serviceId);
  if (!service) {
    return undefined;
  }

  return service.handler(input);
};

export const buildAgentManifest = (
  baseUrl: string
): {
  name: string;
  protocols: string[];
  services: AgentServiceDescriptor[];
} => {
  const normalizedBaseUrl = removeTrailingSlash(baseUrl);
  return {
    name: "web4-service-agent-catalog",
    protocols: ["http", "x402"],
    services: listAgentServices().map((service) => ({
      ...service,
      endpoint: `${normalizedBaseUrl}${service.endpoint}`,
    })),
  };
};
