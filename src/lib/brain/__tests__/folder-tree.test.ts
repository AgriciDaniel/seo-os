import test from "node:test";
import assert from "node:assert/strict";
import { buildFolderTree } from "../folder-tree";

interface MockNote { path: string; approval_status?: string }

test("flat root files appear as leaf children of root", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "hot.md" },
    { path: "log.md" },
    { path: "index.md" },
  ]);
  assert.equal(tree.folders.length, 0);
  assert.equal(tree.files.length, 3);
  assert.deepEqual(tree.files.map((f) => f.note.path), ["hot.md", "index.md", "log.md"]);
});

test("single-segment prefix builds a folder with files inside", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "audits/2026-05-12-audit.md" },
    { path: "audits/2026-05-08-audit.md" },
    { path: "hot.md" },
  ]);
  assert.equal(tree.folders.length, 1);
  assert.equal(tree.folders[0].name, "audits");
  assert.equal(tree.folders[0].files.length, 2);
  assert.equal(tree.files.length, 1);
  assert.equal(tree.files[0].note.path, "hot.md");
});

test("nested prefix produces nested folders", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "sources/dataforseo/2026-05.json" },
    { path: "sources/gsc/queries-q2.json" },
  ]);
  assert.equal(tree.folders.length, 1);
  assert.equal(tree.folders[0].name, "sources");
  assert.equal(tree.folders[0].folders.length, 2);
  const dfs = tree.folders[0].folders.find((f) => f.name === "dataforseo")!;
  assert.equal(dfs.files.length, 1);
  assert.equal(dfs.files[0].note.path, "sources/dataforseo/2026-05.json");
});

test("folders are sorted alphabetically; files by path", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "zeta/z.md" },
    { path: "alpha/a.md" },
    { path: "beta/b.md" },
  ]);
  assert.deepEqual(tree.folders.map((f) => f.name), ["alpha", "beta", "zeta"]);
});
