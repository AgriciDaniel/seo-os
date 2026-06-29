import test from "node:test";
import assert from "node:assert/strict";
import { useConnectionsStore } from "../connections";

test("ensureEdge dedupes by (fromKey, toKey, kind)", () => {
  const s = useConnectionsStore.getState();
  s.reset();
  const id1 = s.ensureEdge(
    "chat:orchestrator",
    "remote-desktop:technical-auditor",
    "delegation",
  );
  const id2 = s.ensureEdge(
    "chat:orchestrator",
    "remote-desktop:technical-auditor",
    "delegation",
  );
  assert.equal(id1, id2);
  assert.equal(useConnectionsStore.getState().edges.length, 1);
});

test("different kinds produce different edges between same nodes", () => {
  const s = useConnectionsStore.getState();
  s.reset();
  s.ensureEdge("a", "b", "delegation");
  s.ensureEdge("a", "b", "return");
  assert.equal(useConnectionsStore.getState().edges.length, 2);
});

test("removeEdgesTouching drops every edge with that endpoint", () => {
  const s = useConnectionsStore.getState();
  s.reset();
  s.ensureEdge("a", "b", "delegation");
  s.ensureEdge("a", "c", "delegation");
  s.ensureEdge("d", "e", "delegation");
  s.removeEdgesTouching("a");
  assert.equal(useConnectionsStore.getState().edges.length, 1);
  assert.equal(useConnectionsStore.getState().edges[0].fromKey, "d");
});

test("pulse writes lastPulse one-shot", () => {
  const s = useConnectionsStore.getState();
  s.reset();
  const id = s.ensureEdge("a", "b", "delegation");
  s.pulse(id, "forward", "ok");
  const p = useConnectionsStore.getState().lastPulse;
  assert.ok(p);
  assert.equal(p!.edgeId, id);
  assert.equal(p!.direction, "forward");
  assert.equal(p!.kind, "ok");
});

test("pruneIdle drops edges older than threshold", async () => {
  const s = useConnectionsStore.getState();
  s.reset();
  s.ensureEdge("a", "b", "delegation");
  await new Promise((r) => setTimeout(r, 20));
  s.pruneIdle(10);
  assert.equal(useConnectionsStore.getState().edges.length, 0);
});
