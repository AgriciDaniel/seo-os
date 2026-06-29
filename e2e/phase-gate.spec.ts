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
    children: Array<{
      specialist_id: string;
      status: SweepStatus;
      skipped: boolean;
      result_summary: string | null;
    }>;
  };
}

const EXPECTED_DEEP_BRAIN_CHILDREN = 34;

test.describe("Deep Brain phase gates", () => {
  test.skip(
    process.env.SEO_OFFICE_E2E_INJECT_PHASE_PLACEHOLDER !== "1",
    "requires SEO_OFFICE_E2E_INJECT_PHASE_PLACEHOLDER=1",
  );

  test("halts downstream phases when an intake artifact contains a placeholder", async ({
    request,
  }) => {
    const slug = await createFixtureClient(request);
    const start = await request.post(`/api/clients/${slug}/sweeps`, {
      data: {
        template_id: "build-brain",
        permission_mode: "auto",
        from: "api",
      },
    });
    expect(start.status()).toBe(202);

    const terminal = await waitForTerminalSweep(request, slug);
    expect(terminal.status).toBe("failed");
    expect(terminal.totals.all).toBe(EXPECTED_DEEP_BRAIN_CHILDREN);
    expect(terminal.totals.failed).toBeGreaterThanOrEqual(1);
    expect(terminal.totals.cancelled).toBeGreaterThan(0);
    expect(terminal.totals.succeeded).toBeLessThan(EXPECTED_DEEP_BRAIN_CHILDREN);

    const intakeGate = terminal.children.find(
      (child) => child.specialist_id === "phase-gate" && child.status === "failed",
    );
    expect(intakeGate?.result_summary ?? "").toContain("phase gate blocked");

    const downstream = terminal.children.find(
      (child) => child.specialist_id === "technical-auditor",
    );
    expect(downstream?.status).toBe("cancelled");
    expect(downstream?.result_summary ?? "").toMatch(/^blocked: dependency /);

    const lint = await request.get(`/api/clients/${slug}/lint`);
    expect(lint.ok()).toBeTruthy();
    const lintJson = await lint.json();
    expect(
      lintJson.report.findings.some(
        (finding: { rule: string; file: string }) =>
          finding.rule === "unresolved-placeholder-body" &&
          finding.file === "wiki/meta/E2E Phase Gate Placeholder.md",
      ),
    ).toBeTruthy();
  });
});

async function createFixtureClient(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/clients", {
    data: {
      clientName: `Phase Gate Fixture ${Date.now()}`,
      siteUrl: "https://phase-gate.example.com",
      owner: "QA Editorial Team",
      businessType: "professional-services",
      niche: "phase gate quality assurance",
      siteBrand: "Phase Gate QA",
      authorByline: "QA Editorial Team",
      monetizationModel: "Consulting retainers",
      targetPersona: "Operators validating phase gate safety.",
      primaryCompetitors: ["competitor.example"],
      measurementAccess: ["search-console", "ga4", "dataforseo"],
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

async function getSweep(
  request: APIRequestContext,
  slug: string,
): Promise<SweepResponse["sweep"]> {
  const response = await request.get(`/api/clients/${slug}/sweeps/current`);
  if (!response.ok()) return null;
  return ((await response.json()) as SweepResponse).sweep;
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
        return `${latest.status}:${latest.totals.running}:${latest.totals.queued}:${latest.totals.planned_or_blocked}`;
      },
      { timeout: 90_000, intervals: [250, 500, 1_000] },
    )
    .toBe("failed:0:0:0");
  return latest!;
}
