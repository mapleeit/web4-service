import { useState } from "react";

export default function Hero() {
  const [copied, setCopied] = useState(false);
  const serviceUrl = "GET /agent/services";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(serviceUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/4 translate-y-1/4 rounded-full bg-violet-500/10 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-medium text-zinc-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          x402 Protocol
        </div>

        <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          <span className="gradient-text">x402-Powered</span>
          <br />
          Agent Services
        </h1>

        <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-zinc-400">
          Pay-per-call AI agent services with multi-chain EVM payment support.
          No API keys needed — just standard HTTP with built-in micropayments.
        </p>

        <div className="mb-8 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-zinc-900/60 px-5 py-3 font-mono text-sm">
            <span className="text-zinc-500">$</span>
            <code className="text-zinc-200">{serviceUrl}</code>
            <button
              onClick={handleCopy}
              className="ml-2 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-zinc-400 transition-all hover:border-[var(--color-border-hover)] hover:text-zinc-200"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="#playground"
            className="gradient-border inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-violet-500 hover:shadow-lg hover:shadow-indigo-500/20"
          >
            Try the Playground
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
          <a
            href="https://docs.payai.network/x402/quickstart"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-[var(--color-border-hover)] hover:text-white"
          >
            View Docs
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
