export default function Footer() {
  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <img src="/favicon.svg" alt="web4-service" className="h-6 w-6 rounded" />
          <span>web4-service</span>
          <span className="mx-2">·</span>
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            x402
          </span>
        </div>

        <div className="flex items-center gap-6">
          <a
            href="https://github.com/mapleeit/web4-service"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            GitHub
          </a>
          <a
            href="https://facilitator.payai.network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Facilitator
          </a>
        </div>
      </div>
    </footer>
  );
}
