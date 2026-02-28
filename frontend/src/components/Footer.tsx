export default function Footer() {
  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
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
