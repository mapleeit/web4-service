import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";

const DEFAULT_BASE_URL = "https://web4svc.com";

interface ServiceDescriptor {
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
}

interface ServicesResponse {
  services: ServiceDescriptor[];
}

function getBaseUrl(): string {
  return process.env.WEB4_SERVICE_URL?.trim() || DEFAULT_BASE_URL;
}

function getWalletPrivateKey(): string | undefined {
  return process.env.WEB4_WALLET_PRIVATE_KEY?.trim() || undefined;
}

function resolveChain(network: string) {
  if (network === "eip155:8453") return base;
  if (network === "eip155:1") return mainnet;

  if (!network.startsWith("eip155:")) {
    throw new Error(`Unsupported network: ${network}`);
  }

  const chainId = Number(network.slice("eip155:".length));
  return {
    id: chainId,
    name: network,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://ethereum-rpc.publicnode.com"] },
    },
  } as const;
}

function buildHttpClient(network: string): x402HTTPClient {
  const privateKey = getWalletPrivateKey();
  if (!privateKey) {
    throw new Error(
      "WEB4_WALLET_PRIVATE_KEY is required for paid services. " +
        "Set it to an EVM wallet private key with USDC balance."
    );
  }

  const normalized = (
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ) as `0x${string}`;
  const account = privateKeyToAccount(normalized);

  const chain = resolveChain(network);
  const rpcUrl =
    process.env.WEB4_RPC_URL?.trim() ||
    (network === "eip155:8453"
      ? "https://mainnet.base.org"
      : "https://ethereum-rpc.publicnode.com");

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const signer = toClientEvmSigner(account, publicClient);
  const client = new x402Client().register(
    network as `${string}:${string}`,
    new ExactEvmScheme(signer)
  );

  return new x402HTTPClient(client);
}

export async function listServices(): Promise<ServiceDescriptor[]> {
  const url = `${getBaseUrl()}/agent/services`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch services: HTTP ${res.status}`);
  }

  const data = (await res.json()) as ServicesResponse;
  return data.services;
}

export async function invokeService(
  serviceId: string,
  input: Record<string, unknown>
): Promise<{ serviceId: string; output: Record<string, unknown> }> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/agent/services/${serviceId}/invoke`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (res.status === 402) {
    return handlePaymentAndRetry(url, input, res);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as Record<string, unknown>).message ||
      (body as Record<string, unknown>).error ||
      `HTTP ${res.status}`;
    throw new Error(`Service error: ${String(msg)}`);
  }

  return (await res.json()) as {
    serviceId: string;
    output: Record<string, unknown>;
  };
}

async function handlePaymentAndRetry(
  url: string,
  input: Record<string, unknown>,
  initialResponse: Response
): Promise<{ serviceId: string; output: Record<string, unknown> }> {
  const parser = new x402HTTPClient(new x402Client());
  const paymentRequired = parser.getPaymentRequiredResponse(
    (name: string) => initialResponse.headers.get(name),
    await initialResponse.json().catch(() => undefined)
  );

  const accepts = Array.isArray(paymentRequired.accepts)
    ? paymentRequired.accepts
    : [];
  if (accepts.length === 0) {
    throw new Error("Server returned 402 but no payment options found.");
  }

  const preferredNetwork =
    process.env.WEB4_PREFERRED_NETWORK?.trim() || "eip155:8453";
  const selected =
    accepts.find(
      (a: Record<string, unknown>) => a.network === preferredNetwork
    ) ?? accepts[0];
  const network = (selected as Record<string, unknown>).network as string;

  const httpClient = buildHttpClient(network);
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  const paidRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...paymentHeaders,
    },
    body: JSON.stringify(input),
  });

  if (!paidRes.ok) {
    const body = await paidRes.json().catch(() => ({}));
    const msg =
      (body as Record<string, unknown>).message ||
      (body as Record<string, unknown>).error ||
      `HTTP ${paidRes.status}`;
    throw new Error(`Paid request failed: ${String(msg)}`);
  }

  return (await paidRes.json()) as {
    serviceId: string;
    output: Record<string, unknown>;
  };
}
