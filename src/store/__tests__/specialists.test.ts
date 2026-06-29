import test from "node:test";
import assert from "node:assert/strict";
import { useSpecialistsStore } from "../specialists";

test("setState idle→running→review when artifact present", () => {
  const s = useSpecialistsStore.getState();
  s.reset();
  s.setState("content-auditor", "running", { jobId: "j1" });
  assert.equal(useSpecialistsStore.getState().byId["content-auditor"]?.state, "running");
  s.setState("content-auditor", "succeeded", {
    jobId: "j1",
    artifactPath: "wiki/audits/2026-05-18-content-audit.md",
  });
  const entry = useSpecialistsStore.getState().byId["content-auditor"];
  assert.equal(entry?.state, "review");
  assert.equal(entry?.lastArtifactPath, "wiki/audits/2026-05-18-content-audit.md");
});

test("succeeded without artifact → state idle", () => {
  const s = useSpecialistsStore.getState();
  s.reset();
  s.setState("sitemap-architect", "running", { jobId: "j2" });
  s.setState("sitemap-architect", "succeeded", { jobId: "j2" });
  assert.equal(useSpecialistsStore.getState().byId["sitemap-architect"]?.state, "idle");
});

test("failed → state failed", () => {
  const s = useSpecialistsStore.getState();
  s.reset();
  s.setState("backlink-builder", "failed", { jobId: "j3" });
  assert.equal(useSpecialistsStore.getState().byId["backlink-builder"]?.state, "failed");
});
