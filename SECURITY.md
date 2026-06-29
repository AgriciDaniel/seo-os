# Security policy

SEO Office runs entirely on your own machine. API keys live in
`.env.local` (gitignored) and never leave your laptop. There is no
SEO Office server, no hosted database, and no telemetry endpoint we
operate.

That said, vulnerabilities in this code can still expose your local
data, your keys, or your client work. We take reports seriously.

## What counts as a security issue

- Anything that allows code in this repo (or in a dependency we pin)
  to read or exfiltrate files outside `.seo-office/<active-client>/`
  without explicit user action.
- Anything that causes `.env.local` contents to be logged, written to
  a file outside `.env.local`, or transmitted to a network endpoint
  we did not authorize.
- Path-traversal or SQL-injection paths into the brain SQLite index.
- Prompt-injection or tool-call-injection paths in the orchestrator
  that let a specialist's output run shell commands the user did not
  approve.
- Supply-chain risks in `vendored/claude-seo/` Python scripts or in
  the npm dependency tree that affect installation safety.

If you are unsure whether something qualifies, file it as a security
report anyway. False positives are cheap; missed reports are not.

## How to report a vulnerability

Please do **not** file a public GitHub issue with reproducible exploit
details. Instead, use one of these private channels:

1. **GitHub Security Advisories.** Open a private advisory at
   <https://github.com/AgriciDaniel/seo-os/security/advisories/new>.
   This is the preferred path because it gives us a single thread
   to track the report, propose a fix, and credit you on disclosure.
2. **AI Marketing Hub Pro Skool.** DM the maintainer (`@AgriciDaniel`)
   in the Pro community with the keyword `[security]` in the subject
   line. We will move the conversation to a private channel within
   24 hours.

Include the following so we can reproduce and assess scope:

- Affected file paths, commit hash (or version tag), and OS.
- Step-by-step reproduction (commands, inputs, expected vs actual).
- Suspected impact and any proof-of-concept artifact.

We will acknowledge the report within 72 hours, share a triage verdict
within 7 days, and aim to land a fix within 30 days for high-severity
issues. Status updates run on the same channel you reported through.

## Supported versions

| Version | Supported |
| ------- | --------- |
| `0.1.x` | yes — latest stable, fixes land on `main` first |
| `< 0.1` | no — pre-metamorphosis branches are unmaintained |

We do not currently backport fixes to pre-`0.1` checkpoints. Update to
the latest tag on `main`.

## What we ask in return

- Do not publish exploit details before a fix has shipped to `main`.
- Do not run the exploit against systems you do not own or have
  explicit permission to test (this includes the maintainer's own
  servers, demo deployments, and other members' machines).
- Do not exfiltrate other members' data while investigating.

A responsibly disclosed issue gets a credit line in the relevant
release notes and, where appropriate, a thank-you post in the Pro
community channel. Thanks for keeping the community safe.
