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
    readiness_status: "draft" | "needs_data" | "partial_brain" | "deep_ready" | "blocked" | null;
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
      title: string;
      status: SweepStatus;
      skipped: boolean;
      result_summary: string | null;
    }>;
  };
}

const EXPECTED_DEEP_BRAIN_CHILDREN = 34;

test.describe("Deep Brain partial-sweep recovery", () => {
  test.skip(
    process.env.SEO_OFFICE_E2E_FAIL_SPECIALIST !== "page-analyzer",
    "requires SEO_OFFICE_E2E_FAIL_SPECIALIST=page-analyzer",
  );

  test("continues independent specialists and exposes retry for a partial brain", async ({
    page,
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
    expect(terminal.readiness_status).toBe("partial_brain");
    expect(terminal.totals.all).toBe(EXPECTED_DEEP_BRAIN_CHILDREN);
    expect(terminal.totals.failed).toBe(1);
    expect(terminal.totals.cancelled).toBeGreaterThan(0);
    expect(terminal.totals.succeeded).toBeGreaterThanOrEqual(11);
    expect(terminal.totals.running).toBe(0);
    expect(terminal.totals.queued).toBe(0);

    expect(childStatus(terminal, "page-analyzer")).toBe("failed");
    expect(childStatus(terminal, "sitemap-architect")).toBe("succeeded");
    expect(childStatus(terminal, "google-suite")).toBe("succeeded");
    expect(childStatus(terminal, "hreflang-auditor")).toBe("succeeded");
    expect(childStatus(terminal, "drift-monitor")).toBe("succeeded");

    const diagnosticGate = terminal.children.find(
      (child) =>
        child.specialist_id === "phase-gate" &&
        child.title === "Diagnostic readiness gate",
    );
    expect(diagnosticGate?.status).toBe("cancelled");
    expect(diagnosticGate?.result_summary ?? "").toMatch(/^blocked: dependency /);

    await page.goto(`/office?client=${slug}`);
    await expect(page.getByText(/deep brain partially built/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Retry failed", exact: true }),
    ).toBeVisible();

    const action = await nextAction(request, slug);
    expect(action.id).toBe("retry-failed-specialist");
    expect(action.specialistId).toBe("page-analyzer");
  });
});

async function createFixtureClient(request: APIRequestContext): Promise<string> {
  const response = await request.post("/api/clients", {
    data: {
      clientName: `Partial Sweep Fixture ${Date.now()}`,
      siteUrl: "https://partial-sweep.example.com",
      owner: "QA Editorial Team",
      businessType: "professional-services",
      niche: "partial sweep recovery quality assurance",
      siteBrand: "Partial Sweep QA",
      authorByline: "QA Editorial Team",
      monetizationModel: "Consulting retainers",
      targetPersona: "Operators validating Deep Brain recovery.",
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
        return `${latest.status}:${latest.readiness_status}:${latest.totals.running}:${latest.totals.queued}:${latest.totals.planned_or_blocked}`;
      },
      { timeout: 90_000, intervals: [250, 500, 1_000] },
    )
    .toBe("failed:partial_brain:0:0:0");
  return latest!;
}

function childStatus(
  sweep: NonNullable<SweepResponse["sweep"]>,
  specialistId: string,
): SweepStatus | null {
  return sweep.children.find((child) => child.specialist_id === specialistId)?.status ?? null;
}

async function nextAction(
  request: APIRequestContext,
  slug: string,
): Promise<{ id: string; specialistId?: string }> {
  const response = await request.get(`/api/clients/${slug}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    nextAction: { id: string; specialistId?: string };
  };
  return body.nextAction;
}
