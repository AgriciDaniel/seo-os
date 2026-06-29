import test from "node:test";
import assert from "node:assert/strict";
import { ribbonKind } from "../ribbon-kind";

test("approved → 'approved'", () => assert.equal(ribbonKind("approved"), "approved"));
test("needs-review → 'ribbon'", () => assert.equal(ribbonKind("needs-review"), "ribbon"));
test("rejected → 'rejected'", () => assert.equal(ribbonKind("rejected"), "rejected"));
test("undefined → 'unmarked'", () => assert.equal(ribbonKind(undefined), "unmarked"));
test("unknown string → 'unmarked'", () => assert.equal(ribbonKind("weird"), "unmarked"));
