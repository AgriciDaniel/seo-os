#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
SAMPLE = REPO / "examples" / "sample-vault"
DEMO_DATE = "2026-05-11"


def main(argv: list[str] | None = None) -> int:
    del argv
    if SAMPLE.exists():
        shutil.rmtree(SAMPLE)
    out_dir = SAMPLE.parent
    run([
        sys.executable,
        str(REPO / "scripts" / "scaffold_vault.py"),
        "--client",
        "demo-growth",
        "--client-name",
        "Demo Growth Co",
        "--site",
        "https://www.example.com",
        "--site-brand",
        "Demo Growth Co",
        "--niche",
        "B2B SaaS workflow automation",
        "--business-type",
        "saas",
        "--owner",
        "Strategy Owner",
        "--out-dir",
        str(out_dir),
        "--force",
    ])
    (out_dir / "demo-growth").rename(SAMPLE)
    normalize_dates(SAMPLE)
    write_fixture_data(SAMPLE)
    run([
        sys.executable,
        str(REPO / "scripts" / "build_keyword_xlsx.py"),
        "--vault",
        str(SAMPLE),
        "--out-xlsx",
        str(SAMPLE / f"keywords-{DEMO_DATE}.xlsx"),
        "--out-csv",
        str(SAMPLE / f"keywords-{DEMO_DATE}.csv"),
    ])
    write_paa_digest(SAMPLE)
    run([
        sys.executable,
        str(REPO / "scripts" / "synthesize_beast_plan.py"),
        "--vault",
        str(SAMPLE),
        "--out",
        str(SAMPLE / ".raw" / "sources" / f"beast-plan-context-{DEMO_DATE}.md"),
    ])
    normalize_dates(SAMPLE)
    run([
        sys.executable,
        str(REPO / "scripts" / "generate_editorial_assets.py"),
    ])
    run([
        sys.executable,
        str(REPO / "scripts" / "render_beast_pdf.py"),
        "--vault",
        str(SAMPLE),
        "--out",
        str(SAMPLE / "demo-growth-Beast-Plan.pdf"),
        "--html-only",
    ])
    readme = SAMPLE / "README.md"
    readme.write_text(
        "# Marketing Brain Sample Vault\n\n"
        "Synthetic demo vault for Marketing Brain v0.1.5. No live client data or paid API calls are included.\n\n"
        "Start at `CODEX.md`, then `wiki/hot.md`, then `wiki/index.md`.\n",
        encoding="utf-8",
    )
    print(f"Built sample vault: {SAMPLE}")
    return 0


def write_fixture_data(vault: Path) -> None:
    raw = vault / ".raw" / "sources" / "dataforseo"
    raw.mkdir(parents=True, exist_ok=True)
    competitors = {
        "generated_at": DEMO_DATE,
        "site": "https://www.example.com",
        "location_code": 2840,
        "language_code": "en",
        "seeds_used": ["workflow automation software", "b2b automation platform"],
        "depth_per_seed": 20,
        "include_social": False,
        "include_authority": False,
        "partial": False,
        "total_api_cost_usd": 0.0,
        "competitors": [
            {"domain": "flowpilot.example", "score": 1.42, "common_seeds": ["workflow automation software"], "avg_position": 3.2, "appearances": 4, "sample_urls": ["https://flowpilot.example/features"]},
            {"domain": "opsstack.example", "score": 1.18, "common_seeds": ["b2b automation platform"], "avg_position": 4.1, "appearances": 3, "sample_urls": ["https://opsstack.example/platform"]},
            {"domain": "processgrid.example", "score": 0.91, "common_seeds": ["workflow automation software"], "avg_position": 6.0, "appearances": 2, "sample_urls": ["https://processgrid.example/workflows"]},
        ],
    }
    write_private(raw / f"competitors-{DEMO_DATE}.json", competitors)
    for domain, rows in fixture_keyword_rows().items():
        payload = {
            "domain": domain,
            "generated_at": DEMO_DATE,
            "location_code": 2840,
            "language_code": "en",
            "items_pulled": len(rows),
            "total_count_reported": len(rows),
            "pages": [{"offset": 0, "items_count": len(rows), "items": [keyword_item(*row) for row in rows]}],
        }
        prefix = "site-ranked-keywords" if domain == "example.com" else f"competitor-kw-{slug(domain)}"
        write_private(raw / f"{prefix}-{DEMO_DATE}.json", payload)
    summary = {
        "generated_at": DEMO_DATE,
        "competitors_input": f".raw/sources/dataforseo/competitors-{DEMO_DATE}.json",
        "partial": False,
        "total_api_cost_usd": 0.0,
    }
    write_private(raw / f"competitor-kw-summary-{DEMO_DATE}.json", summary)


