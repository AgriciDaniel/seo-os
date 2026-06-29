#!/usr/bin/env python3
"""
Build a source-cited BEAST plan from the current vault state.

The script still writes a prompt-ready context bundle for optional agent review,
but it no longer leaves the deliverable as a stub. The markdown plan is usable
from shell, Codex, or Claude without hidden subagent dispatch.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REFERENCES = REPO_ROOT / "references"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vault", required=True)
    parser.add_argument("--out", default=None, help="Context bundle output path")
    parser.add_argument("--plan-out", default=None, help="Plan markdown output path")
    parser.add_argument("--business-type", default=None, help="Override business type detected from manifest")
    parser.add_argument("--references-dir", default=str(DEFAULT_REFERENCES))
    args = parser.parse_args(argv)

    vault = Path(args.vault).expanduser().resolve()
    if not vault.is_dir():
        print(f"ERROR: vault not found: {vault}", file=sys.stderr)
        return 1

    refs = Path(args.references_dir).expanduser().resolve()
    today = date.today().isoformat()
    raw_dir = vault / ".raw" / "sources" / "dataforseo"
    business_type = args.business_type or _detect_business_type(vault) or "unknown"
    client_meta = _detect_client_meta(vault)

    csv_path = _latest(sorted(vault.glob("keywords-*.csv")))
    competitors_path = _latest(sorted(raw_dir.glob("competitors-*.json")))
    paa_digest_path = _latest(sorted(raw_dir.glob("paa-digest-*.md")))
    current_search = refs / "current-search-requirements-2026-05-11.md"

    keyword_rows = _read_keyword_rows(csv_path) if csv_path else []
    competitor_rows = _read_competitors(competitors_path) if competitors_path else []
    paa_excerpt = _excerpt(paa_digest_path, 80) if paa_digest_path else "_No PAA digest found yet._"

    bundle_text = _build_bundle(
        vault=vault,
        refs=refs,
        business_type=business_type,
        csv_path=csv_path,
        competitors_path=competitors_path,
        paa_digest_path=paa_digest_path,
        current_search=current_search,
        keyword_rows=keyword_rows,
        competitor_rows=competitor_rows,
        paa_excerpt=paa_excerpt,
        today=today,
    )
    bundle_path = Path(args.out).expanduser().resolve() if args.out else (
        vault / ".raw" / "sources" / f"beast-plan-context-{today}.md"
    )
    _write_private(bundle_path, bundle_text)

    plan_text = _build_plan(
        today=today,
        vault=vault,
        client_meta=client_meta,
        business_type=business_type,
        csv_path=csv_path,
        competitors_path=competitors_path,
        paa_digest_path=paa_digest_path,
        current_search=current_search,
        keyword_rows=keyword_rows,
        competitor_rows=competitor_rows,
        paa_excerpt=paa_excerpt,
        bundle_path=bundle_path,
    )
    plan_path = Path(args.plan_out).expanduser().resolve() if args.plan_out else (
        vault / "wiki" / "deliverables" / "ULTIMATE BEAST Plan.md"
    )
    plan_path.parent.mkdir(parents=True, exist_ok=True)
    plan_path.write_text(plan_text, encoding="utf-8")

    _append_log(vault, today, plan_path, bundle_path)
    print(f"Wrote synthesis bundle: {bundle_path}")
    print(f"Wrote BEAST plan: {plan_path}")
    return 0


def _build_plan(
    *,
    today: str,
    vault: Path,
    client_meta: dict[str, str],
    business_type: str,
    csv_path: Path | None,
    competitors_path: Path | None,
    paa_digest_path: Path | None,
    current_search: Path,
    keyword_rows: list[dict[str, str]],
    competitor_rows: list[dict[str, Any]],
    paa_excerpt: str,
    bundle_path: Path,
) -> str:
    client_name = client_meta.get("client_name") or client_meta.get("client_slug", "Client").replace("-", " ").title()
    site_url = client_meta.get("site_url", "")
    top_keywords = keyword_rows[:12]
    high_volume = sorted(keyword_rows, key=lambda r: _float(r.get("search_volume")), reverse=True)[:8]
    competitors = competitor_rows[:10]
    top_score = _float(top_keywords[0].get("opportunity_score")) if top_keywords else 0.0
    source_lines = [
        _rel(vault, p) for p in [csv_path, competitors_path, paa_digest_path, current_search, bundle_path] if p
    ]

    lines: list[str] = [
        "---",
        "brain_schema: marketing-brain.v1",
        "type: deliverable",
        'title: "ULTIMATE BEAST Plan"',
        f"created: {today}",
        f"updated: {today}",
        "tags:",
        "  - deliverable",
        "  - beast-plan",
        "status: ready-for-review",
        f"business_type: {business_type}",
        f"owner: \"{client_meta.get('owner', 'Strategy Owner')}\"",
        "confidence: medium",
        "approval_status: needs-review",
        "rollback_note: \"Do not prune, redirect, publish, or migrate until source rows and owner approval are verified.\"",
        "risk_level: medium",
        "sources:",
    ]
    for source in source_lines:
        lines.append(f"  - \"{source}\"")
    lines.extend([
        "---",
        "",
        "# ULTIMATE BEAST Plan",
        "",
        f"Client: **{client_name}**",
        f"Site: **{site_url or 'not recorded'}**",
        f"Business type: **{business_type}**",
        f"Generated: **{today}**",
        "",
        "## Executive Summary",
        "",
        "This plan is a source-cited operating draft. It should be reviewed against Search Console, analytics, crawl data, and the live site before implementation. The strongest immediate path is to close the measurement gate, protect already-working URLs, consolidate cannibalized intent, and prioritize pages where competitor demand is visible and the current site is not already winning.",
        "",
        f"The current keyword surface contains **{len(keyword_rows)}** deduplicated opportunities. "
        f"The top visible opportunity score is **{top_score:.2f}**. "
        f"The competitor set contains **{len(competitor_rows)}** ranked domains from the latest competitor pull.",
        "",
        "## Search And AI Feature Ground Rules",
        "",
        "Google's current guidance says normal SEO fundamentals apply to AI Overviews and AI Mode, no special AI-only schema or machine-readable file is required, and Search Console reports AI feature traffic inside the overall Web performance data. This plan therefore optimizes for crawlability, index eligibility, helpful content, source clarity, internal links, structured data accuracy, and measurement quality rather than promising AI Overview inclusion.",
        "",
        "## Find: Market And Competitor Signals",
        "",
    ])
    if competitors:
        lines.extend(["Top competitor signals from the latest pull:", ""])
        for i, comp in enumerate(competitors, 1):
            lines.append(
                f"{i}. **{comp.get('domain')}** — score {comp.get('score')}, "
                f"appearances {comp.get('appearances')}, average position {comp.get('avg_position')}."
            )
    else:
        lines.append("No competitor pull is present yet. Run `marketing-brain competitors` before treating this section as complete.")
    lines.extend([
        "",
        "## Leverage: Keyword Opportunities",
        "",
    ])
    if top_keywords:
        lines.append("| keyword | volume | best competitor | our position | opportunity | intent |")
        lines.append("|---|---:|---|---:|---:|---|")
        for row in top_keywords:
            lines.append(
                f"| {_clean_cell(row.get('keyword'))} | {row.get('search_volume', '')} | "
                f"{_clean_cell(row.get('best_competitor_domain'))} #{row.get('best_competitor_position', '')} | "
                f"{row.get('our_position', '')} | {row.get('opportunity_score', '')} | "
                f"{_clean_cell(row.get('intent'))} |"
            )
    else:
        lines.append("No keyword workbook is present yet. Run `marketing-brain keywords` and `marketing-brain xlsx`.")
    lines.extend([
        "",
        "High-volume demand to protect or investigate:",
        "",
    ])
    if high_volume:
        for row in high_volume:
            lines.append(f"- **{row.get('keyword')}** — volume {row.get('search_volume')}, current URL `{row.get('our_url') or 'not ranking'}`.")
    else:
        lines.append("- Pending keyword workbook.")
    lines.extend([
        "",
        "## Optimize: Page And Content Actions",
        "",
        "1. Complete Day 0 measurement access before any irreversible recommendation.",
        "2. Map every target keyword to exactly one canonical URL owner.",
        "3. Refresh existing owner URLs before publishing competing same-intent pages.",
        "4. Consolidate or prune only after GSC loss data, crawl status, backlink risk, and conversion impact are checked.",
        "5. Add first-hand evidence, author/source proof, visuals, examples, and structured data that matches visible page content.",
        "",
        "## Win: 30-Day Execution Roadmap",
        "",
        "| window | outcome | required evidence | rollback |",
        "|---|---|---|---|",
        "| Days 0-2 | Measurement gate closed | GSC, GA4, crawl, CMS/source access | Pause optimization claims |",
        "| Days 3-7 | Keyword-to-URL ownership map | Workbook rows, current URLs, SERP intent | Revert owner assignment |",
        "| Days 8-14 | Refresh/prune shortlist | GSC exports, crawl/index data, content QA | Restore prior page/redirect state |",
        "| Days 15-21 | New or refreshed hero pages | Briefs, source notes, approval record | Unpublish or revert page |",
        "| Days 22-30 | Report and next sprint | Scorecard, action log, open risks | Keep sprint in review |",
        "",
        "## PAA And Content Gap Notes",
        "",
        paa_excerpt,
        "",
        "## Action Queue",
        "",
        "| action | source | confidence | owner | approval | rollback |",
        "|---|---|---|---|---|---|",
        "| Close Day 0 measurement access | `wiki/flows/Day 0 Measurement Access Gate.md` | high | Strategy Owner | needs-review | Keep recommendations as hypotheses |",
        "| Verify top 12 keyword owner URLs | latest keyword CSV | medium | Strategy Owner | needs-review | Revert keyword map entries |",
        "| Inspect top competitor page formats | latest competitors JSON | medium | Strategy Owner | needs-review | Remove unsupported competitor assumptions |",
        "| Build next 30-day sprint board | this BEAST plan | medium | Strategy Owner | needs-review | Return sprint to draft |",
        "",
        "## Source Manifest",
        "",
    ])
    for source in source_lines:
        lines.append(f"- `{source}`")
    lines.extend([
        "",
        "## Review Status",
        "",
        "This deliverable is ready for human review, not direct implementation. Any prune, redirect, migration, publication, or measurement change still needs owner approval and rollback evidence.",
    ])
    return "\n".join(lines) + "\n"


def _build_bundle(
    *,
    vault: Path,
    refs: Path,
    business_type: str,
    csv_path: Path | None,
    competitors_path: Path | None,
    paa_digest_path: Path | None,
    current_search: Path,
    keyword_rows: list[dict[str, str]],
    competitor_rows: list[dict[str, Any]],
    paa_excerpt: str,
    today: str,
) -> str:
    parts = [
        "---",
        "brain_schema: marketing-brain.v1",
        "type: source",
        'title: "Beast Plan Synthesis Bundle"',
        f"created: {today}",
        f"updated: {today}",
        "tags:",
        "  - source/internal",
        "  - beast-plan",
        "status: developing",
        "---",
        "",
        "# Beast Plan Synthesis Bundle",
        "",
        f"Vault: `{vault.name}`",
        f"Business type: `{business_type}`",
        "",
        "## Current Search Requirements",
        "",
        _excerpt(current_search, 120),
        "",
        "## FLOW Framework",
        "",
        _excerpt(refs / "flow-framework.md", 120),
        "",
        "## Keyword Summary",
        "",
        f"Source: `{_rel(vault, csv_path)}`" if csv_path else "Source: missing",
        f"Rows: {len(keyword_rows)}",
        "",
        "## Top Keywords",
        "",
    ]
    for row in keyword_rows[:25]:
        parts.append(f"- {row.get('keyword')} | volume {row.get('search_volume')} | score {row.get('opportunity_score')}")
    parts.extend([
        "",
        "## Competitors",
        "",
        f"Source: `{_rel(vault, competitors_path)}`" if competitors_path else "Source: missing",
    ])
    for comp in competitor_rows[:20]:
        parts.append(f"- {comp.get('domain')} | score {comp.get('score')} | appearances {comp.get('appearances')}")
    parts.extend([
        "",
        "## PAA Digest",
        "",
        f"Source: `{_rel(vault, paa_digest_path)}`" if paa_digest_path else "Source: missing",
        "",
        paa_excerpt,
    ])
    return "\n".join(parts) + "\n"


def _read_keyword_rows(path: Path | None) -> list[dict[str, str]]:
    if not path or not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows.sort(key=lambda r: _float(r.get("opportunity_score")), reverse=True)
    return rows


def _read_competitors(path: Path | None) -> list[dict[str, Any]]:
    if not path or not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return list(data.get("competitors") or [])


def _detect_business_type(vault: Path) -> str | None:
    return _detect_client_meta(vault).get("business_type")


def _detect_client_meta(vault: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    manifest = vault / ".raw" / ".manifest.json"
    if not manifest.exists():
        return out
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return out
    history = data.get("scaffold_history") or []
    if history:
        last = history[-1]
        for key in ("client_slug", "business_type", "site_url", "client_name", "owner"):
            if last.get(key):
                out[key] = str(last[key])
    return out


def _append_log(vault: Path, today: str, plan_path: Path, bundle_path: Path) -> None:
    log = vault / "wiki" / "log.md"
    if not log.exists():
        return
    entry = (
        f"\n## {today} - BEAST Plan Synthesized\n\n"
        f"- Wrote `{_rel(vault, plan_path)}`.\n"
        f"- Source bundle: `{_rel(vault, bundle_path)}`.\n"
        "- Status: ready for human review.\n"
    )
    text = log.read_text(encoding="utf-8")
    if "BEAST Plan Synthesized" not in text:
        log.write_text(text.rstrip() + "\n" + entry.strip() + "\n", encoding="utf-8")


def _latest(paths: list[Path]) -> Path | None:
    return paths[-1] if paths else None


def _excerpt(path: Path | None, n: int) -> str:
    if not path or not path.exists():
        return "_Missing source._"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return "_Unreadable source._"
    return "\n".join(lines[:n])


def _write_private(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        import _dfs_client as dfs
        dfs.write_private_text(path, text)
    except Exception:
        path.write_text(text, encoding="utf-8")


def _rel(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        try:
            return path.relative_to(REPO_ROOT).as_posix()
        except ValueError:
            return path.name


def _clean_cell(value: str | None) -> str:
    return (value or "").replace("|", "/").replace("\n", " ").strip()


def _float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


if __name__ == "__main__":
    raise SystemExit(main())
