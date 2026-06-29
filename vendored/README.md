# vendored/

Source code copied verbatim from upstream repos, used as reference and/or invoked at runtime.

Each subtree is a **point-in-time snapshot** taken at the start of SEO Office v0.1.0. We do not auto-sync with upstream. If upstream evolves, we manually re-vendor with `scripts/revendor.sh` (TBD).

## marketing-brain/

Snapshot of [AgriciDaniel/marketing-brain](https://github.com/AgriciDaniel/marketing-brain).

| Path | What we use |
| --- | --- |
| `template-brain/` | The Obsidian vault template that becomes each client's brain. Rendered by `src/lib/brain/scaffold.ts` via slot-filling `{{placeholder}}` tokens. |
| `references/business-types/` | Per-vertical strategic overlays (affiliate, SaaS, local, ecommerce, B2B, publisher). Copied per client at scaffold time. |
| `references/` | Strategic framework docs (FLOW, beast-plan-prompt, CODEX). Used as input context for the BEAST planner specialist. |
| `agents/` | The 3 subagent prompts (`beast-planner`, `vault-synthesizer`, `keyword-curator`). Ported to TS specialist modules. |
| `scripts/` | Python pipeline scripts. Most are invoked verbatim via `child_process.spawn`; `guide_next_action.py` and `_vault_renderer.py` are ported to TS. |

## claude-seo/

Snapshot of [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo).

| Path | What we use |
| --- | --- |
| `scripts/` | 32 Python scripts for fetching, parsing, auditing. Vendored and invoked via `child_process.spawn` from `src/lib/integrations/python.ts`. |
| `skills/` | 25 skill `SKILL.md` files. Prompt logic is ported to TS specialist modules in `src/lib/specialists/`. The originals remain here as reference. |
| `agents/` | 18 subagent definitions. Used as reference when porting; the runtime specialists in TS replace them. |

## Why vendor instead of installing as plugins?

See [`docs/design/2026-05-11-seo-office-design.md`](../docs/design/2026-05-11-seo-office-design.md) §"Repository → layer mapping" and [`AGENTS.md`](../AGENTS.md). Short version: claude-seo and marketing-brain are Claude Code skills, not npm packages. They cannot be `pnpm install`ed. Vendoring also lets us pin a known-good snapshot and modify it freely.
