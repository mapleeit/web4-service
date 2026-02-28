import { getAddress, toHex } from "viem";
import type { InvokeResult } from "./api";
import {
  networkToChainId,
  chainIdToChain,
  switchChain,
  getWalletClient,
} from "./wallet";

export interface PaymentInfo {
  price: string;
  network: string;
  chainId: number;
  chainName: string;
}

interface PaymentRequirements {
  x402Version: number;
  resource: { url: string; description: string; mimeType: string };
  accepts: PaymentAccept[];
}

interface PaymentAccept {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string };
}

interface ParsedPaymentRequired {
  requirements: PaymentRequirements;
  selected: PaymentAccept;
  info: PaymentInfo;
}

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function chainName(chainId: number): string {
  if (chainId === 8453) return "Base";
  if (chainId === 1) return "Ethereum";
  return `Chain ${chainId}`;
}

function formatUSDC(rawAmount: string): string {
  const num = parseFloat(rawAmount) / 1e6;
  if (num < 0.01) return `$${num}`;
  return `$${num.toFixed(2)}`;
}

function safeBase64Decode(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64);
}

function safeBase64Encode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parsePaymentRequired(
  response: Response,
  _body: unknown
): ParsedPaymentRequired | null {
  if (response.status !== 402) return null;

  try {
    const header = response.headers.get("PAYMENT-REQUIRED");
    if (!header) return null;

    const requirements = JSON.parse(safeBase64Decode(header)) as PaymentRequirements;
    const accepts = requirements.accepts;
    if (!accepts || accepts.length === 0) return null;

    const selected = accepts[0]!;
    const cId = networkToChainId(selected.network);

    return {
      requirements,
      selected,
      info: {
        price: formatUSDC(selected.amount),
        network: selected.network,
        chainId: cId,
        chainName: chainName(cId),
      },
    };
  } catch {
    return null;
  }
}

export async function payAndRetry(
  serviceId: string,
  input: Record<string, unknown>,
  walletAddress: `0x${string}`,
  parsed: ParsedPaymentRequired
): Promise<InvokeResult> {
  const { requirements, selected } = parsed;
  const cId = networkToChainId(selected.network);
  const chain = chainIdToChain(cId);

  await switchChain(cId);

  const walletClient = getWalletClient(chain);

  const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);

  const authorization = {
    from: walletAddress,
    to: getAddress(selected.payTo),
    value: selected.amount,
    validAfter: (now - 600).toString(),
    validBefore: (now + selected.maxTimeoutSeconds).toString(),
    nonce,
  };

  if (!selected.extra?.name || !selected.extra?.version) {
    throw new Error("Payment requirements missing EIP-712 domain parameters (asset name/version).");
  }

  const domain = {
    name: selected.extra.name,
    version: selected.extra.version,
    chainId: BigInt(cId),
    verifyingContract: getAddress(selected.asset),
  };

  const message = {
    from: getAddress(authorization.from),
    to: getAddress(authorization.to),
    value: BigInt(authorization.value),
    validAfter: BigInt(authorization.validAfter),
    validBefore: BigInt(authorization.validBefore),
    nonce: authorization.nonce as `0x${string}`,
  };

  const signature = await walletClient.signTypedData({
    account: walletAddress,
    domain,
    types: AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });

  const paymentPayload = {
    x402Version: requirements.x402Version,
    payload: { authorization, signature },
    resource: requirements.resource,
    accepted: selected,
  };

  const encodedPayment = safeBase64Encode(JSON.stringify(paymentPayload));

  const url = `/agent/services/${serviceId}/invoke`;
  const paidRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": encodedPayment,
    },
    body: JSON.stringify(input),
  });

  const paidBody = await paidRes.json().catch(() => null);
  return { status: paidRes.status, body: paidBody };
}
