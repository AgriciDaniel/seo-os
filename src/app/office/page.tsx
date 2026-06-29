import { redirect } from "next/navigation";
import { listClients } from "@/lib/brain/index-db";
import { listSpecialists } from "@/lib/orchestrator/registry";
import { nextActionForWithRegistry } from "@/lib/orchestrator/next-action";
import { listJobs } from "@/lib/orchestrator/job-queue";
import { officeOperationalStatus } from "@/lib/office/operational-status";
import { readManifest } from "@/lib/orchestrator/client-context";
import {
  getTemplate,
  instantiateTemplateChildren,
} from "@/lib/orchestrator/task-templates";
import { summarizeSpecialistIntegrationReadiness } from "@/lib/specialists/integration-readiness";
import OfficeWorkspace from "./OfficeWorkspace";
import "@/lib/specialists";

export const dynamic = "force-dynamic";

export default async function OfficePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: clientParam } = await searchParams;
  const clients = listClients();
  if (clients.length === 0) {
    redirect("/clients/new");
  }
  if (clientParam && !clients.some((c) => c.slug === clientParam)) {
    redirect(`/office?client=${encodeURIComponent(clients[0].slug)}`);
  }
  const active =
    clients.find((c) => c.slug === clientParam) ?? clients[0];

  const [nextAction, jobs, operationalStatus, manifest] = await Promise.all([
    nextActionForWithRegistry(active.slug),
    Promise.resolve(listJobs(active.slug, 8)),
    officeOperationalStatus(active.slug),
    readManifest(active.slug),
  ]);
  const buildBrainTemplate = getTemplate("build-brain");
  const buildBrainIntegrationReadiness =
    buildBrainTemplate && manifest
      ? summarizeSpecialistIntegrationReadiness(
          instantiateTemplateChildren({
            template: buildBrainTemplate,
            manifest,
          }),
        )
      : null;

  const specialists = listSpecialists().map((s) => ({
    id: s.id,
    name: s.name,
  }));

  return (
    <OfficeWorkspace
      clients={clients}
      activeClient={active}
      specialists={specialists}
      initialNextAction={nextAction}
      initialJobs={jobs}
      initialOperationalStatus={operationalStatus}
      buildBrainIntegrationReadiness={buildBrainIntegrationReadiness}
    />
  );
}
