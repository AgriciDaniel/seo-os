# Getting help with SEO Office

SEO Office runs on your machine, so support is mostly about pointing
you at the right document or the right channel. Use whichever of the
three below fits the question.

## Self-serve first

Most "how do I X" questions are already answered in the repo:

- **Install + setup.** [`README.md`](README.md) walks through clone,
  installer, environment file, and the `/setup` wizard. The installer
  itself is `scripts/install.sh` and is safe to re-read if you want to
  know exactly what it does to your system.
- **Architecture.** [`docs/design/2026-05-11-seo-office-design.md`](docs/design/2026-05-11-seo-office-design.md)
  is the canonical layer-by-layer design (UI, orchestrator, brain,
  specialists).
- **What changed in this version.** [`CHANGELOG.md`](CHANGELOG.md).
- **Contributing patches.** [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Security disclosure.** [`SECURITY.md`](SECURITY.md) — do not file
  public issues for vulnerabilities, follow the private channels there.

## Bug reports + feature requests

Open a GitHub issue at
<https://github.com/AgriciDaniel/seo-os/issues/new>.

A good report has:

- What you ran (command, click path, or both).
- What you expected to happen.
- What actually happened, with the relevant chunk of terminal output
  or a screenshot of the office surface that misbehaved.
- Your environment: OS, Node version (`node -v`), pnpm version
  (`pnpm -v`), Python version (`python3 --version`), and which LLM
  provider you have configured.

We triage issues within a few days. Easy fixes ship the same week;
larger changes land on a branch first and get reviewed there.

## Conversations + community questions

Use the **AI Marketing Hub Pro** Skool community for:

- Workflow questions ("how should I structure my client vaults?").
- Brainstorming new specialists or new integrations before opening
  an issue.
- Sharing audits, screenshots, and lessons from your own runs.
- Real-time troubleshooting where back-and-forth in an issue thread
  would be slow.

Community link: <https://www.skool.com/ai-marketing-hub-pro>.

## What we cannot help with

- **Your API key billing.** DataForSEO, Google API, Bing, Firecrawl,
  and Anthropic billing questions go to the respective provider.
- **Client data recovery.** Your `.seo-office/<client>/` vault lives
  on your disk and we never see it. If you lose it without a backup,
  we cannot retrieve it. Back up the folder; the entire brain is
  text + JSON + a SQLite index, and it copies cleanly to any drive.
- **Operating-system level installs** beyond the hints in the
  installer. If `nvm` cannot install Node 24, that is an `nvm` issue,
  not an SEO Office issue.

## Response times (best effort)

| Channel | First response |
| --- | --- |
| Security advisory (private) | within 72 hours |
| GitHub issue (bug) | within a few days |
| GitHub issue (feature request) | weekly review |
| Skool community | usually same day during business hours |

If something is critical and time-sensitive, mention it in your
opening message so it surfaces to the top of the queue.
