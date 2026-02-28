import { useEffect, useState } from "react";
import {
  fetchServices,
  invokeService,
  type AgentServiceDescriptor,
  type InvokeResult,
} from "../lib/api";

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
};

export default function Playground() {
  const [services, setServices] = useState<AgentServiceDescriptor[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  };

  const handleSend = async () => {
    if (!selectedId) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const parsed = JSON.parse(input) as Record<string, unknown>;
      const res = await invokeService(selectedId, parsed);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: number) => {
    if (status >= 200 && status < 300) return "text-emerald-400";
    if (status === 402) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <section id="playground" className="border-t border-[var(--color-border)] px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            API Playground
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Test agent services live. Select a service, edit the payload, and send.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] glow">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] p-4">
            <select
              value={selectedId}
              onChange={(e) => handleServiceChange(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {selectedId && services.find((s) => s.id === selectedId)?.payment && (
              <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-400">
                Paid — {services.find((s) => s.id === selectedId)!.payment!.price}
              </span>
            )}

            <button
              onClick={handleSend}
              disabled={loading || !selectedId}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-violet-500 disabled:opacity-50"
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

          {/* Editor */}
          <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--color-border)]">
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

            <div className="border-t border-[var(--color-border)] p-4 lg:border-t-0">
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
                {!result && !error && (
                  <p className="text-sm text-zinc-600">
                    Response will appear here...
                  </p>
                )}
                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}
                {result && (
                  <pre className="font-mono text-sm leading-relaxed text-zinc-300">
                    {JSON.stringify(result.body, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
