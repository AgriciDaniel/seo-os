import test from "node:test";
import assert from "node:assert/strict";
import { useWindowStore } from "../windows";

test("opens a window with auto-incrementing z and unique id", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const id1 = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  const id2 = s.open({ kind: "note", title: "b.md", icon: "📄", contentProps: {} });
  const ws = useWindowStore.getState().windows;
  assert.equal(ws.length, 2);
  assert.notEqual(id1, id2);
  assert.ok(ws[1].z > ws[0].z, "second window should be on top");
});

test("focus brings a window to front", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const a = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  s.open({ kind: "note", title: "b.md", icon: "📄", contentProps: {} });
  s.focus(a);
  const ws = useWindowStore.getState().windows;
  const aWin = ws.find((w) => w.id === a)!;
  const others = ws.filter((w) => w.id !== a);
  assert.ok(others.every((w) => aWin.z > w.z), "focused window must have highest z");
});

test("minimize sets minimized=true; restore clears it and refocuses", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const id = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  s.minimize(id);
  assert.equal(useWindowStore.getState().windows[0].minimized, true);
  const zBefore = useWindowStore.getState().windows[0].z;
  s.restore(id);
  const after = useWindowStore.getState().windows[0];
  assert.equal(after.minimized, false);
  assert.ok(after.z > zBefore, "restore must bump z to top");
});

test("close removes the window from the array", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const id = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  s.close(id);
  assert.equal(useWindowStore.getState().windows.length, 0);
});

test("toggleMaximize flips boolean", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const id = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  assert.equal(useWindowStore.getState().windows[0].maximized, false);
  s.toggleMaximize(id);
  assert.equal(useWindowStore.getState().windows[0].maximized, true);
  s.toggleMaximize(id);
  assert.equal(useWindowStore.getState().windows[0].maximized, false);
});

test("setPosition updates x/y for one window without affecting others", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const a = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  const b = s.open({ kind: "note", title: "b.md", icon: "📄", contentProps: {} });
  s.setPosition(a, 200, 300);
  const ws = useWindowStore.getState().windows;
  const aWin = ws.find((w) => w.id === a)!;
  const bWin = ws.find((w) => w.id === b)!;
  assert.equal(aWin.x, 200);
  assert.equal(aWin.y, 300);
  assert.notEqual(bWin.x, 200);
});
