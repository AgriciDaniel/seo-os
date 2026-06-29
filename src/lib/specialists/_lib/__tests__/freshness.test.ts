import { test } from "node:test";
import assert from "node:assert/strict";

test("every ready specialist declares a freshness TTL", async () => {
  const { READY_SPECIALISTS } = await import("@/lib/specialists/catalog.ts");
  const { SPECIALIST_FRESHNESS_TTL_DAYS } = await import("../freshness.ts");

  for (const specialist of READY_SPECIALISTS) {
    assert.equal(
      Number.isInteger(SPECIALIST_FRESHNESS_TTL_DAYS[specialist.id]),
      true,
      `${specialist.id} must declare freshness TTL days`,
    );
    assert.ok(SPECIALIST_FRESHNESS_TTL_DAYS[specialist.id] > 0, specialist.id);
  }
});
