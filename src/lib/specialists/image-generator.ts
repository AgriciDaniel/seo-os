/**
 * Image Generator — produces AI-generated OG / hero / schema images via
 * Google's Gemini image-generation API.
 *
 * Ports the logic from claude-seo's `seo-image-gen` skill.
 */
import "server-only";
import { z } from "zod";
import path from "node:path";
import fsp from "node:fs/promises";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { requireIntegrations } from "./_lib/availability";
import { writeArtifact } from "./_lib/artifact";
import { vaultRoot } from "@/lib/brain/paths";
import { envValue } from "@/lib/setup/env-local";

const PROMPT_SYSTEM = `You are the Image Generator inside SEO Office.

Given a brand snapshot, propose 3 image prompts for Gemini image generation: one OG card (1200×630), one hero image, one schema/product image. Each prompt must:

- Be 50-90 words, descriptive but unambiguous
- Specify subject, composition, lighting, color palette, mood
- Avoid trademarks, real people's faces, copyrighted IP
- Be safe for commercial use

Return ONLY a JSON object with this exact shape (no markdown fence, no commentary):
{
  "prompts": [
    { "kind": "og", "title": "...", "prompt": "..." },
    { "kind": "hero", "title": "...", "prompt": "..." },
    { "kind": "schema", "title": "...", "prompt": "..." }
  ]
}`;

const InputSchema = z.object({
  brief: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

interface GeneratedImage {
  kind: string;
  title: string;
  prompt: string;
  filename: string;
  bytes: number;
  mimeType: string;
}

/** Call Gemini's image-generation endpoint and return a single PNG buffer. */
async function generateImage(prompt: string, key: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini image API → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
        }>;
      };
    }>;
  };
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error("Gemini image API returned no inline image data");
  }
  return {
    buffer: Buffer.from(part.inlineData.data, "base64"),
    mimeType: part.inlineData.mimeType ?? "image/png",
  };
}

const imageGenerator: Specialist<Input> = {
  id: "image-generator",
  name: "Image Generator",
  description: "AI-generated OG, hero, schema, and product images via Gemini.",
  desk: "desk.image-generator",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["google-ai"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const provider = await selectProvider();
    ctx.emit("progress", `Drafting prompts via ${provider.name}…`, { progress: 0.1 });

    const planResult = await provider.chat({
      tier: "synthesis",
      systemPrompt: PROMPT_SYSTEM,
      maxTokens: 1024,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: `Brand: ${manifest.site_under_audit}\nBrief: ${input.brief ?? "(none — pick something sensible)"}`,
        },
      ],
    });

    const planMatch = planResult.text.match(/\{[\s\S]*\}/);
    if (!planMatch) {
      throw new Error("Prompt-drafting step did not return JSON");
    }
    const plan = JSON.parse(planMatch[0]) as {
      prompts: Array<{ kind: string; title: string; prompt: string }>;
    };
    ctx.emit("log", `${plan.prompts.length} prompt(s) drafted.`);

    const key = envValue("GOOGLE_AI_API_KEY");
    const today = new Date().toISOString().slice(0, 10);
    const outDir = path.join(vaultRoot(ctx.clientSlug), "wiki", "deliverables", "images", today);
    await fsp.mkdir(outDir, { recursive: true });

    const generated: GeneratedImage[] = [];
    for (let i = 0; i < plan.prompts.length; i++) {
      const p = plan.prompts[i];
      ctx.emit("progress", `Generating ${p.kind} image (${i + 1}/${plan.prompts.length})…`, {
        progress: 0.2 + (i / plan.prompts.length) * 0.6,
      });
      const { buffer, mimeType } = await generateImage(p.prompt, key);
      const ext = mimeType.split("/")[1] ?? "png";
      const filename = `${p.kind}.${ext}`;
      await fsp.writeFile(path.join(outDir, filename), buffer);
      generated.push({
        kind: p.kind,
        title: p.title,
        prompt: p.prompt,
        filename,
        bytes: buffer.length,
        mimeType,
      });
    }

    ctx.emit("progress", "Writing image manifest to vault…", { progress: 0.9 });
    const body =
      generated
        .map(
          (g) =>
            `## ${g.kind.toUpperCase()} — ${g.title}\n\n` +
            `- **File**: \`wiki/deliverables/images/${today}/${g.filename}\`\n` +
            `- **Size**: ${(g.bytes / 1024).toFixed(1)} KB · ${g.mimeType}\n` +
            `- **Prompt**: ${g.prompt}\n`,
        )
        .join("\n");

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: "images",
        frontmatterType: "deliverable",
        title: `Image set — ${manifest.site_under_audit}`,
        body,
        tags: ["deliverable", "images", "generated", "claude-generated"],
      },
      {
        facts: [
          `Generated ${generated.length} image(s) via Gemini for ${manifest.site_under_audit}.`,
        ],
        threadTitle: "Image set",
        threadRationale: "review generated assets and pick the OG card before publishing",
        statusNote: `${generated.length} image(s) generated — see wiki/deliverables/images/${today}/.`,
      },
    );

    return {
      summary: `${generated.length} image(s) generated. Manifest written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { count: generated.length, dir: `wiki/deliverables/images/${today}` },
    };
  },
};

registerSpecialist(imageGenerator);
export default imageGenerator;
