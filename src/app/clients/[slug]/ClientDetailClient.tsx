"use client";

import { useState } from "react";
import JobStream from "@/components/JobStream";

interface NextAction {
  id: string;
  specialistId?: string;
  headline: string;
  rationale: string;
  severity: string;
}

interface Job {
  id: string;
  specialist: string;
  status: string;
  progress: number;
  message: string | null;
  created_at: string;
  result_path: string | null;
}

interface Props {
  slug: string;
  nextAction: NextAction;
  initialJobs: Job[];
}

export default function ClientDetailClient({ slug, nextAction, initialJobs }: Props) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [enqueuing, setEnqueuing] = useState(false);

  async function runSpecialist(specialistId: string) {
    setEnqueuing(true);
    try {
      const r = await fetch(`/api/clients/${slug}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialist: specialistId }),
      });
      const data = await r.json();
      if (data.ok && data.job) {
        setActiveJobId(data.job.id);
        setJobs((prev) => [data.job, ...prev]);
      }
    } finally {
      setEnqueuing(false);
    }
  }

  const canRun = nextAction.specialistId && nextAction.id !== "idle";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs uppercase tracking-wider text-zinc-500">next action</p>
        <h2 className="mt-1 text-lg font-medium">{nextAction.headline}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{nextAction.rationale}</p>
        {canRun && (
          <button
            onClick={() => runSpecialist(nextAction.specialistId!)}
            disabled={enqueuing || !!activeJobId}
            className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
          >
            {enqueuing ? "Enqueueing…" : `Run ${nextAction.specialistId}`}
          </button>
        )}
      </section>

      {activeJobId && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Active job
          </h2>
          <JobStream
            slug={slug}
            jobId={activeJobId}
            onDone={async () => {
              const r = await fetch(`/api/clients/${slug}/jobs`);
              const data = await r.json();
              if (data.jobs) setJobs(data.jobs);
            }}
          />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Job history
        </h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">No jobs yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{j.specialist}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {new Date(j.created_at + "Z").toLocaleString()} ·{" "}
                    {j.message ?? j.status}
                  </p>
                </div>
                <span
                  className={
                    j.status === "succeeded"
                      ? "rounded bg-emerald-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                      : j.status === "failed"
                      ? "rounded bg-red-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-700 dark:bg-red-950 dark:text-red-200"
                      : "rounded bg-zinc-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                  }
                >
                  {j.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
