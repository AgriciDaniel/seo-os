# Contributing to SEO Office

SEO Office is open source under the GNU AGPL-3.0. Patches are welcome
from anyone — by submitting a contribution you agree it is licensed
under the same AGPL-3.0 terms as the project.

This document is short on purpose. Open an issue, propose a change,
and we will work out the rest in the thread.

## Before you start

- Read `AGENTS.md`. It is the canonical context document for both
  human and AI contributors. The hard rules at the top of that file
  are non-negotiable (no committing user vaults, no leaked keys, no
  build-time telemetry, every brain entity is client-scoped).
- Skim `docs/design/2026-05-11-seo-office-design.md` for the four
  layer model (UI → Orchestrator → Brain → Specialists). Most patches
  fit cleanly into one of those layers; if yours spans more than one
  layer, expect a longer review.
- Run the existing test suite (`pnpm test`) before you change
  anything. The current baseline is 189 / 189 green. If your machine
  cannot reach that, fix the local issue before you start editing
  code so we are not chasing two problems at once.

## The contribution loop

1. **Open an issue first** for anything beyond a typo or a one-line
   fix. The issue is where we agree on the problem and the rough
   shape of the fix before you spend an afternoon on it.
2. **Branch from `main`.** Pick a name like
   `fix/<area>-<short-description>` or
   `feat/<area>-<short-description>`.
3. **Keep changes small.** One concern per pull request. If you find
   yourself touching three unrelated areas, split it into three PRs.
4. **Add tests** when you change behavior. Pattern after the existing
   files in `src/lib/**/__tests__/` and `src/components/**/__tests__/`.
   Node's built-in `node:test` runner is the harness; no Jest, no
   Vitest.
5. **Run the full gate suite** before requesting review:

   ```bash
   pnpm typecheck   # tsc --noEmit, must be clean
   pnpm lint        # eslint, must report 0 errors
   pnpm test        # all unit tests must pass
   ```

   Pre-existing lint warnings in unrelated files are fine to leave;
   do not introduce new ones in the files you touch.
6. **Open a pull request** against `main`. Fill in the description
   with: what changed, why it changed, how you verified it, and any
   follow-up work you spotted but did not do.

## Code conventions

- TypeScript everywhere in `src/`. Avoid `any`; reach for `unknown`
  with a type guard when the boundary is genuinely dynamic.
- No hardcoded color hex outside the theme token map at
  `src/components/office/themes/theme-config.ts`. Components read
  CSS variables (`var(--accent)`, `var(--panel-bg)`, etc.) so theme
  switching keeps working.
- No new dependencies without explicit approval in the issue. Adding
  a package crosses a maintenance boundary; we need to discuss it
  first.
- Prefer extending an existing file over creating a new one for
  related logic. Three similar lines beat a premature abstraction.
- Specialists go in `src/lib/specialists/`. Each one registers via
  `registerSpecialist({ id, name, ... })` and lives in its own file.
- API routes go in `src/app/api/<route>/route.ts`. Always validate
  query params with Zod and scope database queries by `client_slug`.

## Commit messages

We use Conventional Commits. The history at `git log --oneline -20`
on `main` is the live reference. In short:

- `feat(area): one-line summary` for new behavior.
- `fix(area): one-line summary` for bug fixes.
- `refactor(area): one-line summary` for no-behavior-change cleanup.
- `chore(area): one-line summary` for build, dependencies, repo files.
- `docs(area): one-line summary` for documentation-only changes.

Multi-line bodies are encouraged for non-trivial changes. Explain the
why, not just the what. Reference the issue number with `Closes #N`
or `Refs #N` when relevant.

## Reviews

Expect a review within a few days. The reviewer will lean on the
`/best-practices` kernel:

- Did you read the surrounding code before writing the change?
- Is the change the smallest unit that solves the stated problem?
- Is there an undo plan (clean `git revert` target) if something
  breaks downstream?
- Did you verify the fix end-to-end, or just type-check it?

We are friendly but rigorous about this. Catching issues in review
beats catching them in production.

## What to do when you find a security issue

Do not file a public issue. See `SECURITY.md` for the private
disclosure path.

## Questions

Open a `question` issue, or post in the Pro Skool community.
Maintainer turnaround is usually within a day or two.

Thanks for contributing.
