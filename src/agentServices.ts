export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";

export interface X402PaymentTerms {
  scheme: "exact";
  network: string;
  asset: "USDC";
  amount: string;
  payTo: string;
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

interface AgentService extends AgentServiceDescriptor {
  handler: (input: Record<string, unknown>) => Record<string, unknown>;
}

export interface PaymentRequiredPayload {
  version: string;
  serviceId: string;
  endpoint: string;
  accepted: X402PaymentTerms[];
  note: string;
}

export interface PaymentResponsePayload {
  version: string;
  serviceId: string;
  status: "settled";
  settledAt: string;
  paymentReference: string;
}

const defaultPayToAddress =
  process.env.X402_PAY_TO ??
  "0x000000000000000000000000000000000000dEaD";
const defaultNetwork = process.env.X402_NETWORK ?? "eip155:8453";

const asNonEmptyString = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
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
      const message = asNonEmptyString(input.message, "hello agent");
      return {
        message,
        echoedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: "research-brief",
    name: "Research Brief (Paid)",
    description:
      "Paid endpoint that returns concise market-style briefings for agents.",
    endpoint: "/agent/services/research-brief/invoke",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        audience: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        audience: { type: "string" },
        insight: { type: "string" },
        nextActions: { type: "array", items: { type: "string" } },
      },
    },
    payment: {
      scheme: "exact",
      network: defaultNetwork,
      asset: "USDC",
      amount: "0.01",
      payTo: defaultPayToAddress,
    },
    handler: (input) => {
      const topic = asNonEmptyString(input.topic, "agent infrastructure");
      const audience = asNonEmptyString(input.audience, "builders");

      return {
        topic,
        audience,
        insight:
          "x402 can gate agent APIs with native HTTP 402 payment negotiation.",
        nextActions: [
          "Expose explicit pricing metadata in service discovery responses.",
          "Return HTTP 402 + payment instructions when signature is missing.",
          "Retry the same call after wallet settlement with PAYMENT-SIGNATURE.",
        ],
      };
    },
  },
];

const getService = (serviceId: string): AgentService | undefined =>
  agentServices.find((service) => service.id === serviceId);

const removeTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

export const listAgentServices = (): AgentServiceDescriptor[] =>
  agentServices.map(({ handler: _handler, ...descriptor }) => descriptor);

export const getAgentServiceDescriptor = (
  serviceId: string
): AgentServiceDescriptor | undefined => {
  const service = getService(serviceId);
  if (!service) {
    return undefined;
  }

  const { handler: _handler, ...descriptor } = service;
  return descriptor;
};

export const invokeAgentService = (
  serviceId: string,
  input: Record<string, unknown>
): Record<string, unknown> | undefined => {
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

export const buildPaymentRequiredPayload = (
  serviceId: string
): PaymentRequiredPayload | undefined => {
  const service = getService(serviceId);
  if (!service?.payment) {
    return undefined;
  }

  return {
    version: "x402-1",
    serviceId: service.id,
    endpoint: service.endpoint,
    accepted: [service.payment],
    note: "Retry the same request with a valid PAYMENT-SIGNATURE header.",
  };
};

export const buildPaymentResponsePayload = (
  serviceId: string,
  paymentSignature: string
): PaymentResponsePayload | undefined => {
  const service = getService(serviceId);
  if (!service?.payment) {
    return undefined;
  }

  return {
    version: "x402-1",
    serviceId: service.id,
    status: "settled",
    settledAt: new Date().toISOString(),
    paymentReference: paymentSignature.slice(0, 20),
  };
};

export const verifyPaymentSignature = (paymentSignature: string): boolean => {
  const normalized = paymentSignature.trim();
  return normalized.startsWith("x402_demo_") && normalized.length >= 14;
};

export const toBase64Json = (payload: unknown): string =>
  Buffer.from(JSON.stringify(payload)).toString("base64");
