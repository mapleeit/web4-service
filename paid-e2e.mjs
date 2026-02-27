import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, mainnet } from "viem/chains";

const DEFAULT_BASE_URL = "https://web4-service-production.up.railway.app";
const DEFAULT_ENDPOINT = "/agent/services/perplexity-search/invoke";
const DEFAULT_QUERY = "latest x402 updates";
const SIGNATURE_SKEW_WARNING_SECONDS = 300;

const asNonEmptyString = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizePrivateKey = (rawPrivateKey) => {
  const normalized = rawPrivateKey.startsWith("0x")
    ? rawPrivateKey
    : `0x${rawPrivateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(
      "TEST_WALLET_PRIVATE_KEY must be a 32-byte hex key (64 hex chars, optional 0x prefix)."
    );
  }

  return normalized;
};

const decodeBase64JsonHeader = (headerValue) => {
  if (!headerValue) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(headerValue, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return undefined;
  }
};

const toSafeJson = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const resolveTargetUrl = () => {
  const explicit = asNonEmptyString(process.env.TARGET_URL);
  if (explicit) {
    return explicit;
  }

  const baseUrl = asNonEmptyString(process.env.TARGET_BASE_URL) ?? DEFAULT_BASE_URL;
  const endpoint = asNonEmptyString(process.env.TARGET_ENDPOINT) ?? DEFAULT_ENDPOINT;
  return new URL(endpoint, baseUrl).toString();
};

const resolveRpcUrl = (network) => {
  if (network === "eip155:84532") {
    return (
      asNonEmptyString(process.env.BASE_SEPOLIA_RPC_URL) ??
      asNonEmptyString(process.env.RPC_URL) ??
      "https://sepolia.base.org"
    );
  }

  if (network === "eip155:8453") {
    return (
      asNonEmptyString(process.env.BASE_RPC_URL) ??
      asNonEmptyString(process.env.RPC_URL) ??
      "https://mainnet.base.org"
    );
  }

  if (network === "eip155:1") {
    return (
      asNonEmptyString(process.env.ETHEREUM_RPC_URL) ??
      asNonEmptyString(process.env.RPC_URL) ??
      "https://ethereum-rpc.publicnode.com"
    );
  }

  const genericRpcUrl = asNonEmptyString(process.env.RPC_URL);
  if (!genericRpcUrl) {
    throw new Error(
      `No RPC configured for ${network}. Set RPC_URL (or a network-specific RPC env var).`
    );
  }

  return genericRpcUrl;
};

const resolveChain = (network, rpcUrl) => {
  if (network === "eip155:84532") {
    return baseSepolia;
  }

  if (network === "eip155:8453") {
    return base;
  }

  if (network === "eip155:1") {
    return mainnet;
  }

  if (!network.startsWith("eip155:")) {
    throw new Error(`Unsupported network format: ${network}. Expected eip155:<chainId>.`);
  }

  const chainId = Number(network.slice("eip155:".length));
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid eip155 chain id in network: ${network}`);
  }

  return {
    id: chainId,
    name: network,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };
};

