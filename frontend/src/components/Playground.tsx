import { useEffect, useState } from "react";
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
  "ens-resolve": JSON.stringify(
    { name: "vitalik.eth" },
    null,
    2,
  ),
};

type ParsedPayment = ReturnType<typeof parsePaymentRequired>;

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

  const handleServiceChange = (id: string) => {
    setSelectedId(id);
    setInput(DEFAULT_INPUTS[id] ?? "{}");
    setResult(null);
    setError(null);
    setPendingPayment(null);
    setPendingInput(null);
  };

  const handleConnect = async () => {
    try {
      const addr = await connectWallet();
      setWalletAddress(addr);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed");
    }
  };

  const handleSend = async () => {
    if (!selectedId) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setPendingPayment(null);
    setPendingInput(null);

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
        pendingPayment
      );
      setResult(paidResult);
      setPendingPayment(null);
      setPendingInput(null);
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
            Test agent services live. Select a service, edit the payload, and send.
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
              {hasWalletProvider() && (
                <button
                  onClick={handleConnect}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    walletAddress
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-border text-zinc-400 hover:border-violet-500/40 hover:text-zinc-200"
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${walletAddress ? "bg-emerald-400" : "bg-zinc-600"}`} />
                  {walletAddress ? truncateAddress(walletAddress) : "Connect Wallet"}
                </button>
              )}

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
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

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
                  <span className={`text-xs font-bold ${statusColor(result.status)}`}>
                    {result.status}
                  </span>
                )}
              </div>

              <div className="h-48 overflow-auto rounded-lg bg-zinc-900/60 p-4">
                {/* Payment panel — shown when 402 with parseable payment info */}
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
                  <pre className="font-mono text-sm leading-relaxed text-zinc-300">
                    {JSON.stringify(result.body, null, 2)}
                  </pre>
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
        <span className="ml-2 text-sm font-normal text-zinc-500">on {info.chainName}</span>
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
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Pay & Send
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
