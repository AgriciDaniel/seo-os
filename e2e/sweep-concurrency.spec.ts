import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

type SweepStatus =
  | "planned"
  | "blocked"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

interface SweepResponse {
  ok: boolean;
  sweep: null | {
    root_task_id: string;
    status: SweepStatus;
    totals: {
      all: number;
      succeeded: number;
      failed: number;
      cancelled: number;
      skipped: number;
      running: number;
      queued: number;
      planned_or_blocked: number;
    };
  };
}

interface StartSweepResponse {
  ok: boolean;
  existing?: boolean;
  error?: string;
  rootTaskId?: string | null;
  sweep?: SweepResponse["sweep"];
}

const EXPECTED_DEEP_BRAIN_CHILDREN = 34;
const DATA_DIR =
  process.env.SEO_OFFICE_E2E_DATA_DIR ??
  path.join(os.tmpdir(), "seo-office-playwright-e2e");

test.describe("Build-brain sweep concurrency", () => {
  test("rejects a second build-brain sweep for the same client", async ({
    request,
  }) => {
    const slug = await createFixtureClient(request, "Same Client Lock");

    const firstStart = startSweep(request, slug);
    await waitForSweepToExist(request, slug);

    const duplicate = await startSweep(request, slug);
    expect(duplicate).toMatchObject({
      ok: true,
      existing: true,
    });
    expect(duplicate.error).toMatch(/^sweep_already_running: build-brain /);

    const first = await firstStart;
    expect(first.ok).toBeTruthy();
    expect(first.existing ?? false).toBe(false);
    expect(first.rootTaskId).toBeTruthy();
    expect(duplicate.rootTaskId).toBe(first.rootTaskId);

    const terminal = await waitForTerminalSweep(request, slug);
    expect(terminal.status).toBe("succeeded");
  });

  test("accepts build-brain sweeps for different clients at the same time", async ({
    request,
  }) => {
    const [alpha, beta] = await Promise.all([
      createFixtureClient(request, "Parallel Alpha"),
      createFixtureClient(request, "Parallel Beta"),
    ]);

    const alphaStart = startSweep(request, alpha);
    const betaStart = startSweep(request, beta);
    await waitForSweepsToExist(request, [alpha, beta]);

    const [alphaResponse, betaResponse] = await Promise.all([alphaStart, betaStart]);
    expect(alphaResponse).toMatchObject({ ok: true });
    expect(betaResponse).toMatchObject({ ok: true });
    expect(alphaResponse.existing ?? false).toBe(false);
    expect(betaResponse.existing ?? false).toBe(false);
    expect(alphaResponse.rootTaskId).toBeTruthy();
    expect(betaResponse.rootTaskId).toBeTruthy();
    expect(alphaResponse.rootTaskId).not.toBe(betaResponse.rootTaskId);

    const [alphaTerminal, betaTerminal] = await Promise.all([
      waitForTerminalSweep(request, alpha),
      waitForTerminalSweep(request, beta),
    ]);
    expect(alphaTerminal.status).toBe("succeeded");
    expect(betaTerminal.status).toBe("succeeded");
  });

  test("running build-brain for one client does not mutate another client vault", async ({
    request,
  }) => {
    const [alpha, beta] = await Promise.all([
      createFixtureClient(request, "Isolation Alpha"),
      createFixtureClient(request, "Isolation Beta"),
    ]);
    const before = await hashVault(beta);

    const alphaStart = await startSweep(request, alpha);
    expect(alphaStart).toMatchObject({ ok: true });
    await waitForTerminalSweep(request, alpha);

    const after = await hashVault(beta);
    expect(after).toEqual(before);
  });
});

async function createFixtureClient(
  request: APIRequestContext,
  namePrefix: string,
): Promise<string> {
  const response = await request.post("/api/clients", {
    data: {
      clientName: `${namePrefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`,
      siteUrl: "https://concurrency.example.com",
      owner: "QA Editorial Team",
      businessType: "professional-services",
      niche: "SEO operations quality assurance",
      siteBrand: "Concurrency QA",
      authorByline: "QA Editorial Team",
      monetizationModel: "Booked consulting calls",
      targetPersona: "Operators who need reliable local-first SEO execution.",
      primaryCompetitors: ["example-a.com", "example-b.com"],
      measurementAccess: [],
      locale: {
        location_name: "United States",
        language_name: "English",
        timezone: "America/New_York",
      },
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { slug: string };
  return body.slug;
}

async function startSweep(
  request: APIRequestContext,
  slug: string,
): Promise<StartSweepResponse> {
  const response = await request.post(`/api/clients/${slug}/sweeps`, {
    data: {
      template_id: "build-brain",
      permission_mode: "auto",
      from: "api",
    },
  });
  expect(response.status()).toBe(202);
  return (await response.json()) as StartSweepResponse;
}

async function getSweep(
  request: APIRequestContext,
  slug: string,
): Promise<SweepResponse["sweep"]> {
  const response = await request.get(`/api/clients/${slug}/sweeps/current`);
  if (!response.ok()) return null;
  return ((await response.json()) as SweepResponse).sweep;
}

async function waitForSweepToExist(
  request: APIRequestContext,
  slug: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const sweep = await getSweep(request, slug);
        return sweep?.root_task_id ?? "";
      },
      { timeout: 15_000, intervals: [100, 250, 500] },
    )
    .not.toBe("");
}

async function waitForSweepsToExist(
  request: APIRequestContext,
  slugs: string[],
): Promise<void> {
  await expect
    .poll(
      async () => {
        const sweeps = await Promise.all(slugs.map((slug) => getSweep(request, slug)));
        return sweeps.filter(Boolean).length;
      },
      { timeout: 15_000, intervals: [100, 250, 500] },
    )
    .toBe(slugs.length);
}

async function waitForTerminalSweep(
  request: APIRequestContext,
  slug: string,
): Promise<NonNullable<SweepResponse["sweep"]>> {
  let latest: SweepResponse["sweep"] = null;
  await expect
    .poll(
      async () => {
        latest = await getSweep(request, slug);
        if (!latest) return "missing";
        return `${latest.status}:${latest.totals.succeeded}/${latest.totals.all}:${latest.totals.running}:${latest.totals.queued}`;
      },
      { timeout: 90_000, intervals: [250, 500, 1_000] },
    )
    .toBe(`succeeded:${EXPECTED_DEEP_BRAIN_CHILDREN}/${EXPECTED_DEEP_BRAIN_CHILDREN}:0:0`);
  return latest!;
}

async function hashVault(slug: string): Promise<Record<string, string>> {
  const root = path.join(DATA_DIR, "vaults", slug);
  const out: Record<string, string> = {};
  await walkHash(root, root, out);
  return out;
}

async function walkHash(
  root: string,
  dir: string,
  out: Record<string, string>,
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkHash(root, absolute, out);
      continue;
    }
    const bytes = await fsp.readFile(absolute);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    out[relative] = createHash("sha256").update(bytes).digest("hex");
  }
}
