#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


REQUIRED = [
    "CODEX.md",
    "README.md",
    "shipping-rules.md",
    "wiki/hot.md",
    "wiki/index.md",
    "wiki/overview.md",
    "wiki/log.md",
    "wiki/meta/Start Here.md",
]

REQUIRED_FRONTMATTER = ("brain_schema", "type", "title", "created", "updated", "status")
KNOWN_TEMPLATE_VARS = {
    "business_type",
    "client",
    "client_name",
    "client_slug",
    "date",
    "niche",
    "owner",
    "site",
    "site_brand",
    "site_type",
    "site_url",
    "today",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lint a Marketing Brain vault.")
    parser.add_argument("--vault", required=True)
    parser.add_argument("--template", action="store_true", help="allow documented template placeholders")
    args = parser.parse_args(argv)
    vault = Path(args.vault).expanduser().resolve()
    problems = lint(vault, template=args.template)
    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        return 1
    print("Vault lint passed")
    return 0


def lint(vault: Path, *, template: bool = False) -> list[str]:
    problems: list[str] = []
    if not vault.exists():
        return [f"vault does not exist: {vault}"]

    for rel in REQUIRED:
        if not (vault / rel).exists():
            problems.append(f"missing required file: {rel}")

    plugin_file = vault / ".obsidian" / "community-plugins.json"
    if plugin_file.exists():
        try:
            plugins = json.loads(plugin_file.read_text(encoding="utf-8"))
        except ValueError:
            problems.append("invalid .obsidian/community-plugins.json")
        else:
            if plugins:
                problems.append("community Obsidian plugins must be disabled by default")

    if not (vault / ".raw" / ".manifest.json").exists():
        problems.append("missing raw source manifest: .raw/.manifest.json")

    files = [p for p in vault.rglob("*") if p.is_file() and ".raw" not in p.parts]
    rel_files = {p.relative_to(vault).as_posix().lower() for p in files}
    file_names = {p.name.lower() for p in files}
    notes = [p for p in files if p.suffix == ".md"]

    stems: dict[str, list[Path]] = {}
    rel_stems: set[str] = set()
    inbound: dict[Path, int] = {note: 0 for note in notes if "wiki" in note.parts and note.name != "index.md"}
    note_by_stem: dict[str, list[Path]] = {}
    note_by_relstem: dict[str, Path] = {}

    for note in notes:
        stems.setdefault(note.stem.lower(), []).append(note)
        note_by_stem.setdefault(note.stem.lower(), []).append(note)
        relstem = note.relative_to(vault).with_suffix("").as_posix().lower()
        rel_stems.add(relstem)
        note_by_relstem[relstem] = note
        text = note.read_text(encoding="utf-8")
        placeholders = re.findall(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}", text)
        if placeholders and not template:
            problems.append(f"unresolved placeholder: {note.relative_to(vault)}")
        elif template:
            unknown = sorted({placeholder for placeholder in placeholders if placeholder not in KNOWN_TEMPLATE_VARS})
            if unknown:
                problems.append(f"unknown template placeholder in {note.relative_to(vault)}: {', '.join(unknown)}")
        if "wiki" in note.parts:
            frontmatter = parse_frontmatter(text)
            if frontmatter is None:
                problems.append(f"missing frontmatter: {note.relative_to(vault)}")
            else:
                for key in REQUIRED_FRONTMATTER:
                    if key not in frontmatter:
                        problems.append(f"missing frontmatter field '{key}': {note.relative_to(vault)}")

    for stem, paths in stems.items():
        if stem != "_index" and len(paths) > 1:
            joined = ", ".join(str(p.relative_to(vault)) for p in paths)
            problems.append(f"duplicate note stem '{stem}': {joined}")

    for note in notes:
        text = note.read_text(encoding="utf-8")
        for raw_link in re.findall(r"\[\[([^\]]+)\]\]", text):
            target = raw_link.split("|", 1)[0].split("#", 1)[0].strip()
            if not target:
                continue
            normalized = target.lower()
            if normalized.endswith(".md"):
                normalized = normalized[:-3]
            hit: Path | None = None
            if "/" in normalized:
                candidates = [normalized]
                if normalized.startswith("wiki/"):
                    candidates.append(normalized[5:])
                else:
                    candidates.append(f"wiki/{normalized}")
                for candidate in candidates:
                    if candidate in rel_stems:
                        hit = note_by_relstem[candidate]
                        break
                    if candidate in rel_files:
                        break
                if hit is None and not any(candidate in rel_files for candidate in candidates):
                    problems.append(f"dead wikilink in {note.relative_to(vault)}: [[{raw_link}]]")
            else:
                if normalized in note_by_stem:
                    hit = note_by_stem[normalized][0]
                elif normalized not in file_names:
                    problems.append(f"dead wikilink in {note.relative_to(vault)}: [[{raw_link}]]")
            if hit in inbound:
                inbound[hit] += 1

    for note, count in sorted(inbound.items()):
        rel = note.relative_to(vault).as_posix()
        if count == 0 and not rel.endswith(("/hot.md", "/overview.md", "/log.md")):
            problems.append(f"orphan wiki note: {rel}")
    return problems


def parse_frontmatter(text: str) -> set[str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    keys = set()
    for line in text[4:end].splitlines():
        if not line.strip() or line.startswith(" ") or line.startswith("-"):
            continue
        key = line.split(":", 1)[0].strip()
        if key:
            keys.add(key)
    return keys


if __name__ == "__main__":
    raise SystemExit(main())
