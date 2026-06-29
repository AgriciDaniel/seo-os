#!/usr/bin/env python3
"""
Step 2 — pull every keyword each competitor (and the site itself) ranks for.

What it does
------------
Reads ``<vault>/.raw/sources/dataforseo/competitors-<date>.json`` (most recent
unless ``--competitors`` overrides) and calls DataForSEO Labs
``/dataforseo_labs/google/ranked_keywords/live`` for every competitor domain
plus, by default, the site's own root domain. Persists raw JSON per domain so
later steps don't have to re-pay.

Inputs
------
- ``--vault``: vault root.
- ``--competitors``: explicit competitors JSON path (optional; defaults to most recent).
- ``--limit-per-comp``: max keywords pulled per competitor per page (default 1000, max DataForSEO allows).
- ``--max-pages-per-comp``: 0 means "all pages" (default 1 — keeps cost predictable).
- ``--location`` / ``--language``: standard DataForSEO codes.
- ``--include-self`` / ``--no-include-self``: pull the site's own ranked keywords
  (default: include).
- ``--cost-cap`` / ``--total-cap``: USD caps.

Outputs
-------
- ``<vault>/.raw/sources/dataforseo/competitor-kw-<domain-slug>-<date>.json`` per competitor.
- ``<vault>/.raw/sources/dataforseo/site-ranked-keywords-<date>.json`` for the site.

Cost
----
~$0.05 per competitor at limit=1000, 1 page. With 10 competitors + self: ~$0.55.
The script enforces caps; partial output is preserved if a cap fires.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import _dfs_client as dfs

ENDPOINT = "/v3/dataforseo_labs/google/ranked_keywords/live"


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "x"


def _root_domain(host: str) -> str:
    host = host.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


def _resolve_competitors_file(vault: Path, explicit: str | None) -> Path:
    out_dir = vault / ".raw" / "sources" / "dataforseo"
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if not p.exists():
            raise FileNotFoundError(p)
        return p
    candidates = sorted(out_dir.glob("competitors-*.json"))
    if not candidates:
        raise FileNotFoundError(f"No competitors-*.json found in {out_dir}. Run find_competitors.py first.")
    return candidates[-1]


def _payload(domain: str, location: int, language: str, limit: int, offset: int) -> list[dict[str, Any]]:
    return [{
        "target": domain,
        "location_code": location,
        "language_code": language,
        "item_types": ["organic"],
        "limit": limit,
        "offset": offset,
        "filters": [
            ["keyword_data.keyword_info.search_volume", ">", 0],
            "and",
            ["ranked_serp_element.serp_item.rank_group", "<=", 100],
        ],
        "order_by": [
            "ranked_serp_element.serp_item.rank_group,asc",
            "keyword_data.keyword_info.search_volume,desc",
        ],
        "tag": f"{domain}|{offset}",
    }]


def _pull_domain(
    domain: str,
    *,
    location: int,
    language: str,
    limit: int,
    max_pages: int,
    out_dir: Path,
    today: str,
    label: str,
    file_prefix: str,
) -> tuple[Path, int, int]:
    """Pull all (or up to ``max_pages``) ranked-keyword pages for a domain.

    Writes a single concatenated JSON file with all items plus per-page metadata.
    Returns (output_path, items_count, total_count_reported).
    """
    pages_data: list[dict[str, Any]] = []
    items_total = 0
    total_count_reported = 0
    offset = 0
    pages = 0
    while True:
        page_label = f"{label}/offset={offset}"
        # save raw page for audit
        per_page_path = out_dir / f"{file_prefix}-{_slug(domain)}-page-{offset}-{today}.json"
        data = dfs.call(
            ENDPOINT,
            _payload(domain, location, language, limit, offset),
            label=page_label,
            save_to=per_page_path,
        )
        tasks = data.get("tasks") or []
        if not tasks:
            break
        result = (tasks[0].get("result") or [{}])[0]
        items = result.get("items") or []
        total_count_reported = result.get("total_count") or total_count_reported
        items_total += len(items)
        pages_data.append({
            "offset": offset,
            "items_count": len(items),
            "items": items,
        })
        pages += 1
        if not items:
            break
        offset += limit
        if total_count_reported and offset >= total_count_reported:
            break
        if max_pages and pages >= max_pages:
            break

    consolidated = {
        "domain": domain,
        "generated_at": today,
        "location_code": location,
        "language_code": language,
        "items_pulled": items_total,
        "total_count_reported": total_count_reported,
        "pages": pages_data,
    }
    out_path = out_dir / f"{file_prefix}-{_slug(domain)}-{today}.json"
    dfs.write_private_text(out_path, json.dumps(consolidated, indent=2) + "\n")
    return out_path, items_total, total_count_reported


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vault", required=True, help="Vault root directory")
    parser.add_argument("--competitors", default=None, help="Path to competitors-*.json (defaults to most recent)")
    parser.add_argument("--limit-per-comp", type=int, default=1000, help="Items per page (max DataForSEO allows)")
    parser.add_argument("--max-pages-per-comp", type=int, default=1, help="0 = all pages")
    parser.add_argument("--location", type=int, default=2124)
    parser.add_argument("--language", default="en")
    parser.add_argument("--cost-cap", type=float, default=0.50)
    parser.add_argument("--total-cap", type=float, default=5.00)
    inc_group = parser.add_mutually_exclusive_group()
    inc_group.add_argument("--include-self", dest="include_self", action="store_true", default=True)
    inc_group.add_argument("--no-include-self", dest="include_self", action="store_false")
    parser.add_argument("--site", default=None, help="Site URL (defaults to value in competitors JSON)")
    parser.add_argument("--dry-run", action="store_true", help="Preview ranked-keyword calls and estimated cost without calling DataForSEO")
    args = parser.parse_args(argv)

    dfs.set_caps(per_call=args.cost_cap, total=args.total_cap)

    vault = Path(args.vault).expanduser().resolve()
    out_dir = vault / ".raw" / "sources" / "dataforseo"
    today = date.today().isoformat()

    competitors_path = _resolve_competitors_file(vault, args.competitors)
    competitors_data = json.loads(competitors_path.read_text(encoding="utf-8"))
    competitor_domains: list[str] = [c["domain"] for c in competitors_data.get("competitors", []) if c.get("domain")]

    site_url = args.site or competitors_data.get("site")
    site_root = _root_domain(urlparse(site_url).hostname or site_url) if site_url else None

    if not competitor_domains:
        print("ERROR: no competitor domains in input file.", file=sys.stderr)
        return 1

    planned_domains = list(competitor_domains)
    if args.include_self and site_root:
        planned_domains.append(site_root)
    if args.dry_run:
        pages = args.max_pages_per_comp or 1
        estimated_calls = len(planned_domains) * pages
        estimated = estimated_calls * 0.05
        print("DRY RUN: no DataForSEO calls made")
        print(f"Endpoint: {ENDPOINT}")
        print(f"Competitors input: {competitors_path}")
        print(f"Domains ({len(planned_domains)}): {', '.join(planned_domains)}")
        print(f"Estimated calls: {estimated_calls}")
        print(f"Estimated spend: ${estimated:.2f} before DataForSEO account pricing adjustments")
        return 0

    dfs.require_credentials()
    out_dir.mkdir(parents=True, exist_ok=True)

    summaries: list[dict[str, Any]] = []
    try:
        for domain in competitor_domains:
            out_path, items, total = _pull_domain(
                domain,
                location=args.location,
                language=args.language,
                limit=args.limit_per_comp,
                max_pages=args.max_pages_per_comp,
                out_dir=out_dir,
                today=today,
                label=f"ranked_keywords/{domain}",
                file_prefix="competitor-kw",
            )
            summaries.append({"domain": domain, "items_pulled": items, "total_reported": total, "path": str(out_path)})
            print(f"[pull_competitor_kw] {domain}: pulled={items} reported={total}", file=sys.stderr)

        site_summary: dict[str, Any] | None = None
        if args.include_self and site_root:
            out_path, items, total = _pull_domain(
                site_root,
                location=args.location,
                language=args.language,
                limit=args.limit_per_comp,
                max_pages=args.max_pages_per_comp,
                out_dir=out_dir,
                today=today,
                label=f"ranked_keywords/SELF/{site_root}",
                file_prefix="site-ranked-keywords-page",
            )
            # Rename consolidated file to the canonical site-ranked-keywords-<date>.json name.
            canonical = out_dir / f"site-ranked-keywords-{today}.json"
            out_path.rename(canonical)
            site_summary = {"domain": site_root, "items_pulled": items, "total_reported": total, "path": str(canonical)}
            print(f"[pull_competitor_kw] SELF {site_root}: pulled={items} reported={total}", file=sys.stderr)
    except dfs.CostCapExceeded as exc:
        print(f"ERROR: {exc}. Stopping; partial output preserved.", file=sys.stderr)
        _write_summary(out_dir, today, competitors_path, summaries, site_summary=None, partial=True)
        return 1
    except dfs.DataForSEOError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    _write_summary(out_dir, today, competitors_path, summaries, site_summary=site_summary, partial=False)

    total_rows = sum(s["items_pulled"] for s in summaries) + (site_summary["items_pulled"] if site_summary else 0)
    print(f"\nPulled {total_rows} ranked-keyword rows across {len(summaries)} competitors"
          + (f" + self ({site_summary['items_pulled']})" if site_summary else "")
          + f". Cost ${dfs.total_cost():.4f}.")
    return 0


def _write_summary(
    out_dir: Path,
    today: str,
    competitors_path: Path,
    summaries: list[dict[str, Any]],
    *,
    site_summary: dict[str, Any] | None,
    partial: bool,
) -> None:
    summary = {
        "generated_at": today,
        "competitors_input": str(competitors_path),
        "partial": partial,
        "competitors": summaries,
        "site": site_summary,
        "total_api_cost_usd": round(dfs.total_cost(), 4),
    }
    dfs.write_private_text(out_dir / f"competitor-kw-summary-{today}.json", json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
