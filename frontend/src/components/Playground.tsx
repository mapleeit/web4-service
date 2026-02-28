import { useEffect, useState, useCallback } from "react";
import {
  fetchServices,
  invokeServiceRaw,
  type AgentServiceDescriptor,
  type InvokeResult,
} from "../lib/api";
import {
  hasWalletProvider,
  connectWallet,
  truncateAddress,
} from "../lib/wallet";
import {
  parsePaymentRequired,
  payAndRetry,
  type PaymentInfo,
  type SettlementInfo,
} from "../lib/x402";

const DEFAULT_INPUTS: Record<string, string> = {
  echo: JSON.stringify({ message: "hello agent" }, null, 2),
  "perplexity-search": JSON.stringify(
    { query: "What is the x402 payment protocol?" },
    null,
    2,
  ),
  "token-price": JSON.stringify(
    { token: "bitcoin", currency: "usd" },
    null,
    2,
  ),
  "ens-resolve": JSON.stringify({ name: "vitalik.eth" }, null, 2),
  "erc20-balance": JSON.stringify(
    { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chain: "ethereum" },
    null,
    2,
  ),
};

type ParsedPayment = ReturnType<typeof parsePaymentRequired>;

function explorerTxUrl(network: string, txHash: string): string {
  if (network.includes("8453")) return `https://basescan.org/tx/${txHash}`;
  if (network.includes(":1")) return `https://etherscan.io/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

export default function Playground() {
  const [services, setServices] = useState<AgentServiceDescriptor[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [walletAddress, setWalletAddress] = useState<`0x${string}` | null>(null);
  const [pendingPayment, setPendingPayment] = useState<ParsedPayment>(null);
  const [pendingInput, setPendingInput] = useState<Record<string, unknown> | null>(null);
  const [paying, setPaying] = useState(false);

  const [settlement, setSettlement] = useState<SettlementInfo | null>(null);
  const [walletPrompt, setWalletPrompt] = useState(false);

  useEffect(() => {
    fetchServices()
      .then((data) => {
        setServices(data.services);
        if (data.services.length > 0 && data.services[0]) {
          const first = data.services[0];
          setSelectedId(first.id);
          setInput(DEFAULT_INPUTS[first.id] ?? "{}");
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!settlement) return;
    const timer = setTimeout(() => setSettlement(null), 8000);
    return () => clearTimeout(timer);
  }, [settlement]);

  const handleServiceChange = (id: string) => {
    setSelectedId(id);
    setInput(DEFAULT_INPUTS[id] ?? "{}");
    setResult(null);
    setError(null);
    setPendingPayment(null);
    setPendingInput(null);
    setSettlement(null);
  };

  const handleConnect = useCallback(async () => {
    if (!hasWalletProvider()) {
      setWalletPrompt(true);
      setTimeout(() => setWalletPrompt(false), 4000);
      return;
    }
    try {
      const addr = await connectWallet();
      setWalletAddress(addr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed");
    }
  }, []);

  const handleSend = async () => {
    if (!selectedId) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setPendingPayment(null);
    setPendingInput(null);
    setSettlement(null);

    try {
      const parsed = JSON.parse(input) as Record<string, unknown>;
      const raw = await invokeServiceRaw(selectedId, parsed);

      if (raw.status === 402) {
        const payment = parsePaymentRequired(raw.response, raw.body);
        if (payment) {
          setPendingPayment(payment);
          setPendingInput(parsed);
          setResult({ status: raw.status, body: raw.body });
        } else {
          setResult({ status: raw.status, body: raw.body });
        }
      } else {
        setResult({ status: raw.status, body: raw.body });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePayAndSend = async () => {
    if (!pendingPayment || !pendingInput || !selectedId) return;

    setPaying(true);
    setError(null);

    try {
      let address = walletAddress;
      if (!address) {
        address = await connectWallet();
        setWalletAddress(address);
      }

      const paidResult = await payAndRetry(
        selectedId,
        pendingInput,
        address,
        pendingPayment,
      );
      setResult(paidResult);
      setPendingPayment(null);
      setPendingInput(null);
      if (paidResult.settlement) {
        setSettlement(paidResult.settlement);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const statusColor = (status: number) => {
    if (status >= 200 && status < 300) return "text-emerald-400";
    if (status === 402) return "text-amber-400";
    return "text-red-400";
  };

  const selectedService = services.find((s) => s.id === selectedId);
  const isPaid = !!selectedService?.payment;

  return (
    <section id="playground" className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            API Playground
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Test agent services live. Select a service, edit the payload, and
            send.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface glow">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <select
              value={selectedId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className="rounded-md border border-border bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {isPaid && (
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400">
                Paid — {selectedService!.payment!.price}
              </span>
            )}

            <div className="ml-auto flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={handleConnect}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    walletAddress
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-border text-zinc-400 hover:border-violet-500/40 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${walletAddress ? "bg-emerald-400" : "bg-zinc-600"}`}
                  />
                  {walletAddress
                    ? truncateAddress(walletAddress)
                    : "Connect Wallet"}
                </button>
                {walletPrompt && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-border bg-zinc-900 p-3 text-xs text-zinc-400 shadow-xl">
                    Install{" "}
                    <a
                      href="https://metamask.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-violet-400 underline"
                    >
                      MetaMask
                    </a>{" "}
                    or any EVM wallet to pay for services.
                  </div>
                )}
              </div>

              <button
                onClick={handleSend}
                disabled={loading || !selectedId}
                className="inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-blue-600 to-violet-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-violet-500 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Request
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Settlement toast */}
          {settlement && (
            <div className="flex items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
              <svg
                className="h-4 w-4 shrink-0 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-xs font-medium text-emerald-400">
                Payment settled
              </span>
              {settlement.transaction && (
                <a
                  href={explorerTxUrl(
                    settlement.network,
                    settlement.transaction,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-zinc-500 transition-colors hover:text-emerald-400"
                >
                  {settlement.transaction.slice(0, 10)}...
                  {settlement.transaction.slice(-6)}
                </a>
              )}
              <button
                onClick={() => setSettlement(null)}
                className="ml-auto text-zinc-600 hover:text-zinc-400"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}

          {/* Editor */}
          <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-border">
            <div className="p-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Request Body
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                className="h-48 w-full resize-none rounded-lg bg-zinc-900/60 p-4 font-mono text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-blue-500/40"
                placeholder='{"message": "hello"}'
              />
            </div>

            <div className="border-t border-border p-4 lg:border-t-0">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Response
                </span>
                {result && (
                  <span
                    className={`text-xs font-bold ${statusColor(result.status)}`}
                  >
                    {result.status}
                  </span>
                )}
              </div>

              <div className="h-48 overflow-auto rounded-lg bg-zinc-900/60 p-4">
                {pendingPayment && result?.status === 402 ? (
                  <PaymentPanel
                    info={pendingPayment.info}
                    paying={paying}
                    hasWallet={hasWalletProvider()}
                    onPay={handlePayAndSend}
                  />
                ) : !result && !error ? (
                  <p className="text-sm text-zinc-600">
                    Response will appear here...
                  </p>
                ) : error ? (
                  <p className="text-sm text-red-400">{error}</p>
                ) : result ? (
                  <ResultDisplay
                    serviceId={selectedId}
                    status={result.status}
                    body={result.body}
                  />
                ) : null}

                {error && pendingPayment && (
                  <div className="mt-3">
                    <button
                      onClick={handlePayAndSend}
                      disabled={paying}
                      className="text-xs font-medium text-violet-400 underline hover:text-violet-300"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Payment Panel ─────────────────────────────────────────────── */

function PaymentPanel({
  info,
  paying,
  hasWallet,
  onPay,
}: {
  info: PaymentInfo;
  paying: boolean;
  hasWallet: boolean;
  onPay: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
        Payment Required
      </div>

      <div className="text-lg font-semibold text-zinc-200">
        {info.price} USDC
        <span className="ml-2 text-sm font-normal text-zinc-500">
          on {info.chainName}
        </span>
      </div>

      {hasWallet ? (
        <button
          onClick={onPay}
          disabled={paying}
          className="inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-purple-500 disabled:opacity-50"
        >
          {paying ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing payment...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Pay &amp; Send
            </>
          )}
        </button>
      ) : (
        <p className="text-sm text-zinc-500">
          Install MetaMask to pay for this service.
        </p>
      )}
    </div>
  );
}

/* ── Rich Result Display ───────────────────────────────────────── */

function ResultDisplay({
  serviceId,
  status,
  body,
}: {
  serviceId: string;
  status: number;
  body: unknown;
}) {
  if (status < 200 || status >= 300 || !body || typeof body !== "object") {
    return <RawJson body={body} />;
  }

  const data = body as Record<string, unknown>;
  const output = data.output as Record<string, unknown> | undefined;
  if (!output) return <RawJson body={body} />;

  switch (serviceId) {
    case "echo":
      return <EchoResult output={output} />;
    case "token-price":
      return <TokenPriceResult output={output} />;
    case "perplexity-search":
      return <SearchResult output={output} />;
    case "ens-resolve":
      return <EnsResult output={output} />;
    case "erc20-balance":
      return <BalanceResult output={output} />;
    default:
      return <RawJson body={body} />;
  }
}

function RawJson({ body }: { body: unknown }) {
  return (
    <pre className="font-mono text-sm leading-relaxed text-zinc-300">
      {JSON.stringify(body, null, 2)}
    </pre>
  );
}

function EchoResult({ output }: { output: Record<string, unknown> }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <p className="text-base text-zinc-200">
        &ldquo;{String(output.message)}&rdquo;
      </p>
      <p className="text-xs text-zinc-500">
        {new Date(String(output.echoedAt)).toLocaleString()}
      </p>
    </div>
  );
}

function TokenPriceResult({ output }: { output: Record<string, unknown> }) {
  const price = Number(output.price);
  const change = output.change24h != null ? Number(output.change24h) : null;
  const marketCap = output.marketCap != null ? Number(output.marketCap) : null;
  const volume = output.volume24h != null ? Number(output.volume24h) : null;

  const fmt = (n: number) => {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString()}`;
  };

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase text-zinc-500">
          {String(output.symbol)}
        </span>
        <span className="text-sm text-zinc-400">{String(output.name)}</span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold text-zinc-100">
          ${price < 1 ? price.toPrecision(4) : price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        {change !== null && (
          <span
            className={`text-sm font-semibold ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {change >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(change).toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex gap-4 text-xs text-zinc-500">
        {marketCap !== null && <span>MCap {fmt(marketCap)}</span>}
        {volume !== null && <span>Vol {fmt(volume)}</span>}
      </div>
    </div>
  );
}

function SearchResult({ output }: { output: Record<string, unknown> }) {
  const answer = String(output.answer ?? "");
  const citations = Array.isArray(output.citations)
    ? (output.citations as string[])
    : [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
        {answer}
      </p>
      {citations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {citations.map((url, i) => {
            let label: string;
            try {
              label = new URL(url).hostname.replace("www.", "");
            } catch {
              label = url;
            }
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-border bg-zinc-800/60 px-2.5 py-0.5 text-[11px] text-zinc-400 transition-colors hover:border-blue-500/40 hover:text-blue-400"
              >
                <span className="text-zinc-600">[{i + 1}]</span> {label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EnsResult({ output }: { output: Record<string, unknown> }) {
  const name = output.name ? String(output.name) : null;
  const address = output.address ? String(output.address) : null;
  const avatar = output.avatar ? String(output.avatar) : null;
  const records =
    output.records && typeof output.records === "object"
      ? (output.records as Record<string, string | null>)
      : {};

  const visibleRecords = Object.entries(records).filter(
    ([, v]) => v !== null && v !== "",
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {avatar && (
          <img
            src={avatar}
            alt=""
            className="h-10 w-10 rounded-full border border-border"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div>
          {name && (
            <p className="text-sm font-semibold text-zinc-200">{name}</p>
          )}
          {address && (
            <p className="font-mono text-xs text-zinc-500">
              {address.slice(0, 10)}...{address.slice(-8)}
            </p>
          )}
        </div>
      </div>

      {visibleRecords.length > 0 && (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {visibleRecords.map(([key, val]) => (
            <div key={key} className="contents">
              <span className="text-zinc-500">{key}</span>
              <span className="truncate text-zinc-300">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BalanceResult({ output }: { output: Record<string, unknown> }) {
  const formatted = String(output.formatted ?? "0");
  const symbol = String(output.symbol ?? "");
  const name = String(output.name ?? "");
  const chain = String(output.chain ?? "");
  const address = output.address ? String(output.address) : null;
  const token = output.token ? String(output.token) : null;
  const isNative = token === "native";

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase text-zinc-500">
          {symbol}
        </span>
        <span className="text-sm text-zinc-400">{name}</span>
        <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-zinc-500">
          {chain}
        </span>
      </div>

      <div className="text-2xl font-bold text-zinc-100">
        {Number(formatted) < 0.0001 && Number(formatted) > 0
          ? `< 0.0001 ${symbol}`
          : `${Number(formatted).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`}
      </div>

      <div className="flex flex-col gap-1 text-xs text-zinc-500">
        {address && (
          <span>
            Wallet: <span className="font-mono">{address.slice(0, 10)}...{address.slice(-6)}</span>
          </span>
        )}
        {!isNative && token && (
          <span>
            Contract: <span className="font-mono">{token.slice(0, 10)}...{token.slice(-6)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