def fixture_keyword_rows() -> dict[str, list[tuple[str, int, int, int, str, str]]]:
    return {
        "flowpilot.example": [
            ("workflow automation software", 5400, 2, 34, "commercial", "https://flowpilot.example/workflow-automation"),
            ("b2b workflow automation", 1900, 3, 28, "commercial", "https://flowpilot.example/b2b"),
            ("workflow automation examples", 1300, 5, 22, "informational", "https://flowpilot.example/examples"),
            ("zapier alternatives for teams", 2400, 4, 41, "commercial", "https://flowpilot.example/zapier-alternatives"),
        ],
        "opsstack.example": [
            ("workflow automation software", 5400, 4, 34, "commercial", "https://opsstack.example/workflow"),
            ("business process automation platform", 2900, 2, 37, "commercial", "https://opsstack.example/platform"),
            ("workflow automation examples", 1300, 6, 22, "informational", "https://opsstack.example/examples"),
            ("approval workflow software", 1600, 5, 26, "commercial", "https://opsstack.example/approval-workflows"),
        ],
        "processgrid.example": [
            ("business process automation platform", 2900, 5, 37, "commercial", "https://processgrid.example/business-process"),
            ("approval workflow software", 1600, 3, 26, "commercial", "https://processgrid.example/approval"),
            ("workflow management for startups", 700, 4, 18, "commercial", "https://processgrid.example/startups"),
        ],
        "example.com": [
            ("workflow automation software", 5400, 18, 34, "commercial", "https://www.example.com/platform"),
            ("workflow automation examples", 1300, 9, 22, "informational", "https://www.example.com/blog/examples"),
            ("approval workflow software", 1600, 52, 26, "commercial", "https://www.example.com/approval"),
        ],
    }


def keyword_item(keyword: str, volume: int, rank: int, kd: int, intent: str, url: str) -> dict[str, object]:
    return {
        "keyword_data": {
            "keyword": keyword,
            "keyword_info": {"search_volume": volume, "cpc": 8.2, "competition": 0.44, "competition_level": "MEDIUM"},
            "keyword_properties": {"keyword_difficulty": kd},
            "search_intent_info": {"main_intent": intent},
            "serp_info": {"serp_item_types": ["organic", "people_also_ask", "ai_overview_reference"]},
        },
        "ranked_serp_element": {"serp_item": {"rank_group": rank, "url": url}},
    }


def write_paa_digest(vault: Path) -> None:
    raw = vault / ".raw" / "sources" / "dataforseo"
    archive = {
        "generated_at": DEMO_DATE,
        "partial": False,
        "paa": [
            {"seed_keyword": "workflow automation software", "questions": [{"question": "What is workflow automation software?", "sources": []}]},
            {"seed_keyword": "approval workflow software", "questions": [{"question": "How do approval workflows reduce manual work?", "sources": []}]},
        ],
        "related_searches": [
            {"seed_keyword": "workflow automation software", "related": ["workflow automation examples", "best workflow automation tools"]},
        ],
    }
    write_private(raw / f"paa-{DEMO_DATE}.json", archive)
    digest = """---
brain_schema: marketing-brain.v1
type: source
title: "PAA Mining Digest"
created: 2026-05-11
updated: 2026-05-11
tags:
  - source/dataforseo
  - paa
status: ready
---

# PAA Mining Digest

Mined 2 synthetic top-volume keywords. 2 unique PAA questions, 2 related searches.

## People Also Ask - by topic

### Definition / What-is

- (1x) **What is workflow automation software?** _seeds: workflow automation software_

### How / Guide

- (1x) **How do approval workflows reduce manual work?** _seeds: approval workflow software_

## Related Searches - top 100

- (1x) workflow automation examples _seeds: workflow automation software_
- (1x) best workflow automation tools _seeds: workflow automation software_
"""
    write_private(raw / f"paa-digest-{DEMO_DATE}.md", digest)


def normalize_dates(root: Path) -> None:
    current = date.today().isoformat()
    for path in root.rglob("*"):
        if path.is_file() and path.suffix in {".md", ".json", ".base", ".canvas", ".html"}:
            text = path.read_text(encoding="utf-8", errors="ignore")
            text = text.replace(current, DEMO_DATE)
            path.write_text(text, encoding="utf-8")


def write_private(path: Path, payload: object) -> None:
    if isinstance(payload, str):
        text = payload
    else:
        text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)


def slug(value: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in value.lower()).strip("-")


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=REPO, check=True)


if __name__ == "__main__":
    raise SystemExit(main())
