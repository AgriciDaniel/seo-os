/**
 * Image Auditor — image SEO audit: alt text, formats, lazy loading, CLS
 * proxy, optional image-SERP context via DataForSEO.
 *
 * Ports the system prompt logic from claude-seo's `seo-images` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { isAvailable } from "./_lib/availability";
import { resolveLocale } from "./_lib/locale";
import { post as dfsPost } from "@/lib/integrations/dataforseo";
import { writeArtifact } from "./_lib/artifact";
import { optionalIntegrationDegradation } from "./integration-readiness";

const SYSTEM_PROMPT = `You are the Image Auditor inside SEO Office.

You receive a JSON payload describing every \`<img>\` tag on a page (src, alt presence, width/height, loading attribute, decoding hint, format hint from the URL extension) plus optional Google Images SERP context for one seed keyword. Your job: rate the page's image SEO posture and identify the highest-impact fixes.

## Output contract

Produce a Markdown report with exactly these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with the highest-impact image SEO gap.
2. **Alt-text coverage** — total images, missing-alt count, percentage. Cite any obviously decorative images that may correctly lack alt. Flag any non-decorative img with empty/missing alt.
3. **Formats & weight signals** — what extensions appear in src URLs (jpg/png/webp/avif/svg/gif). Modern format adoption (WebP/AVIF presence). Note CDN/optimisation services if present in URLs (Cloudinary, Imgix, /_next/image, etc.).
4. **Layout stability (CLS proxy)** — count of images with both width and height attributes vs missing dimensions. Flag the missing-dimension count; missing dimensions on above-the-fold images is a layout-shift risk.
5. **Lazy loading & priority** — count of \`loading="lazy"\` vs eager, \`decoding="async"\`, and any \`fetchpriority="high"\` hints. Note if the hero image is lazy-loaded (LCP penalty).
6. **Image SERP context** — if a SERP payload is included, summarise the top image hosts ranking for the seed keyword, dominant format, and what the page would need to compete. If no SERP data, write "n/a — DataForSEO not configured" and skip.
7. **Recommendations** — exactly 6 numbered actions, each with: imperative title, one-sentence why, effort (S/M/L), expected impact (S/M/L). Sort by impact-per-effort.

## Voice and constraints

- Be terse, evidence-led. Cite exact filenames or src snippets when calling out issues.
- Never promise rankings or traffic gains.
- If a sample is truncated (only first ~30 images visible), say so.
- End after the recommendations.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

interface ImageEntry {
  src: string;
  alt: string | null;
  hasAlt: boolean;
  width: string | null;
  height: string | null;
  loading: string | null;
  decoding: string | null;
  fetchpriority: string | null;
  extension: string | null;
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}=["']([^"']*)["']`, "i");
  return tag.match(re)?.[1] ?? null;
}

function extractImageDetails(html: string, max: number): ImageEntry[] {
  const out: ImageEntry[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = attr(tag, "src") ?? attr(tag, "data-src") ?? "";
    const altMatch = tag.match(/\balt=["']([^"']*)["']/i);
    const hasAlt = /\balt=["']/i.test(tag);
    let extension: string | null = null;
    try {
      const u = new URL(src, "https://placeholder.example/");
      const m2 = u.pathname.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
      extension = m2 ? m2[1].toLowerCase() : null;
    } catch {
      extension = null;
    }
    out.push({
      src: src.length > 200 ? src.slice(0, 200) + "…" : src,
      alt: altMatch ? altMatch[1] : null,
      hasAlt,
      width: attr(tag, "width"),
      height: attr(tag, "height"),
      loading: attr(tag, "loading"),
      decoding: attr(tag, "decoding"),
      fetchpriority: attr(tag, "fetchpriority"),
      extension,
    });
    if (out.length >= max) break;
  }
  return out;
}

const imageAuditor: Specialist<Input> = {
  id: "image-auditor",
  name: "Image Auditor",
  description:
    "Audits image SEO — alt coverage, formats, dimensions/CLS proxy, lazy loading, and optional image SERP context.",
  desk: "desk.image-auditor",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.1 });
    const signals = await extractSignals(manifest.site_under_audit);

    ctx.emit("progress", "Extracting image attributes…", { progress: 0.3 });
    const html = await fetch(manifest.site_under_audit, {
      headers: { "User-Agent": "SEOOfficeBot/0.1 (+local)" },
      redirect: "follow",
    })
      .then((r) => r.text())
      .catch(() => "");
    const images = extractImageDetails(html, 30);
    ctx.emit("log", `Captured ${images.length} image tags (of ${signals.imageCount} total).`);

    let imageSerp: unknown = null;
    const seed = signals.title?.split(/[|—\-·]/)[0]?.trim() || signals.h1[0];
    if (isAvailable("dataforseo") && seed) {
      try {
        ctx.emit("progress", `Pulling image SERP for "${seed}"…`, { progress: 0.5 });
        const { location_name, language_name } = resolveLocale(manifest);
        const json = await dfsPost("/v3/serp/google/images/live/advanced", {
          keyword: seed,
          location_name,
          language_name,
          depth: 20,
        });
        const items = json.tasks?.[0]?.result?.[0] as
          | { items?: Array<{ source_url?: string; alt?: string; format?: string }> }
          | undefined;
        imageSerp = {
          keyword: seed,
          sample: items?.items?.slice(0, 15) ?? [],
        };
      } catch (err) {
        ctx.emit("log", `Image SERP fetch failed: ${(err as Error).message}`);
      }
    }

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.7 });

    const compact = {
      url: signals.url,
      totalImages: signals.imageCount,
      imagesMissingAlt: signals.imagesMissingAlt,
      sampleSize: images.length,
      sampleTruncated: signals.imageCount > images.length,
      images,
      imageSerp,
      dataforseo_configured: isAvailable("dataforseo"),
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Audit this page's images. Payload follows.\n\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing image audit to vault…", { progress: 0.9 });

    const altPct =
      signals.imageCount > 0
        ? Math.round(((signals.imageCount - signals.imagesMissingAlt) / signals.imageCount) * 100)
        : 100;
    const missingDims = images.filter((i) => !i.width || !i.height).length;
    const degradation = optionalIntegrationDegradation("image-auditor");

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "images",
        frontmatterType: "audit",
        title: `Image SEO audit — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "images", "performance", "claude-generated"],
        costUsd: result.costUsd ?? 0,
        ...degradation.artifact,
      },
      {
        facts: [
          `Image audit run on ${manifest.site_under_audit}: ${signals.imageCount} images, ${altPct}% with alt.`,
          missingDims
            ? `${missingDims} of ${images.length} sampled images missing width/height (CLS risk).`
            : `All ${images.length} sampled images declare width + height.`,
        ],
        threadTitle: "Image SEO audit",
        threadRationale: "fix alt-text gaps and format/CLS issues",
        statusNote: "Image audit on file — review the action plan for the top alt + format fixes.",
      },
    );

    return {
      summary: `Image audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: {
        totalImages: signals.imageCount,
        imagesMissingAlt: signals.imagesMissingAlt,
        sampleSize: images.length,
        imageSerpAvailable: imageSerp !== null,
      },
      ...degradation.result,
    };
  },
};

registerSpecialist(imageAuditor);

export default imageAuditor;
