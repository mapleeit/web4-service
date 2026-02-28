export interface AgentServiceDescriptor {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  payment?: {
    scheme: string;
    network: string;
    asset: string;
    price: string;
    payTo: string;
    facilitator: string;
  };
  paymentOptions?: Array<{
    scheme: string;
    network: string;
    asset: string;
    price: string;
    payTo: string;
    facilitator: string;
  }>;
}

export interface ServicesResponse {
  protocol: string;
  x402Enabled: boolean;
  services: AgentServiceDescriptor[];
}

export interface InvokeResponse {
  serviceId: string;
  output: Record<string, unknown>;
}

export interface InvokeResult {
  status: number;
  body: unknown;
}

export async function fetchServices(): Promise<ServicesResponse> {
  const res = await fetch("/agent/services");
  if (!res.ok) {
    throw new Error(`Failed to fetch services: ${res.status}`);
  }
  return res.json() as Promise<ServicesResponse>;
}

export interface InvokeRawResult {
  response: Response;
  status: number;
  body: unknown;
}

export async function invokeServiceRaw(
  serviceId: string,
  input: Record<string, unknown>,
): Promise<InvokeRawResult> {
  const res = await fetch(`/agent/services/${serviceId}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => null);
  return { response: res, status: res.status, body };
}

export async function invokeService(
  serviceId: string,
  input: Record<string, unknown>,
): Promise<InvokeResult> {
  const { status, body } = await invokeServiceRaw(serviceId, input);
  return { status, body };
}
