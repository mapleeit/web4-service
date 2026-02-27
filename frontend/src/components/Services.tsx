import { useEffect, useState } from "react";
import { fetchServices, type AgentServiceDescriptor } from "../lib/api";

export default function Services() {
  const [services, setServices] = useState<AgentServiceDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServices()
      .then((data) => setServices(data.services))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="services" className="border-t border-[var(--color-border)] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Agent Services
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-zinc-400">
            Discoverable, invocable services — fetched live from the API.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-md rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
            Failed to load services: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="grid gap-6 lg:grid-cols-2">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ServiceCard({ service }: { service: AgentServiceDescriptor }) {
  const isPaid = !!service.payment;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-all duration-300 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-hover)]">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{service.name}</h3>
          <p className="mt-1 text-sm text-zinc-400">{service.description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            isPaid
              ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          }`}
        >
          {isPaid ? service.payment!.price : "Free"}
        </span>
      </div>

      <div className="mb-4 rounded-lg bg-zinc-900/60 px-4 py-2.5 font-mono text-xs">
        <span className="text-emerald-400">POST</span>{" "}
        <span className="text-zinc-300">{service.endpoint}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SchemaBlock label="Input" schema={service.inputSchema} />
        <SchemaBlock label="Output" schema={service.outputSchema} />
      </div>

      {isPaid && service.payment && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(service.paymentOptions ?? [service.payment]).map((opt) => (
            <span
              key={opt.network}
              className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-500"
            >
              {opt.network}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SchemaBlock({
  label,
  schema,
}: {
  label: string;
  schema: Record<string, unknown>;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label} Schema
      </div>
      <pre className="overflow-x-auto rounded-lg bg-zinc-900/60 p-3 text-[11px] leading-relaxed text-zinc-400">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </div>
  );
}
