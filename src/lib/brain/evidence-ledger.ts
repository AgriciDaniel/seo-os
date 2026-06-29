import "server-only";
import { z } from "zod";
import {
  SpecialistEvidenceZ,
  type SpecialistEvidence,
} from "@/lib/brain/population-contract";
import { readRaw, writeRaw } from "@/lib/brain/vault-fs";
import { withFileMutex } from "@/lib/brain/file-mutex";

export const EVIDENCE_LEDGER_PATH = "wiki/meta/evidence-ledger.jsonl";

export const EvidenceLedgerEntryZ = SpecialistEvidenceZ.extend({
  job_id: z.string().min(1),
  specialist_id: z.string().min(1),
  captured_at: z.string().min(1),
});
export type EvidenceLedgerEntry = z.infer<typeof EvidenceLedgerEntryZ>;

export async function appendEvidence(
  clientSlug: string,
  input: SpecialistEvidence & {
    job_id: string;
    specialist_id: string;
    captured_at?: string;
  },
): Promise<EvidenceLedgerEntry> {
  const evidence = SpecialistEvidenceZ.parse(input);
  const entry = EvidenceLedgerEntryZ.parse({
    ...evidence,
    job_id: input.job_id,
    specialist_id: input.specialist_id,
    captured_at: input.captured_at ?? new Date().toISOString(),
  });

  await withFileMutex(clientSlug, EVIDENCE_LEDGER_PATH, async () => {
    const existing = (await readRaw(clientSlug, EVIDENCE_LEDGER_PATH)) ?? "";
    const prefix = existing.trim().length > 0 ? `${existing.trimEnd()}\n` : "";
    await writeRaw(clientSlug, EVIDENCE_LEDGER_PATH, `${prefix}${JSON.stringify(entry)}\n`);
  });

  return entry;
}

export async function appendEvidenceBatch(
  clientSlug: string,
  input: {
    jobId: string;
    specialistId: string;
    evidence: SpecialistEvidence[];
  },
): Promise<EvidenceLedgerEntry[]> {
  const entries: EvidenceLedgerEntry[] = [];
  for (const evidence of input.evidence) {
    entries.push(
      await appendEvidence(clientSlug, {
        ...evidence,
        job_id: input.jobId,
        specialist_id: input.specialistId,
      }),
    );
  }
  return entries;
}

export async function readEvidenceLedger(
  clientSlug: string,
): Promise<EvidenceLedgerEntry[]> {
  const raw = await readRaw(clientSlug, EVIDENCE_LEDGER_PATH);
  if (!raw?.trim()) return [];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        throw new Error(
          `invalid evidence ledger JSON at ${EVIDENCE_LEDGER_PATH}:${index + 1}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return EvidenceLedgerEntryZ.parse(parsed);
    });
}
