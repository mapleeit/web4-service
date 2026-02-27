import { runPerplexitySearch } from "./perplexitySearch";

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

const DEFAULT_X402_PAY_TO = "0x000000000000000000000000000000000000dEaD";
const DEFAULT_X402_NETWORK = "eip155:84532";
const DEFAULT_X402_PRICE = "$0.02";
const DEFAULT_X402_FACILITATOR = "https://x402.org/facilitator";

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseEvmCaip2Network = (
  value: string,
  source: string
): `${string}:${string}` => {
  const normalized = value.trim();
  if (!normalized.startsWith("eip155:")) {
    throw new Error(
      `${source} must use an EVM CAIP-2 network (e.g. eip155:84532), received: ${value}`
    );
  }

  return normalized as `${string}:${string}`;
};

const dedupePaymentTermsByNetwork = (
  paymentTerms: X402PaymentTerms[]
): X402PaymentTerms[] => {
  const seen = new Set<string>();
  return paymentTerms.filter((item) => {
    if (seen.has(item.network)) {
      return false;
    }
    seen.add(item.network);
    return true;
  });
};

const buildDefaultPaymentTerms = (
  network: `${string}:${string}`,
  defaults: {
    payTo: string;
    price: string;
    facilitator: string;
  }
): X402PaymentTerms => ({
  scheme: "exact",
  network,
  asset: "USDC",
  price: defaults.price,
  payTo: defaults.payTo,
  facilitator: defaults.facilitator,
});

const parsePaymentTermsFromJson = (defaults: {
  payTo: string;
  price: string;
  facilitator: string;
}): X402PaymentTerms[] | undefined => {
  const raw = asNonEmptyString(process.env.X402_PAYMENT_OPTIONS);
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("X402_PAYMENT_OPTIONS must be a valid JSON array");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("X402_PAYMENT_OPTIONS must be a non-empty JSON array");
  }

  const paymentTerms = parsed.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(
        `X402_PAYMENT_OPTIONS[${index}] must be an object with at least a network field`
      );
    }

    const option = item as Record<string, unknown>;
    const networkRaw = asNonEmptyString(option.network);
    if (!networkRaw) {
      throw new Error(`X402_PAYMENT_OPTIONS[${index}].network is required`);
    }

    return {
      scheme: "exact" as const,
      network: parseEvmCaip2Network(
        networkRaw,
        `X402_PAYMENT_OPTIONS[${index}]`
      ),
      asset: "USDC" as const,
      price: asNonEmptyString(option.price) ?? defaults.price,
      payTo: asNonEmptyString(option.payTo) ?? defaults.payTo,
      facilitator: asNonEmptyString(option.facilitator) ?? defaults.facilitator,
    };
  });

  return dedupePaymentTermsByNetwork(paymentTerms);
};

const parseNetworksFromEnv = (): `${string}:${string}`[] => {
  const rawNetworks = asNonEmptyString(process.env.X402_NETWORKS);
  if (!rawNetworks) {
    return [];
  }

  const parsedNetworks = rawNetworks
    .split(",")
    .map((network) => asNonEmptyString(network))
    .filter((network): network is string => Boolean(network))
    .map((network) => parseEvmCaip2Network(network, "X402_NETWORKS"));

  return Array.from(new Set(parsedNetworks));
};

const resolvePaymentTerms = (): {
  primary: X402PaymentTerms;
  options?: X402PaymentTerms[];
} => {
  const defaults = {
    payTo: asNonEmptyString(process.env.X402_PAY_TO) ?? DEFAULT_X402_PAY_TO,
    price: asNonEmptyString(process.env.X402_PRICE) ?? DEFAULT_X402_PRICE,
    facilitator:
      asNonEmptyString(process.env.X402_FACILITATOR_URL) ??
      DEFAULT_X402_FACILITATOR,
  };

  const fromJson = parsePaymentTermsFromJson(defaults);
  if (fromJson && fromJson.length > 0) {
    return {
      primary: fromJson[0],
      options: fromJson.length > 1 ? fromJson : undefined,
    };
  }

  const configuredNetworks = parseNetworksFromEnv();
  const fallbackNetwork = parseEvmCaip2Network(
    asNonEmptyString(process.env.X402_NETWORK) ?? DEFAULT_X402_NETWORK,
    "X402_NETWORK"
  );
  const networks =
    configuredNetworks.length > 0 ? configuredNetworks : [fallbackNetwork];
  const options = networks.map((network) =>
    buildDefaultPaymentTerms(network, defaults)
  );

  return {
    primary: options[0],
    options: options.length > 1 ? options : undefined,
  };
};

const createAgentServices = (): AgentService[] => {
  const paymentTerms = resolvePaymentTerms();

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
