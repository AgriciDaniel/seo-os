import "server-only";

import { readRaw, writeRaw } from "@/lib/brain/vault-fs";
import { managedSectionEnd, managedSectionStart } from "./population-contract";

export function mergeCanonicalSection(
  body: string,
  sectionId: string,
  generatedMarkdown: string,
): string {
  const start = managedSectionStart(sectionId);
  const end = managedSectionEnd(sectionId);
  const block = `${start}\n${generatedMarkdown.trim()}\n${end}`;

  if (body.includes(start) && body.includes(end)) {
    return body.replace(
      new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`),
      block,
    );
  }

  return `${body.trim()}\n\n${block}\n`;
}

export async function updateCanonicalNote(
  clientSlug: string,
  relativePath: string,
  sectionId: string,
  generatedMarkdown: string,
): Promise<void> {
  const current = (await readRaw(clientSlug, relativePath)) ?? "";
  await writeRaw(
    clientSlug,
    relativePath,
    mergeCanonicalSection(current, sectionId, generatedMarkdown),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
