/**
 * Node 24 ESM resolve hook for `node --test`.
 *
 * Bridges two gaps between the production app (Next.js bundler) and the
 * raw Node test runner:
 *
 *  1. `@/foo/bar` path aliases — Next resolves them via `tsconfig.json
 *     paths`; Node knows nothing about them. We map `@/...` → `<repo>/src/...`.
 *
 *  2. Extensionless TypeScript imports — Next implicitly resolves
 *     `./paths` to `./paths.ts`; Node's strict ESM resolver requires the
 *     extension. We try `.ts` first, then `.tsx`, before delegating.
 *
 * Wired in via the `--import` flag in package.json's `test` script. Keeps
 * the rest of the codebase free of test-only `.ts` extensions.
 */
import { register } from "node:module";

register("./test-resolve-hook-impl.mjs", import.meta.url);
