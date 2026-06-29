import assert from "node:assert/strict";
import test from "node:test";

import { reportApiPath, reportPathUnderReports } from "../url";

test("report URL helper strips reports prefix and encodes each segment", () => {
  assert.equal(
    reportPathUnderReports("reports/2026-05-13/keyword research.html"),
    "2026-05-13/keyword%20research.html",
  );
  assert.equal(
    reportApiPath("claude seo", "reports/2026-05-13/keyword research.html"),
    "/api/clients/claude%20seo/reports/2026-05-13/keyword%20research.html",
  );
});

test("report URL helper refuses traversal segments", () => {
  assert.equal(reportPathUnderReports("reports/../index.html"), "");
});
