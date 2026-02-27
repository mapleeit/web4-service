import { useState } from "react";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Services", href: "#services" },
  { label: "Playground", href: "#playground" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-[var(--color-border)] bg-[#09090b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="gradient-text">W4</span>
          <span className="text-zinc-100">web4-service</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {link.label}
            </a>
          ))}
          <a
            href="https://github.com/mapleeit/web4-service"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
          >
            GitHub
          </a>
        </nav>

        <button
          className="flex flex-col gap-1 md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-5 bg-zinc-400 transition-transform ${mobileOpen ? "translate-y-1.5 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-5 bg-zinc-400 transition-opacity ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-5 bg-zinc-400 transition-transform ${mobileOpen ? "-translate-y-1.5 -rotate-45" : ""}`} />
        </button>
      </div>

      {mobileOpen && (
        <nav className="border-t border-[var(--color-border)] bg-[#09090b]/95 px-6 py-4 backdrop-blur-xl md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {link.label}
            </a>
          ))}
          <a
            href="https://github.com/mapleeit/web4-service"
            target="_blank"
            rel="noopener noreferrer"
            className="block py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
          >
            GitHub
          </a>
        </nav>
      )}
    </header>
  );
}
