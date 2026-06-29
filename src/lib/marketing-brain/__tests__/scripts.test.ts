import { test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runPython } from "@/lib/integrations/python.ts";
import {
  MARKETING_BRAIN_SCRIPTS,
  getMarketingBrainScript,
  preflightMarketingBrainScript,
  runMarketingBrainScript,
} from "@/lib/marketing-brain/scripts.ts";

test("Marketing Brain script registry includes production brain generators", () => {
  for (const script of [
    "build_keyword_xlsx.py",
    "capture_visual_references.py",
    "find_competitors.py",
    "mine_paa_serps.py",
    "pull_competitor_kw.py",
    "render_beast_pdf.py",
    "synthesize_beast_plan.py",
  ]) {
    assert.ok(MARKETING_BRAIN_SCRIPTS.some((entry) => entry.file === script), script);
  }
});

test("Marketing Brain DataForSEO scripts fail preflight without mutating vaults", async () => {
  const script = getMarketingBrainScript("find-competitors");
  const preflight = preflightMarketingBrainScript(script, {});

  assert.equal(preflight.ok, false);
  if (!preflight.ok) {
    assert.deepEqual(preflight.missing, [
      "DATAFORSEO_LOGIN",
      "DATAFORSEO_PASSWORD",
    ]);
  }

  const result = await runMarketingBrainScript("missing-creds-client", "find-competitors", {
    env: {},
    args: ["--site", "https://example.com", "--dry-run"],
  });

  assert.equal(result.status, "needs_data");
  if (result.status === "needs_data") {
    assert.deepEqual(result.missing, ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]);
  }
});

test("Marketing Brain script lookup rejects unknown ids", () => {
  assert.throws(
    () => getMarketingBrainScript("missing-script" as never),
    /unknown Marketing Brain script/,
  );
});

test("Marketing Brain script bridge honors cancellation before spawn", async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () =>
      runMarketingBrainScript("cancelled-client", "build-keyword-xlsx", {
        signal: controller.signal,
      }),
    /cancelled before start/,
  );
});

test("Python bridge reports timeouts as non-zero failures", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "python-timeout-"));
  try {
    const script = path.join(tmp, "sleep.py");
    await fsp.writeFile(script, "import time\ntime.sleep(2)\n", "utf8");
    const result = await runPython({ script, timeoutMs: 50 });

    assert.equal(result.exitCode, 124);
    assert.equal(result.timedOut, true);
    assert.match(result.stderr, /timed out/);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});

test("core specialists call Marketing Brain script bridges", async () => {
  const root = process.cwd();
  const files = {
    keyword: await fsp.readFile(
      path.join(root, "src/lib/specialists/keyword-researcher.ts"),
      "utf8",
    ),
    competitor: await fsp.readFile(
      path.join(root, "src/lib/specialists/competitor-pages.ts"),
      "utf8",
    ),
    beast: await fsp.readFile(
      path.join(root, "src/lib/specialists/beast-planner.ts"),
      "utf8",
    ),
  };

  assert.ok(files.keyword.includes("runMarketingBrainScript"));
  assert.ok(files.keyword.includes('"build-keyword-xlsx"'));
  assert.ok(files.keyword.includes('"mine-paa-serps"'));
  assert.ok(files.competitor.includes("runMarketingBrainScript"));
  assert.ok(files.competitor.includes('"find-competitors"'));
  assert.ok(files.competitor.includes('"pull-competitor-kw"'));
  assert.ok(files.beast.includes("runMarketingBrainScript"));
  assert.ok(files.beast.includes('"synthesize-beast-plan"'));
  assert.ok(files.beast.includes('"render-beast-pdf"'));
});
