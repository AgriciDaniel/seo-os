# Changelog

All notable changes to SEO Office are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Releases are tagged in this repository and mirrored to the GitHub Releases
page at <https://github.com/AgriciDaniel/seo-os/releases>.

## [Unreleased]

Nothing yet. Open an issue or PR to propose what's next.

## [0.1.0] — 2026-05-19

First tagged release. The legacy dashboard becomes a full 3D operating
system shell.

### Added

- **OS-style window manager** with traffic lights, drag, resize, minimize
  to a tray, maximize, aero-snap, and keyboard shortcuts (Cmd+W close,
  Cmd+M minimize, Cmd+1..7 themes).
- **3D office** built on React Three Fiber 9 — orchestrator dais, 25
  specialist desks, brain chandelier overhead. Click a desk to walk in;
  click a brain node to open the underlying note.
- **Right-sidebar TaskFeed** with six distinct states (`RUNNING`,
  `REVIEW`, `DONE`, `SKIPPED`, `BLOCKED`, `FAILED`). Height-locked and
  scrollable; click any row to open that specialist's report.
- **Click-through StatusBar** — HEALTH and REVIEW cells open the latest
  vault-lint report and brain-sweep review in NoteWindows. Labels are
  dynamic (HEALTH 0 now reads `ERRORS` in red instead of the impossible
  `0 CLEAN` legacy text).
- **Soft-skip vs hard-fail vs blocked** in the orchestrator. Graceful
  refusals (e.g. unverified Search Console property) render as yellow
  `SKIPPED`. Upstream gate failures (e.g. phase-gate hits vault lint
  errors) render as amber `BLOCKED`. Real crashes stay red `FAILED`.
- **Multi-format file viewer** — Markdown, HTML, PDF, JSON, CSV, DOCX,
  XLSX, ZIP, MP3, MP4, PNG, plus `/api/...` report iframes.
- **Seven themes** (Cosmos, Clouds, Forest, Datacenter, Sunset, Ocean,
  Retro) propagate via CSS custom properties from a single token map.
- **Setup ↔ Office round-trip** — active client and theme persist via
  localStorage. The same picker logic powers both surfaces.
- **First-run wizard at `/setup`** — picks an LLM provider, walks through
  Google OAuth via gcloud, and lists optional integration cards (
  DataForSEO, Google AI Studio, Bing Webmaster, Firecrawl).
- **Phase-gate ordinal display** — the four phase-gates in a brain sweep
  render as `intake-gate`, `diagnostic-gate`, `discovery-gate`, and
  `synthesis-gate` in the TaskFeed instead of four identical
  `phase-gate` rows.
- **System window** showing real active client, LLM provider, integration
  status, and Python runtime detection. Opens from the MenuBar.

### Changed

- **Floating overlays consolidated into `TaskFeedDock`.** The legacy
  SweepCard, NextActionCard, and JobStream all lived on top of the 3D
  canvas. They now live inside the right sidebar as a banner row, a tally
  header, a live-job tail, and the historical task list.
- **MenuBar nav moved to the right side** and gained an OS-themed client
  picker. Nav reads `OFFICE / SETUP / SYSTEM` followed by the active
  client dropdown and notifications.
- **`/setup` theme** now matches the office (cosmos gradient, brand
  orange accent, shared CSS variables) instead of the legacy palette.

### Fixed

- Brain remount bug that caused the chandelier to disappear after
  navigating to a specialist and back.
- Drop-time overlap when dragging a window on top of another — both
  paths now go through the shared `findNonOverlappingPosition` helper.
- Specialist Inbox UUID fallback where rows rendered raw IDs because the
  outer tab read `a.headline` while the API returns `title`.
- `HEALTH 0 CLEAN` contradiction in the StatusBar caused by a hardcoded
  hint string.

### Quality gates

- 189 / 189 unit tests pass.
- `pnpm typecheck` and `pnpm lint` are clean.
- Manual ship-readiness audit: README, `install.sh`, `.env.example`, and
  first-run `/setup` flow all verified.

### Notes

The repository moves to `AgriciDaniel/seo-os` as the canonical
private distribution target. The earlier `AgriciDaniel/seo-os` remote is
retained for history.

[Unreleased]: https://github.com/AgriciDaniel/seo-os/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AgriciDaniel/seo-os/releases/tag/v0.1.0