const readBody = async (response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const parseServerClockSkewSeconds = (serverDateHeader) => {
  if (!serverDateHeader) {
    return undefined;
  }

  const serverTimeMs = Date.parse(serverDateHeader);
  if (Number.isNaN(serverTimeMs)) {
    return undefined;
  }

  return Math.round((Date.now() - serverTimeMs) / 1000);
};

const main = async () => {
  const privateKey = asNonEmptyString(process.env.TEST_WALLET_PRIVATE_KEY);
  if (!privateKey) {
    throw new Error("Missing TEST_WALLET_PRIVATE_KEY.");
  }

  const targetUrl = resolveTargetUrl();
  const query = asNonEmptyString(process.env.QUERY) ?? DEFAULT_QUERY;
  const model = asNonEmptyString(process.env.MODEL);
  const requestBody = JSON.stringify({
    query,
    ...(model ? { model } : {}),
  });

  console.log(`[1/4] Unpaid request -> ${targetUrl}`);
  let response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });
  const unpaidBody = await readBody(response);
  console.log(`      status=${response.status}`);
  const serverClockSkewSeconds = parseServerClockSkewSeconds(
    response.headers.get("date")
  );
  if (typeof serverClockSkewSeconds === "number") {
    console.log(`      local_clock_skew_seconds=${serverClockSkewSeconds}`);
    if (Math.abs(serverClockSkewSeconds) > SIGNATURE_SKEW_WARNING_SECONDS) {
      console.warn(
        `WARN local clock skew > ${SIGNATURE_SKEW_WARNING_SECONDS}s; x402 signatures may be rejected as expired/not-yet-valid.`
      );
    }
  }

  if (response.status !== 402) {
    throw new Error(
      `Expected unpaid call to return 402, got ${response.status}. Body: ${JSON.stringify(
        unpaidBody
      )}`
    );
  }

  const parser = new x402HTTPClient(new x402Client());
  const paymentRequired = parser.getPaymentRequiredResponse(
    (headerName) => response.headers.get(headerName),
    unpaidBody
  );

  const selectedPayment = paymentRequired.accepts?.[0];
  if (!selectedPayment) {
    throw new Error("No payment options found in payment-required response.");
  }

  const rpcUrl = resolveRpcUrl(selectedPayment.network);
  const chain = resolveChain(selectedPayment.network, rpcUrl);
  console.log(
    `[2/4] Payment required: network=${selectedPayment.network}, amount=${selectedPayment.amount}, payTo=${selectedPayment.payTo}`
  );
  console.log(`      using_rpc=${rpcUrl}`);

  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  console.log(`      payer=${account.address}`);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const signer = toClientEvmSigner(account, publicClient);
  const httpClient = new x402HTTPClient(
    new x402Client().register("eip155:*", new ExactEvmScheme(signer))
  );

  console.log("[3/4] Creating payment payload...");
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
  console.log(`      header_keys=${Object.keys(paymentHeaders).join(",")}`);
  if (
    paymentPayload?.payload &&
    typeof paymentPayload.payload === "object" &&
    "authorization" in paymentPayload.payload
  ) {
    const authorization = paymentPayload.payload.authorization;
    console.log(
      `      authorization_window=${authorization.validAfter}->${authorization.validBefore}`
    );
  }

  console.log("[4/4] Paid retry...");
  response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...paymentHeaders,
    },
    body: requestBody,
  });
  const paidBody = await readBody(response);
  console.log(`      status=${response.status}`);

  if (response.status !== 200) {
    const paymentRequiredHeader = response.headers.get("payment-required");
    const decodedPaymentRequired = decodeBase64JsonHeader(paymentRequiredHeader);
    if (paymentRequiredHeader) {
      console.log("      paid_retry_payment_required_header_present=true");
      if (decodedPaymentRequired) {
        console.log(
          `      paid_retry_payment_required_decoded=${toSafeJson(
            decodedPaymentRequired
          )}`
        );
      }
    }
    const paymentResponseHeader = response.headers.get("payment-response");
    if (paymentResponseHeader) {
      console.log("      paid_retry_payment_response_header_present=true");
      const decodedPaymentResponse = decodeBase64JsonHeader(paymentResponseHeader);
      if (decodedPaymentResponse) {
        console.log(
          `      paid_retry_payment_response_decoded=${toSafeJson(
            decodedPaymentResponse
          )}`
        );
      }
    }

    throw new Error(
      `Expected paid retry to return 200, got ${response.status}. Body: ${JSON.stringify(
        paidBody
      )}`
    );
  }

  const settlement = httpClient.getPaymentSettleResponse((headerName) =>
    response.headers.get(headerName)
  );

  const answer =
    typeof paidBody?.output?.answer === "string" ? paidBody.output.answer : "";
  const citations = Array.isArray(paidBody?.output?.citations)
    ? paidBody.output.citations.length
    : 0;

  console.log(
    `SUCCESS serviceId=${paidBody.serviceId}, model=${paidBody?.output?.model}, citations=${citations}`
  );
  console.log(
    `ANSWER_PREVIEW ${answer.slice(0, 180).replaceAll("\n", " ")}${
      answer.length > 180 ? "..." : ""
    }`
  );
  console.log(`SETTLEMENT ${JSON.stringify(settlement)}`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAILED ${message}`);
  process.exitCode = 1;
});
