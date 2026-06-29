/**
 * Canonical client slug normalizer.
 *
 * Shared by browser onboarding and server scaffolding so a long or odd
 * client name cannot derive two different vault paths.
 */
export function toClientSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}
