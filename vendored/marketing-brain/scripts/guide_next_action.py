#!/usr/bin/env python3
"""
The "ever-evolving" loop — read the vault state and suggest the next action.

What it does
------------
Parses ``<vault>/wiki/hot.md`` for an "Active Threads" section (looks for an
``## Active Threads`` heading; collects bullet list items underneath until the
next heading). Cross-references the vault's manifest to detect pipeline state
(scaffolded? competitors pulled? plan generated?). Returns the suggested next
action with rationale and the path to the relevant flow note (parsed from
wikilinks in the active thread).

State machine (rough sketch)
----------------------------
- Vault doesn't exist or has no manifest -> "Run scaffold_vault.py first."
- Scaffolded but no competitors-*.json -> "Day 0 access setup, then find_competitors.py."
- Competitors pulled, no keyword XLSX -> "build_keyword_xlsx.py."
- XLSX present, no PAA -> "mine_paa_serps.py."
- PAA present, no beast-plan bundle -> "synthesize_beast_plan.py."
- Bundle present but plan still a stub -> "Invoke beast-planner subagent."
- Plan populated -> "render_beast_pdf.py + execute /seo-audit."

If hot.md mentions Day 0 in active threads, surface that first regardless —
access is always blocking.

Inputs
------
- ``--vault``: vault root.
- ``--format``: ``text`` (default, human friendly) or ``json``.

Outputs
-------
- Stdout: suggested next action + rationale + relevant file path.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class Suggestion:
    action: str
    rationale: str
    open_file: str | None = None
    command: str | None = None
    state: str = ""


# -- hot.md parsing ----------------------------------------------------------
def _parse_hot(path: Path) -> dict[str, list[str]]:
    """Return a dict: section heading -> list of bullet items."""
    if not path.exists():
        return {}
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        h = re.match(r"^(#{1,6})\s+(.*)$", line.strip())
        if h:
            current = h.group(2).strip()
            sections.setdefault(current, [])
            continue
        b = re.match(r"^\s*[-*]\s+(.*)$", line)
        if b and current:
            sections[current].append(b.group(1).strip())
    return sections


def _wikilinks(text: str) -> list[str]:
    return re.findall(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]", text)


def _resolve_wikilink(vault: Path, name: str) -> Path | None:
    """Best-effort resolution: search vault for a file matching the name."""
    target = name.strip() + ".md"
    matches = list(vault.rglob(target))
    return matches[0] if matches else None


# -- state detection ---------------------------------------------------------
def _detect_state(vault: Path) -> dict[str, bool | str]:
    raw = vault / ".raw" / "sources" / "dataforseo"
    state: dict[str, bool | str] = {
        "vault_exists": vault.is_dir(),
        "manifest_present": (vault / ".raw" / ".manifest.json").exists(),
        "competitors": bool(list(raw.glob("competitors-*.json"))) if raw.exists() else False,
        "competitor_kw": bool(list(raw.glob("competitor-kw-*.json"))) if raw.exists() else False,
        "keywords_xlsx": bool(list(vault.glob("keywords-*.xlsx"))) if vault.exists() else False,
        "paa": bool(list(raw.glob("paa-*.json"))) if raw.exists() else False,
        "beast_bundle": bool(list((vault / ".raw" / "sources").glob("beast-plan-context-*.md"))) if (vault / ".raw" / "sources").exists() else False,
        "beast_plan_filled": False,
    }
    plan = vault / "wiki" / "deliverables" / "ULTIMATE BEAST Plan.md"
    if plan.exists():
        text = plan.read_text(encoding="utf-8")
        state["beast_plan_filled"] = "INVOKE beast-planner subagent" not in text and len(text) > 1500
    return state


# -- decision logic ----------------------------------------------------------
def _decide(vault: Path, sections: dict[str, list[str]], state: dict[str, bool | str]) -> Suggestion:
    # 1. Day 0 always wins if mentioned in active threads.
    active = sections.get("Active Threads") or sections.get("active threads") or []
    active_text = " ".join(active).lower()
    if "day 0" in active_text or "day-0" in active_text:
        wikilinks = _wikilinks(" ".join(active))
        # Prefer a Day 0 link explicitly.
        flow_path: Path | None = None
        for link in wikilinks:
            if "day 0" in link.lower():
                flow_path = _resolve_wikilink(vault, link)
                break
        if not flow_path:
            flow_path = _resolve_wikilink(vault, "Day 0 Measurement Access Gate")
        return Suggestion(
            action="Complete Day 0 measurement-access gate",
            rationale=(
                "hot.md flags Day 0 access as still active. GSC, GA4, Ezoic (or analogue), and CMS access "
                "are blocking — without them, downstream audit data is partial and the beast plan is guesswork."
            ),
            open_file=str(flow_path) if flow_path else None,
            command="Once GSC + GA4 + CMS confirmed: run find_competitors.py --site SITE --vault VAULT",
            state="day-0-blocking",
        )

    # 2. Pipeline-state machine.
    if not state["vault_exists"] or not state["manifest_present"]:
        return Suggestion(
            action="Scaffold the client vault",
            rationale="No manifest detected. Run scaffold_vault.py to lay down the template-brain for this client.",
            open_file=None,
            command="python scripts/scaffold_vault.py --client SLUG --site URL --niche TEXT --business-type TYPE --owner NAME",
            state="needs-scaffold",
        )
    if not state["competitors"]:
        return Suggestion(
            action="Find competitors (Step 1)",
            rationale="Vault is scaffolded but no DataForSEO competitor data has been pulled yet.",
            open_file=str(_resolve_wikilink(vault, "Day 0 Measurement Access Gate") or ""),
            command="python scripts/find_competitors.py --site SITE --vault VAULT",
            state="needs-competitors",
        )
    if not state["competitor_kw"]:
        return Suggestion(
            action="Pull competitor ranked keywords (Step 2)",
            rationale="Competitors identified; now pull the keyword universe for each so we can dedup and score.",
            command="python scripts/pull_competitor_kw.py --vault VAULT",
            state="needs-competitor-kw",
        )
    if not state["keywords_xlsx"]:
        return Suggestion(
            action="Build the keyword XLSX (Step 3)",
            rationale="Competitor keywords pulled but not yet deduplicated, scored, or categorized.",
            command="python scripts/build_keyword_xlsx.py --vault VAULT",
            state="needs-xlsx",
        )
    if not state["paa"]:
        return Suggestion(
            action="Mine PAA + related searches (Step 4)",
            rationale="Keyword universe is ready; now harvest PAA + related queries on the top-100 by volume to surface content gaps.",
            command="python scripts/mine_paa_serps.py --vault VAULT",
            state="needs-paa",
        )
    if not state["beast_bundle"]:
        return Suggestion(
            action="Assemble beast-plan synthesis bundle (Step 6 prep)",
            rationale="All research is in. Build the prompt-ready bundle for the beast-planner subagent.",
            command="python scripts/synthesize_beast_plan.py --vault VAULT",
            state="needs-bundle",
        )
    if not state["beast_plan_filled"]:
        return Suggestion(
            action="Run deterministic synthesis",
            rationale="The synthesis bundle exists but the ULTIMATE BEAST Plan deliverable still needs to be populated.",
            open_file=str(vault / "wiki" / "deliverables" / "ULTIMATE BEAST Plan.md"),
            command="python scripts/synthesize_beast_plan.py --vault VAULT",
            state="needs-subagent",
        )
    return Suggestion(
        action="Render the editorial PDF and start execution",
        rationale="Vault is fully populated; the plan is written. Render the PDF and begin the 30-day sprint.",
        command="python scripts/render_beast_pdf.py --vault VAULT",
        open_file=str(_resolve_wikilink(vault, "30-Day Recovery Sprint") or _resolve_wikilink(vault, "30-Day Growth Sprint") or ""),
        state="ready-to-ship",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vault", required=True)
    parser.add_argument("--format", choices=["text", "json"], default="text")
    args = parser.parse_args(argv)

    vault = Path(args.vault).expanduser().resolve()
    hot = vault / "wiki" / "hot.md"

    sections = _parse_hot(hot)
    state = _detect_state(vault)
    suggestion = _decide(vault, sections, state)

    if args.format == "json":
        print(json.dumps({
            "suggestion": asdict(suggestion),
            "state": state,
            "active_threads": sections.get("Active Threads", []),
        }, indent=2))
    else:
        print(f"Next: {suggestion.action}")
        print(f"Why:  {suggestion.rationale}")
        if suggestion.open_file:
            print(f"Open: {suggestion.open_file}")
        if suggestion.command:
            print(f"Run:  {suggestion.command}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
