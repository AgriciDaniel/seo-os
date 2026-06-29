import "server-only";

export function isE2EMockSpecialistsEnabled(): boolean {
  return process.env.SEO_OFFICE_E2E_MOCK_SPECIALISTS === "1";
}

export function e2eMockSpecialistDelayMs(): number {
  const raw = Number(process.env.SEO_OFFICE_E2E_MOCK_SPECIALIST_DELAY_MS ?? 250);
  if (!Number.isFinite(raw) || raw < 0) return 250;
  return Math.min(raw, 2_000);
}
