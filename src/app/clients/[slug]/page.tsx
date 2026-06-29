import { notFound } from "next/navigation";
import { getClient } from "@/lib/brain/index-db";
import { nextActionForWithRegistry } from "@/lib/orchestrator/next-action";
import { listJobs } from "@/lib/orchestrator/job-queue";
import ClientDetailClient from "./ClientDetailClient";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = getClient(slug);
  if (!client) notFound();

  const [nextAction, jobs] = await Promise.all([
    nextActionForWithRegistry(slug),
    Promise.resolve(listJobs(slug, 30)),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">client</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          <a
            href={client.site_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {client.site_url}
          </a>
          {client.business_type ? ` · ${client.business_type}` : ""} · owner {client.owner}
        </p>
      </header>

      <ClientDetailClient
        slug={slug}
        nextAction={{
          id: nextAction.id,
          specialistId: nextAction.specialistId,
          headline: nextAction.headline,
          rationale: nextAction.rationale,
          severity: nextAction.severity,
        }}
        initialJobs={jobs}
      />
    </div>
  );
}
