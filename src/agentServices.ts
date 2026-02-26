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
}

export interface PaidRouteDefinition {
  method: "POST";
  path: string;
  description: string;
  payment: X402PaymentTerms;
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

const defaultPayToAddress =
  process.env.X402_PAY_TO ??
  "0x000000000000000000000000000000000000dEaD";
const defaultNetwork = (
  process.env.X402_NETWORK ?? "eip155:84532"
) as `${string}:${string}`;
const defaultPrice = process.env.X402_PRICE ?? "$0.02";
const defaultFacilitator =
  process.env.X402_FACILITATOR_URL ?? "https://facilitator.x402.org";

const asNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const agentServices: AgentService[] = [
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
    payment: {
      scheme: "exact",
      network: defaultNetwork,
      asset: "USDC",
      price: defaultPrice,
      payTo: defaultPayToAddress,
      facilitator: defaultFacilitator,
    },
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

const getService = (serviceId: string): AgentService | undefined =>
  agentServices.find((service) => service.id === serviceId);

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
});

export const listAgentServices = (): AgentServiceDescriptor[] =>
  agentServices.map(toServiceDescriptor);

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
  agentServices
    .filter((service) => service.payment)
    .map((service) => ({
      method: "POST",
      path: service.endpoint,
      description: service.description,
      payment: service.payment as X402PaymentTerms,
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
