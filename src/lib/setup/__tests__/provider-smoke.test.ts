import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isProviderConfigured,
  runProviderSmoke,
  sanitizeSmokeText,
} from "@/lib/setup/provider-smoke.ts";

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, ...values };
}

test("dry-run smoke reports required provider gaps without live network probes", async () => {
  const report = await runProviderSmoke({
    providerIds: ["dataforseo", "search-console", "ga4"],
    requiredIds: ["dataforseo", "search-console", "ga4"],
    env: env(),
    gcloud: {
      adcAvailableSync: () => false,
      hasScopeSync: () => false,
    },
  });

  assert.equal(report.mode, "dry-run");
  assert.equal(report.launchReady, false);
  assert.deepEqual(
    report.results.map((result) => [result.id, result.status]),
    [
      ["dataforseo", "missing"],
      ["search-console", "missing"],
      ["ga4", "missing"],
    ],
  );
});

test("dry-run smoke treats configured required providers as launch-ready", async () => {
  const report = await runProviderSmoke({
    providerIds: ["dataforseo", "search-console", "ga4"],
    requiredIds: ["dataforseo", "search-console", "ga4"],
    env: env({
      DATAFORSEO_LOGIN: "user@example.com",
      DATAFORSEO_PASSWORD: "secret-password",
    }),
    gcloud: {
      adcAvailableSync: () => true,
      hasScopeSync: () => true,
    },
  });

  assert.equal(report.launchReady, true);
  assert.deepEqual(
    report.results.map((result) => [result.id, result.status]),
    [
      ["dataforseo", "configured"],
      ["search-console", "configured"],
      ["ga4", "configured"],
    ],
  );
});

test("provider configuration checks distinguish gcloud scopes", () => {
  assert.equal(
    isProviderConfigured("search-console", {
      env: env(),
      gcloud: {
        adcAvailableSync: () => true,
        hasScopeSync: (scope) => scope.includes("webmasters"),
      },
    }),
    true,
  );
  assert.equal(
    isProviderConfigured("ga4", {
      env: env(),
      gcloud: {
        adcAvailableSync: () => true,
        hasScopeSync: (scope) => scope.includes("analytics"),
      },
    }),
    true,
  );
});

test("smoke output redacts configured secret values", () => {
  const text = sanitizeSmokeText(
    "request failed for secret-password and api-token-123",
    ["secret-password", "api-token-123"],
  );

  assert.equal(text, "request failed for [redacted] and [redacted]");
});
