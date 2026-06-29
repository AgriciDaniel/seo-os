#!/usr/bin/env python3
"""
Step 1 of the marketing-brain pipeline — find the top relevant competitors.

What it does
------------
For each seed keyword, fetches a Google SERP via DataForSEO's
``/serp/google/organic/live/regular`` endpoint, then ranks domains by:

    score = sum(1 / position) across all SERPs the domain appears in

Filters out social platforms, the site itself, and (optionally) authority
domains like ``.gov``. Writes a deduplicated, ranked competitor list to
``<vault>/.raw/sources/dataforseo/competitors-<date>.json``.

If ``--seed-keywords`` is omitted, the script fetches the site's homepage and
extracts seeds from ``<title>``, ``<h1>``, and ``og:description`` (simple noun
phrase heuristics). The chosen seeds are echoed back so the operator can
re-run with explicit seeds if the heuristics misfire.

Inputs
------
- ``--site``: the site whose competitors to find (URL).
- ``--vault``: the client vault root (parent of ``.raw/``).
- ``--seed-keywords``: comma-separated seeds (optional).
- ``--top``: how many competitors to return (default 10).
- ``--location``: DataForSEO location code (default 2124 = Canada;
                  use 2840 for US, 2826 for UK).
- ``--language``: 2-letter language code (default ``en``).
- ``--cost-cap``: per-call cost cap in USD (default 0.50).
- ``--include-social`` / ``--include-authority``: keep filtered domains.

Outputs
-------
- ``<vault>/.raw/sources/dataforseo/competitors-<date>.json``
- Per-seed raw response under
  ``<vault>/.raw/sources/dataforseo/serp-<seed-slug>-<date>.json``

Cost
----
1 call per seed keyword. SERP regular ~$0.0006 each. With 5 seeds: ~$0.003.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import _dfs_client as dfs

ENDPOINT = "/v3/serp/google/organic/live/regular"

DEFAULT_SOCIAL = {
    "youtube.com", "m.youtube.com", "youtu.be",
    "reddit.com", "old.reddit.com",
    "facebook.com", "m.facebook.com",
    "instagram.com",
    "tiktok.com",
    "pinterest.com", "pinterest.ca",
    "twitter.com", "x.com",
    "linkedin.com",
    "quora.com",
}

# Suffixes / hosts considered "authority" — government, big-publisher news.
_AUTHORITY_SUFFIXES = (".gov", ".gov.uk", ".gc.ca", ".gov.au")
_AUTHORITY_HOSTS = {
    "wikipedia.org", "en.wikipedia.org",
    "ontario.ca", "canada.ca",
}


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:60] or "x"


def _root_domain(host: str) -> str:
    """Reduce ``www.example.co.uk`` to ``example.co.uk``. Conservative — we
    drop a leading ``www.`` and call it good. A full PSL lookup is overkill
    for competitor grouping at this stage; the curator subagent can refine.
    """
    host = host.lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host


def _is_excluded(domain: str, *, self_root: str, include_social: bool, include_authority: bool) -> bool:
    if domain == self_root:
        return True
    if not include_social and domain in DEFAULT_SOCIAL:
        return True
    if not include_authority:
        if domain in _AUTHORITY_HOSTS:
            return True
        if any(domain.endswith(suffix) for suffix in _AUTHORITY_SUFFIXES):
            return True
    return False


def _fetch_homepage(url: str, *, timeout: int = 15) -> str:
    """Fetch HTML for seed extraction. Tolerant of failures — caller decides."""
    req = urllib.request.Request(url, headers={"User-Agent": "marketing-brain/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read(500_000)  # 500KB is plenty for head+nav
    encoding = resp.headers.get_content_charset() or "utf-8"
    return raw.decode(encoding, errors="replace")


def _extract_seeds_from_html(html_text: str, max_seeds: int = 5) -> list[str]:
    """Heuristic seed-keyword extraction from page HTML.

    Pulls (in priority order):
      1. ``<title>`` minus the brand suffix after the last ``|`` or ``-``.
      2. The first ``<h1>``.
      3. ``<meta name="description">`` and ``og:description`` first sentence.

    Returns a deduplicated list, lowercased, length-capped per seed at 60 chars.
    """
    seeds: list[str] = []

    def _clean(s: str) -> str:
        s = html.unescape(re.sub(r"<[^>]+>", " ", s))
        s = re.sub(r"\s+", " ", s).strip().lower()
        return s[:60]

    title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.IGNORECASE | re.DOTALL)
    if title_match:
        title = _clean(title_match.group(1))
        # Strip brand suffix.
        for sep in (" | ", " - ", " – ", " — "):
            if sep in title:
                title = title.split(sep, 1)[0].strip()
                break
        if title:
            seeds.append(title)

    h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", html_text, re.IGNORECASE | re.DOTALL)
    if h1_match:
        h1 = _clean(h1_match.group(1))
        if h1 and h1 not in seeds:
            seeds.append(h1)

    for pattern in (
        r'<meta[^>]+(?:name|property)=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
    ):
        m = re.search(pattern, html_text, re.IGNORECASE)
        if m:
            desc = _clean(m.group(1))
            # Take first sentence / clause.
            desc = re.split(r"[.;\n]", desc, maxsplit=1)[0].strip()
            if desc and desc not in seeds:
                seeds.append(desc)
                if len(seeds) >= max_seeds:
                    break

    # Drop empty or 1-word stop-word-only seeds.
    clean: list[str] = []
    for s in seeds:
        if len(s) >= 3 and len(s.split()) >= 1:
            clean.append(s)
    return clean[:max_seeds]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", required=True, help="Site URL (e.g. https://example.com)")
    parser.add_argument("--vault", required=True, help="Vault root directory")
    parser.add_argument("--seed-keywords", default="", help="Comma-separated seeds (optional)")
    parser.add_argument("--top", type=int, default=10, help="Number of competitors to return")
    parser.add_argument("--location", type=int, default=2124, help="DataForSEO location code (default 2124 = Canada)")
    parser.add_argument("--language", default="en", help="Language code (default en)")
    parser.add_argument("--cost-cap", type=float, default=0.50, help="Per-call cost cap (USD)")
    parser.add_argument("--total-cap", type=float, default=5.00, help="Total run cost cap (USD)")
    parser.add_argument("--depth", type=int, default=20, help="SERP depth per seed (default 20)")
    parser.add_argument("--include-social", action="store_true", help="Keep social platforms")
    parser.add_argument("--include-authority", action="store_true", help="Keep .gov / wikipedia / ontario.ca")
    parser.add_argument("--dry-run", action="store_true", help="Preview seeds, API calls, and estimated cost without calling DataForSEO")
    args = parser.parse_args(argv)

    dfs.set_caps(per_call=args.cost_cap, total=args.total_cap)

    site_host = urlparse(args.site).hostname or args.site
    self_root = _root_domain(site_host)

    today = date.today().isoformat()
    out_dir = Path(args.vault).expanduser().resolve() / ".raw" / "sources" / "dataforseo"

    # Resolve seeds.
    if args.seed_keywords.strip():
        seeds = [s.strip() for s in args.seed_keywords.split(",") if s.strip()]
    else:
        print(f"[find_competitors] No --seed-keywords given; fetching {args.site} for heuristic extraction...", file=sys.stderr)
        try:
            html_text = _fetch_homepage(args.site)
            seeds = _extract_seeds_from_html(html_text)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            print(f"ERROR: could not fetch {args.site} ({exc}). Pass --seed-keywords explicitly.", file=sys.stderr)
            return 1
        if not seeds:
            print("ERROR: extracted zero seeds from the homepage. Pass --seed-keywords explicitly.", file=sys.stderr)
            return 1
        print(f"[find_competitors] Extracted seeds: {seeds}", file=sys.stderr)
        print(f"[find_competitors] Re-run with --seed-keywords '{','.join(seeds)}' to override.", file=sys.stderr)

    if args.dry_run:
        estimated = len(seeds) * 0.0006
        print("DRY RUN: no DataForSEO calls made")
        print(f"Endpoint: {ENDPOINT}")
        print(f"Site: {args.site}")
        print(f"Seeds ({len(seeds)}): {', '.join(seeds)}")
        print(f"SERP depth per seed: {args.depth}")
        print(f"Estimated spend: ${estimated:.4f} before DataForSEO account pricing adjustments")
        return 0

    dfs.require_credentials()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Aggregate.
    domain_score: dict[str, float] = defaultdict(float)
    domain_seeds: dict[str, set[str]] = defaultdict(set)
    domain_positions: dict[str, list[int]] = defaultdict(list)
    domain_urls: dict[str, list[str]] = defaultdict(list)

    try:
        for seed in seeds:
            payload = [{
                "keyword": seed,
                "location_code": args.location,
                "language_code": args.language,
                "depth": args.depth,
            }]
            save_to = out_dir / f"serp-{_slug(seed)}-{today}.json"
            data = dfs.call(ENDPOINT, payload, label=f"serp/{seed}", save_to=save_to)
            tasks = data.get("tasks") or []
            if not tasks:
                continue
            results = (tasks[0].get("result") or [])
            if not results:
                continue
            items = results[0].get("items") or []
            for item in items:
                if item.get("type") != "organic":
                    continue
                pos = item.get("rank_group") or item.get("rank_absolute")
                domain = item.get("domain") or ""
                url = item.get("url") or ""
                if not domain or not pos:
                    continue
                root = _root_domain(domain)
                if _is_excluded(
                    root,
                    self_root=self_root,
                    include_social=args.include_social,
                    include_authority=args.include_authority,
                ):
                    continue
                # frequency component is implicit (sum); position weighting is 1/pos
                domain_score[root] += 1.0 / float(pos)
                domain_seeds[root].add(seed)
                domain_positions[root].append(int(pos))
                if len(domain_urls[root]) < 5:
                    domain_urls[root].append(url)
    except dfs.CostCapExceeded as exc:
        print(f"ERROR: {exc}. Partial results below; nothing more pulled.", file=sys.stderr)
        # fall through to write whatever we have
        ranked = _rank(domain_score, domain_seeds, domain_positions, domain_urls, args.top)
        _write_output(out_dir / f"competitors-{today}.json", ranked, seeds, args, partial=True, total_cost=dfs.total_cost())
        return 1
    except dfs.DataForSEOError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    ranked = _rank(domain_score, domain_seeds, domain_positions, domain_urls, args.top)
    out_path = out_dir / f"competitors-{today}.json"
    _write_output(out_path, ranked, seeds, args, partial=False, total_cost=dfs.total_cost())

    # Console summary.
    print(f"\nTop {min(args.top, len(ranked))} competitors for {self_root}:")
    for i, c in enumerate(ranked[: args.top], 1):
        print(f"  {i:>2}. {c['domain']:<40} score={c['score']:.3f}  seeds={len(c['common_seeds'])}  avg_pos={c['avg_position']:.1f}")
    print(f"\nWrote {out_path}")
    print(f"Total spend: ${dfs.total_cost():.4f}")
    return 0


def _rank(
    score: dict[str, float],
    seeds: dict[str, set[str]],
    positions: dict[str, list[int]],
    urls: dict[str, list[str]],
    top: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for domain, s in score.items():
        pos_list = positions[domain]
        rows.append({
            "domain": domain,
            "score": round(s, 4),
            "common_seeds": sorted(seeds[domain]),
            "avg_position": round(sum(pos_list) / len(pos_list), 2) if pos_list else None,
            "appearances": len(pos_list),
            "sample_urls": urls[domain],
        })
    rows.sort(key=lambda r: (-r["score"], r["avg_position"] if r["avg_position"] is not None else 999))
    return rows[: top * 3]  # keep more than top so the user can spot-check overflow


def _write_output(
    path: Path,
    ranked: list[dict[str, Any]],
    seeds: list[str],
    args: argparse.Namespace,
    *,
    partial: bool,
    total_cost: float,
) -> None:
    payload = {
        "generated_at": date.today().isoformat(),
        "site": args.site,
        "location_code": args.location,
        "language_code": args.language,
        "seeds_used": seeds,
        "depth_per_seed": args.depth,
        "include_social": args.include_social,
        "include_authority": args.include_authority,
        "partial": partial,
        "total_api_cost_usd": round(total_cost, 4),
        "competitors": ranked,
    }
    dfs.write_private_text(path, json.dumps(payload, indent=2) + "\n")


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
