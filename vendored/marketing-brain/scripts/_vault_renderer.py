"""
Slot-fill engine: render the template-brain into a per-client Obsidian vault.

Purpose
-------
Walks ``<repo>/assets/template-brain/`` and writes a personalised copy to
``<out_dir>/<client_slug>/``. Substitutes ``{{placeholder}}`` tokens in text
files with values from a ``vars`` dict. Copies binary assets verbatim. Applies
the chosen business-type overlay. Idempotent on re-run: never silently
overwrites a file the user has modified — only ``--force`` will.

Inputs
------
- ``template_dir``: path to the template-brain root.
- ``out_dir``:      where the client vaults live (e.g. ``~/marketing-brain-vaults``).
- ``client_slug``:  kebab-case identifier; becomes the vault's folder name.
- ``vars``:         dict of placeholder values (client_name, site_url, niche, etc.).
- ``business_type``:slug like ``affiliate-content`` (see ``BUSINESS_TYPE_FILES``).
- ``force``:        bypass the idempotency check; overwrite user edits.

Outputs
-------
- A populated vault at ``<out_dir>/<client_slug>/``.
- ``<out_dir>/<client_slug>/.raw/.scaffold-state.json`` — per-file content
  hashes from the most recent render. Used to detect user edits on re-runs.
- ``<out_dir>/<client_slug>/.raw/.manifest.json`` — wiki-ingest schema entry
  recording the scaffold action.

Stdlib only. Python 3.10+.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from datetime import date
from pathlib import Path
from typing import Any, Iterable

# Slug -> filename in wiki/business-types/
BUSINESS_TYPE_FILES: dict[str, str] = {
    "affiliate-content": "Affiliate Content.md",
    "local-seo-services": "Local SEO Services.md",
    "saas": "SaaS.md",
    "ecommerce": "Ecommerce.md",
    "lead-gen-b2b": "Lead Gen B2B.md",
    "publisher-news": "Publisher News.md",
}

# Files in wiki/deliverables/ that some overlays would mark as not-primary.
# Earlier versions REMOVED these files for non-applicable verticals, but that
# cascaded into ~10 dead wikilinks across `index.md`, the other overlays, and
# entity notes that reference the deliverable as "related". Per the
# 2026-05-04 audit, we keep all deliverables in every vault — the active
# overlay's body text already enumerates which deliverables matter most for
# the chosen vertical, so the user/agent can prune intentionally rather than
# inheriting silent removals. Empty dict = no removals.
_OVERLAY_DELIVERABLE_REMOVALS: dict[str, set[str]] = {
    # Intentionally empty — see comment above. Per-vertical relevance is
    # documented inside each `references/business-types/<slug>.md` overlay.
}

# Anything matching these globs is treated as binary and copied verbatim.
_BINARY_SUFFIXES: set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
    ".pdf", ".zip", ".gz", ".tar", ".woff", ".woff2", ".ttf", ".otf",
    ".mp3", ".mp4", ".mov", ".wav",
}

# Files we never copy (template hygiene).
_SKIP_NAMES: set[str] = {".DS_Store", "Thumbs.db"}

# Directories we don't recurse into during the walk (they are vault state, not template).
_SKIP_DIRS: set[str] = {".git", "__pycache__"}

# Placeholder regex — matches {{ name }} or {{name}}, captures the bare key.
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}")


class TemplateRenderError(RuntimeError):
    """Raised on unresolvable misconfiguration (missing template, bad type, etc.)."""


def render_vault(
    template_dir: Path | str,
    out_dir: Path | str,
    client_slug: str,
    vars: dict[str, Any],
    business_type: str,
    force: bool = False,
) -> dict[str, Any]:
    """Render the template-brain into ``<out_dir>/<client_slug>/``.

    Returns a summary dict with: ``vault_path``, ``files_written``,
    ``files_skipped``, ``files_preserved`` (user-modified, kept as-is),
    ``business_type``, ``business_type_file``.

    Raises ``TemplateRenderError`` if the template directory is missing or the
    business type is unknown.
    """
    template_root = Path(template_dir).expanduser().resolve()
    if not template_root.is_dir():
        raise TemplateRenderError(f"Template directory not found: {template_root}")

    if business_type not in BUSINESS_TYPE_FILES:
        choices = ", ".join(sorted(BUSINESS_TYPE_FILES))
        raise TemplateRenderError(
            f"Unknown business type '{business_type}'. Available: {choices}"
        )

    vault_root = (Path(out_dir).expanduser().resolve() / client_slug)
    vault_root.mkdir(parents=True, exist_ok=True)

    # Ensure baseline vars exist so {{date}} etc never produces literal text.
    today = date.today().isoformat()
    merged_vars: dict[str, Any] = {
        "client_slug": client_slug,
        "business_type": business_type,
        "date": today,
        "today": today,
    }
    merged_vars.update(vars or {})

    # Load prior scaffold state for idempotency.
    state_path = vault_root / ".raw" / ".scaffold-state.json"
    prior_state = _load_state(state_path)
    new_state: dict[str, str] = {}

    files_written: list[str] = []
    files_preserved: list[str] = []
    files_skipped: list[str] = []

    for src in _walk_template(template_root):
        rel = src.relative_to(template_root)
        rel_posix = rel.as_posix()

        if src.name in _SKIP_NAMES:
            files_skipped.append(rel_posix)
            continue

        # CRITICAL: substitute {{placeholders}} in the filename/path itself.
        # Otherwise files like ``entities/{{client_name}}.md`` are written
        # literally instead of becoming ``entities/Acme.md``, and every body-text
        # wikilink to ``[[Acme]]`` ends up dead. Path components are sanitised
        # to be filesystem-safe (slashes in vars would break the layout).
        rendered_rel_posix = _substitute_path(rel_posix, merged_vars)
        rendered_rel = Path(rendered_rel_posix)
        dst = vault_root / rendered_rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        is_binary = src.suffix.lower() in _BINARY_SUFFIXES
        if is_binary:
            rendered_bytes = src.read_bytes()
            new_hash = _hash_bytes(rendered_bytes)
            if dst.exists() and not force:
                prior_hash = prior_state.get(rel_posix)
                current_hash = _hash_bytes(dst.read_bytes())
                # Preserve if the user has diverged the file since the last
                # render. We always record the *rendered* hash in state so the
                # divergence check survives subsequent re-runs.
                if prior_hash and current_hash != prior_hash:
                    files_preserved.append(rendered_rel_posix)
                    new_state[rendered_rel_posix] = prior_hash
                    continue
            dst.write_bytes(rendered_bytes)
            new_state[rendered_rel_posix] = new_hash
            files_written.append(rendered_rel_posix)
        else:
            try:
                template_text = src.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                # Treat as binary fallback.
                rendered_bytes = src.read_bytes()
                new_hash = _hash_bytes(rendered_bytes)
                if dst.exists() and not force:
                    prior_hash = prior_state.get(rendered_rel_posix)
                    current_hash = _hash_bytes(dst.read_bytes())
                    if prior_hash and current_hash != prior_hash:
                        files_preserved.append(rendered_rel_posix)
                        new_state[rendered_rel_posix] = prior_hash
                        continue
                dst.write_bytes(rendered_bytes)
                new_state[rendered_rel_posix] = new_hash
                files_written.append(rendered_rel_posix)
                continue

            rendered = _substitute(template_text, merged_vars)
            new_hash = _hash_text(rendered)

            if dst.exists() and not force:
                prior_hash = prior_state.get(rendered_rel_posix)
                current_hash = _hash_text(dst.read_text(encoding="utf-8"))
                # If we have a prior render hash AND the live file diverges
                # from it, the user has edited it — preserve. Keep recording
                # the *rendered* hash (not the user's hash) so the divergence
                # check still fires on subsequent re-runs.
                if prior_hash and current_hash != prior_hash:
                    files_preserved.append(rendered_rel_posix)
                    new_state[rendered_rel_posix] = prior_hash
                    continue

            dst.write_text(rendered, encoding="utf-8")
            new_state[rendered_rel_posix] = new_hash
            files_written.append(rendered_rel_posix)

    # Apply business-type overlay: copy chosen overlay into Business Type Overlay.md.
    overlay_summary = _apply_business_overlay(vault_root, business_type, force)

    # Update state file and manifest.
    _save_state(state_path, new_state)
    _append_manifest(
        vault_root,
        action="scaffold",
        client_slug=client_slug,
        business_type=business_type,
        files_written=files_written,
        files_preserved=files_preserved,
        overlay=overlay_summary,
        vars=merged_vars,
    )

    return {
        "vault_path": str(vault_root),
        "files_written": files_written,
        "files_preserved": files_preserved,
        "files_skipped": files_skipped,
        "business_type": business_type,
        "business_type_file": BUSINESS_TYPE_FILES[business_type],
        "overlay": overlay_summary,
    }


# Internals -------------------------------------------------------------------
def _walk_template(root: Path) -> Iterable[Path]:
    """Yield every file under ``root`` excluding skip dirs."""
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        # Skip if any ancestor folder is in _SKIP_DIRS.
        if any(part in _SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        yield path


def _substitute(text: str, vars: dict[str, Any]) -> str:
    """Replace ``{{key}}`` tokens. Unknown keys are left literal so wiki-lint
    flags them — better to surface a missing var than silently render an empty
    string into a deliverable.
    """
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in vars:
            return str(vars[key])
        return match.group(0)
    return _PLACEHOLDER_RE.sub(repl, text)


_PATH_UNSAFE_RE = re.compile(r"[/\\:*?\"<>|]")


def _substitute_path(rel_posix: str, vars: dict[str, Any]) -> str:
    """Substitute ``{{key}}`` in a relative path while sanitising values for
    filesystem use. A var like ``client_name = "Acme/Beta"`` would otherwise
    create an unwanted subdirectory; collapse path-unsafe chars to ``-``.
    """
    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in vars:
            return match.group(0)
        return _PATH_UNSAFE_RE.sub("-", str(vars[key])).strip()
    return _PLACEHOLDER_RE.sub(repl, rel_posix)


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _hash_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def _load_state(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_state(path: Path, state: dict[str, str]) -> None:
    _write_private_text(path, json.dumps(state, indent=2, sort_keys=True) + "\n")


def _apply_business_overlay(vault_root: Path, business_type: str, force: bool) -> dict[str, Any]:
    """Copy the chosen overlay into wiki/concepts/Business Type Overlay.md and
    apply per-overlay deliverable removals.

    Returns a summary dict.
    """
    overlay_filename = BUSINESS_TYPE_FILES[business_type]
    overlay_src = vault_root / "wiki" / "business-types" / overlay_filename
    overlay_dst = vault_root / "wiki" / "concepts" / "Business Type Overlay.md"

    summary: dict[str, Any] = {
        "source": overlay_filename,
        "copied_to": "wiki/concepts/Business Type Overlay.md",
        "removals": [],
        "notes": [],
    }

    if not overlay_src.exists():
        summary["notes"].append(
            f"WARNING: overlay source {overlay_src.relative_to(vault_root)} not found; "
            "skipping copy. Confirm template-brain ships the business-type file."
        )
    else:
        if overlay_dst.exists() and not force:
            # Respect user edits: only overwrite if the file is byte-identical
            # to the overlay source (i.e. we wrote it last time) or if it is
            # the template placeholder that explicitly asks to be replaced.
            overlay_text = overlay_dst.read_text(encoding="utf-8")
            source_text = overlay_src.read_text(encoding="utf-8")
            if (
                "This note is replaced during scaffolding" not in overlay_text
                and _hash_text(overlay_text) != _hash_text(source_text)
            ):
                summary["notes"].append(
                    "Business Type Overlay.md was modified since last render; preserved."
                )
            else:
                shutil.copy2(overlay_src, overlay_dst)
        else:
            overlay_dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(overlay_src, overlay_dst)

    # Apply deliverable removals for this overlay.
    deliverables_dir = vault_root / "wiki" / "deliverables"
    for to_remove in _OVERLAY_DELIVERABLE_REMOVALS.get(business_type, set()):
        target = deliverables_dir / to_remove
        if target.exists():
            try:
                target.unlink()
                summary["removals"].append(f"wiki/deliverables/{to_remove}")
            except OSError as exc:
                summary["notes"].append(f"Could not remove {to_remove}: {exc}")

    return summary


def _append_manifest(
    vault_root: Path,
    *,
    action: str,
    client_slug: str,
    business_type: str,
    files_written: list[str],
    files_preserved: list[str],
    overlay: dict[str, Any],
    vars: dict[str, Any] | None = None,
) -> None:
    """Append (or initialise) the wiki-ingest-compatible manifest.

    Manifest schema (per claude-obsidian:wiki-ingest):
        {
          "sources": {
            "<rel-path-of-source>": {
              "hash": "...",
              "ingested_at": "YYYY-MM-DD",
              "pages_created": ["[[...]]"],
              "pages_updated": ["[[...]]"]
            }
          },
          "scaffold_history": [...]      # marketing-brain extension
        }
    """
    manifest_path = vault_root / ".raw" / ".manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    existing: dict[str, Any]
    if manifest_path.exists():
        try:
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(existing, dict):
                existing = {}
        except (json.JSONDecodeError, OSError):
            existing = {}
    else:
        existing = {}

    existing.setdefault("sources", {})
    existing.setdefault("scaffold_history", [])

    entry = {
        "action": action,
        "client_slug": client_slug,
        "business_type": business_type,
        "client_name": str((vars or {}).get("client_name", "")),
        "site_url": str((vars or {}).get("site_url", "")),
        "owner": str((vars or {}).get("owner", "")),
        "ran_at": date.today().isoformat(),
        "files_written": len(files_written),
        "files_preserved": len(files_preserved),
        "overlay": overlay,
    }
    existing["scaffold_history"].append(entry)

    _write_private_text(manifest_path, json.dumps(existing, indent=2, sort_keys=True) + "\n")


def _write_private_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
    finally:
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass


__all__ = [
    "BUSINESS_TYPE_FILES",
    "TemplateRenderError",
    "render_vault",
]
