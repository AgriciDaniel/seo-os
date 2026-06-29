import test from "node:test";
import assert from "node:assert/strict";

import {
  missingRequiredIntegrations,
  missingOptionalIntegrations,
  optionalIntegrationDegradation,
  summarizeSpecialistIntegrationReadiness,
} from "../integration-readiness.ts";

test("R9 readiness summary reports pre-click build-brain skips from required integrations", () => {
  const summary = summarizeSpecialistIntegrationReadiness(
    [
      { specialist_id: "technical-auditor" },
      { specialist_id: "keyword-researcher" },
      { specialist_id: "topic-clusterer" },
    ],
    { env: {}, e2eMockSpecialists: false },
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.ready, 1);
  assert.equal(summary.willSkip, 2);
  assert.deepEqual(summary.missingIntegrationNames, ["DataForSEO"]);
  assert.deepEqual(
    summary.skips.map((skip) => skip.specialistId),
    ["keyword-researcher", "topic-clusterer"],
  );
});

test("R9 readiness summary treats configured required integrations as ready", () => {
  const env = {
    DATAFORSEO_LOGIN: "user@example.com",
    DATAFORSEO_PASSWORD: "secret",
  };

  assert.deepEqual(missingRequiredIntegrations("keyword-researcher", { env }), []);
  const summary = summarizeSpecialistIntegrationReadiness(
    [{ specialist_id: "keyword-researcher" }],
    { env },
  );
  assert.equal(summary.ready, 1);
  assert.equal(summary.willSkip, 0);
});

test("R9 optional integrations degrade instead of pretending full live confidence", () => {
  const emptyEnv = {};
  assert.deepEqual(
    missingOptionalIntegrations("backlink-analyst", {
      env: emptyEnv,
      e2eMockSpecialists: false,
    }),
    ["dataforseo", "bing"],
  );

  const degradation = optionalIntegrationDegradation("backlink-analyst", {
    env: emptyEnv,
    e2eMockSpecialists: false,
  });

  assert.deepEqual(degradation.missingNames, ["DataForSEO", "Bing Webmaster"]);
  assert.deepEqual(degradation.artifact, {
    confidence: "low",
    dataSources: ["model_estimate"],
  });
  assert.equal(degradation.result.degraded, true);
  assert.match(
    degradation.result.degradationReason ?? "",
    /model-estimated low-confidence/,
  );
});

test("R9 optional integration degradation clears when optional providers are configured", () => {
  const env = {
    DATAFORSEO_LOGIN: "user@example.com",
    DATAFORSEO_PASSWORD: "secret",
    BING_WEBMASTER_API_KEY: "bing-secret",
  };

  assert.deepEqual(missingOptionalIntegrations("backlink-analyst", { env }), []);
  assert.deepEqual(optionalIntegrationDegradation("backlink-analyst", { env }), {
    missing: [],
    missingNames: [],
    artifact: {},
    result: {},
  });
});
