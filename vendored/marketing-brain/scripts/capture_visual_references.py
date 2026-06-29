#!/usr/bin/env python3
"""
Capture screenshots and source images as visual references for a
marketing-brain vault.

The script writes evidence under:

    <vault>/.raw/sources/visuals/<date>-<slug>/

It can:
- capture desktop/mobile screenshots from a URL when Playwright is available
- download images referenced by a web page using only Python stdlib
- copy image assets from a local project directory
- write a source note under wiki/sources/ for future prompt/style work
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html.parser
import json
import mimetypes
import os
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from _args import bounded_int, validate_site_url


USER_AGENT = "marketing-brain-visual-capture/0.1 (+https://github.com/AgriciDaniel/marketing-brain)"
IMAGE_EXTS = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}
SKIP_DIRS = {
    ".git",
    ".hg",
    ".mypy_cache",
    ".obsidian",
    ".pytest_cache",
    ".raw",
    ".ruff_cache",
    ".svn",
    ".venv",
    "__pycache__",
    "dist",
    "node_modules",
}


class ImageCollector(html.parser.HTMLParser):
    """Extract image-like references from HTML."""

    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {name.lower(): value for name, value in attrs if value}
        tag = tag.lower()

        if tag == "img":
            for key in ("src", "data-src", "data-original", "data-lazy-src"):
                self._add_url(attr.get(key))
            self._add_srcset(attr.get("srcset"))
            self._add_srcset(attr.get("data-srcset"))
            return

        if tag == "source":
            self._add_url(attr.get("src"))
            self._add_srcset(attr.get("srcset"))
            return

        if tag == "meta":
            prop = (attr.get("property") or attr.get("name") or "").lower()
            if prop in {"og:image", "og:image:url", "twitter:image", "twitter:image:src"}:
                self._add_url(attr.get("content"))
            return

        if tag == "link":
            rel = (attr.get("rel") or "").lower()
            if "icon" in rel or "apple-touch-icon" in rel:
                self._add_url(attr.get("href"))

    def _add_srcset(self, value: str | None) -> None:
        if not value:
            return
        for item in value.split(","):
            candidate = item.strip().split()
            if candidate:
                self._add_url(candidate[0])

    def _add_url(self, value: str | None) -> None:
        if not value:
            return
        value = value.strip()
        if not value or value.startswith(("data:", "blob:", "javascript:", "mailto:")):
            return
        self.urls.append(urllib.parse.urljoin(self.base_url, value))


def _request(url: str) -> urllib.request.Request:
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT})


def _read_limited(response: Any, max_bytes: int) -> bytes:
    content_length = response.headers.get("content-length")
    if content_length and int(content_length) > max_bytes:
        raise ValueError(f"response is larger than max bytes ({content_length} > {max_bytes})")

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = response.read(1024 * 64)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise ValueError(f"response exceeded max bytes ({total} > {max_bytes})")
        chunks.append(chunk)
    return b"".join(chunks)


def _slugify(value: str, fallback: str = "visual-reference") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or fallback


def _source_slug(url: str | None, name: str | None, project_dir: Path | None) -> str:
    if name:
        return _slugify(name)
    if url:
        parsed = urllib.parse.urlparse(url)
        host = parsed.netloc.replace("www.", "")
        path = parsed.path.strip("/").replace("/", "-")
        return _slugify(f"{host}-{path}" if path else host)
    if project_dir:
        return _slugify(project_dir.name)
    return "visual-reference"


def _unique_dir(path: Path) -> Path:
    if not path.exists():
        return path
    for index in range(2, 100):
        candidate = path.with_name(f"{path.name}-{index}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"could not create a unique run directory near {path}")


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            unique.append(value)
    return unique


def _fetch_html(url: str, timeout: float, max_bytes: int) -> tuple[str, str]:
    with urllib.request.urlopen(_request(url), timeout=timeout) as response:
        body = _read_limited(response, max_bytes)
        charset = response.headers.get_content_charset() or "utf-8"
        return body.decode(charset, errors="replace"), response.geturl()


def _ext_for(url: str, content_type: str) -> str:
    path_ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
    if path_ext in IMAGE_EXTS:
        return ".jpg" if path_ext == ".jpeg" else path_ext

    guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
    if guessed == ".jpe":
        return ".jpg"
    if guessed == ".svg":
        return ".svg"
    if guessed in IMAGE_EXTS:
        return guessed
    return ".img"


def _filename_for(index: int, url: str, data: bytes, ext: str) -> str:
    parsed = urllib.parse.urlparse(url)
    stem = Path(parsed.path).stem or parsed.netloc or "image"
    digest = hashlib.sha256(data).hexdigest()[:12]
    return f"{index:03d}-{_slugify(stem, 'image')}-{digest}{ext}"


def _download_images(
    urls: list[str],
    target_dir: Path,
    timeout: float,
    max_bytes: int,
) -> list[dict[str, Any]]:
    target_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []

    for index, url in enumerate(urls, start=1):
        try:
            with urllib.request.urlopen(_request(url), timeout=timeout) as response:
                content_type = response.headers.get("content-type", "")
                ext = _ext_for(url, content_type)
                if not content_type.startswith("image/") and ext == ".img":
                    results.append({"url": url, "status": "skipped", "reason": "not an image"})
                    continue
                data = _read_limited(response, max_bytes)
        except (OSError, urllib.error.URLError, ValueError) as exc:
            results.append({"url": url, "status": "error", "reason": str(exc)})
            continue

        filename = _filename_for(index, url, data, ext)
        output = target_dir / filename
        output.write_bytes(data)
        results.append(
            {
                "url": url,
                "status": "downloaded",
                "path": output.as_posix(),
                "bytes": len(data),
                "content_type": content_type,
            }
        )

    return results


def _copy_project_images(
    project_dir: Path,
    target_dir: Path,
    max_images: int,
    max_bytes: int,
    include_svg: bool,
) -> list[dict[str, Any]]:
    target_dir.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []

    for path in sorted(project_dir.rglob("*")):
        if len([item for item in results if item["status"] == "copied"]) >= max_images:
            break
        if not path.is_file():
            continue
        rel = path.relative_to(project_dir)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue

        ext = path.suffix.lower()
        if ext not in IMAGE_EXTS:
            continue
        if ext == ".svg" and not include_svg:
            results.append({"path": rel.as_posix(), "status": "skipped", "reason": "svg disabled"})
            continue

        try:
            size = path.stat().st_size
            if size > max_bytes:
                results.append({"path": rel.as_posix(), "status": "skipped", "reason": "too large", "bytes": size})
                continue
            data = path.read_bytes()
        except OSError as exc:
            results.append({"path": rel.as_posix(), "status": "error", "reason": str(exc)})
            continue

        digest = hashlib.sha256(data).hexdigest()[:12]
        filename = f"{len(results) + 1:03d}-{_slugify(rel.with_suffix('').as_posix(), 'project-image')}-{digest}{ext}"
        output = target_dir / filename
        shutil.copy2(path, output)
        results.append(
            {
                "source_path": path.as_posix(),
                "status": "copied",
                "path": output.as_posix(),
                "bytes": size,
            }
        )

    return results


def _capture_screenshots(url: str, target_dir: Path, timeout: float) -> list[dict[str, Any]]:
    target_dir.mkdir(parents=True, exist_ok=True)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return [{"url": url, "status": "skipped", "reason": "playwright is not installed"}]

    viewports = [
        ("desktop", 1440, 1000),
        ("mobile", 390, 844),
    ]
    results: list[dict[str, Any]] = []

    try:
        with sync_playwright() as playwright:
            browser = None
            launch_errors: list[str] = []
            candidates = [None]
            for binary in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "brave-browser", "brave"):
                found = shutil.which(binary)
                if found and found not in candidates:
                    candidates.append(found)

            for executable in candidates:
                try:
                    kwargs = {"executable_path": executable} if executable else {}
                    browser = playwright.chromium.launch(**kwargs)
                    break
                except Exception as exc:
                    label = executable or "playwright-bundled-chromium"
                    launch_errors.append(f"{label}: {exc}")

            if browser is None:
                return [{"url": url, "status": "error", "reason": " | ".join(launch_errors)}]

            for label, width, height in viewports:
                page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
                output = target_dir / f"{label}-{width}x{height}.png"
                try:
                    page.goto(url, wait_until="networkidle", timeout=timeout * 1000)
                    page.screenshot(path=output, full_page=True)
                    results.append(
                        {
                            "url": url,
                            "status": "captured",
                            "viewport": label,
                            "path": output.as_posix(),
                            "width": width,
                            "height": height,
                        }
                    )
                except Exception as exc:  # Playwright raises its own Error class.
                    results.append({"url": url, "status": "error", "viewport": label, "reason": str(exc)})
                finally:
                    page.close()
            browser.close()
    except Exception as exc:
        return [{"url": url, "status": "error", "reason": str(exc)}]

    return results


def _rel(path: Path, vault: Path) -> str:
    try:
        return path.resolve().relative_to(vault.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def _write_note(vault: Path, run_slug: str, manifest: dict[str, Any]) -> Path:
    sources_dir = vault / "wiki" / "sources"
    sources_dir.mkdir(parents=True, exist_ok=True)
    date = manifest["date"]
    title = f"Visual Reference Capture - {run_slug}"
    note = sources_dir / f"{title}.md"

    downloaded = sum(1 for item in manifest["web_images"] if item.get("status") == "downloaded")
    copied = sum(1 for item in manifest["project_images"] if item.get("status") == "copied")
    screenshots = sum(1 for item in manifest["screenshots"] if item.get("status") == "captured")
    manifest_path = _rel(Path(manifest["manifest_path"]), vault)
    raw_dir = _rel(Path(manifest["run_dir"]), vault)

    source_lines = []
    if manifest.get("source_url"):
        source_lines.append(f"- URL: {manifest['source_url']}")
    if manifest.get("project_dir"):
        source_lines.append(f"- Project directory: `{manifest['project_dir']}`")
    source_block = "\n".join(source_lines) if source_lines else "- Source: manual capture"

    content = f"""---
type: source
title: "{title}"
created: {date}
updated: {date}
tags:
  - visual-reference
  - screenshots
  - images
status: captured
related:
  - "[[Visual Reference Capture Workflow]]"
  - "[[Image and Page Speed Workflow]]"
sources: []
---

# {title}

## Source

{source_block}
- Raw capture folder: `{raw_dir}`
- Manifest: `{manifest_path}`

## Capture Summary

- Screenshots captured: {screenshots}
- Web images downloaded: {downloaded}
- Project images copied: {copied}

## Style Notes To Extract

- Palette: dominant colors, accent colors, contrast level.
- Composition: hero framing, card density, image crops, whitespace, grid rhythm.
- Typography: heading tone, body density, UI labels, caption style.
- Material cues: texture, lighting, borders, shadows, iconography, image treatment.
- Reuse boundary: record what is owned, licensed, public-reference-only, or off-limits.

## Usage

Use this capture as a style and evidence reference when refreshing pages or generating new visuals. Do not reuse downloaded assets in production unless ownership or license is verified.
"""
    note.write_text(content, encoding="utf-8")
    return note


def _atomic_write_text(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _update_raw_manifest(vault: Path, manifest_path: Path, note_path: str | None, date: str) -> None:
    raw_manifest = vault / ".raw" / ".manifest.json"
    raw_manifest.parent.mkdir(parents=True, exist_ok=True)
    try:
        existing = json.loads(raw_manifest.read_text(encoding="utf-8")) if raw_manifest.exists() else {}
        if not isinstance(existing, dict):
            existing = {}
    except (json.JSONDecodeError, OSError):
        existing = {}

    source_key = _rel(manifest_path, vault)
    pages_created: list[str] = []
    if note_path:
        note_name = Path(note_path).stem
        pages_created.append(f"[[{note_name}]]")

    existing.setdefault("sources", {})
    existing["last_updated"] = date
    existing["sources"][source_key] = {
        "hash": _sha256_file(manifest_path),
        "ingested_at": date,
        "pages_created": pages_created,
        "pages_updated": [],
        "source_type": "visual-reference-capture",
    }
    _atomic_write_text(raw_manifest, json.dumps(existing, indent=2, sort_keys=True) + "\n")


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vault", required=True, help="Marketing-brain vault root to write into")
    parser.add_argument("--url", help="Page URL to screenshot and mine for image references")
    parser.add_argument(
        "--allow-private-url",
        action="store_true",
        help="Allow loopback/private/link-local URLs for local/staging captures",
    )
    parser.add_argument("--project-dir", help="Local project directory to scan for image assets")
    parser.add_argument("--name", help="Optional human slug for the capture run")
    parser.add_argument("--date", default=dt.date.today().isoformat(), help="Capture date, YYYY-MM-DD")
    parser.add_argument("--max-images", type=bounded_int(0, 500, name="--max-images"), default=60, help="Maximum web images to download")
    parser.add_argument("--max-project-images", type=bounded_int(0, 1000, name="--max-project-images"), default=120, help="Maximum local project images to copy")
    parser.add_argument("--max-bytes", type=int, default=15_000_000, help="Maximum bytes per fetched/copied file")
    parser.add_argument("--html-max-bytes", type=int, default=5_000_000, help="Maximum bytes for the source HTML")
    parser.add_argument("--timeout", type=float, default=45.0, help="Network/browser timeout in seconds")
    parser.add_argument("--no-screenshot", action="store_true", help="Skip Playwright screenshot capture")
    parser.add_argument("--skip-svg", action="store_true", help="Do not copy SVG files from --project-dir")
    parser.add_argument("--no-note", action="store_true", help="Do not write a wiki/sources note")
    args = parser.parse_args(argv)

    if not args.url and not args.project_dir:
        parser.error("provide at least one of --url or --project-dir")
    if args.url and not args.allow_private_url:
        try:
            args.url = validate_site_url(args.url)
        except argparse.ArgumentTypeError as exc:
            parser.error(str(exc).replace("--site", "--url"))
    try:
        dt.date.fromisoformat(args.date)
    except ValueError as exc:
        parser.error(f"--date must be YYYY-MM-DD: {exc}")
    if args.max_bytes < 1024:
        parser.error("--max-bytes is too small")
    if args.html_max_bytes < 1024:
        parser.error("--html-max-bytes is too small")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    vault = Path(args.vault).expanduser().resolve()
    if not vault.is_dir():
        print(f"ERROR: vault directory not found: {vault}", file=sys.stderr)
        return 1

    project_dir = Path(args.project_dir).expanduser().resolve() if args.project_dir else None
    if project_dir and not project_dir.is_dir():
        print(f"ERROR: project directory not found: {project_dir}", file=sys.stderr)
        return 1

    source_slug = _source_slug(args.url, args.name, project_dir)
    run_dir = _unique_dir(vault / ".raw" / "sources" / "visuals" / f"{args.date}-{source_slug}")
    screenshots_dir = run_dir / "screenshots"
    web_images_dir = run_dir / "web-images"
    project_images_dir = run_dir / "project-images"
    run_dir.mkdir(parents=True, exist_ok=True)

    final_url = None
    discovered_urls: list[str] = []
    web_images: list[dict[str, Any]] = []
    screenshots: list[dict[str, Any]] = []
    project_images: list[dict[str, Any]] = []

    if args.url:
        try:
            html, final_url = _fetch_html(args.url, args.timeout, args.html_max_bytes)
            collector = ImageCollector(final_url)
            collector.feed(html)
            discovered_urls = _dedupe(collector.urls)[: args.max_images]
            web_images = _download_images(discovered_urls, web_images_dir, args.timeout, args.max_bytes)
        except (OSError, urllib.error.URLError, ValueError) as exc:
            web_images = [{"url": args.url, "status": "error", "reason": f"HTML fetch failed: {exc}"}]

        if args.no_screenshot:
            screenshots = [{"url": args.url, "status": "skipped", "reason": "--no-screenshot"}]
        else:
            screenshots = _capture_screenshots(final_url or args.url, screenshots_dir, args.timeout)

    if project_dir:
        project_images = _copy_project_images(
            project_dir=project_dir,
            target_dir=project_images_dir,
            max_images=args.max_project_images,
            max_bytes=args.max_bytes,
            include_svg=not args.skip_svg,
        )

    manifest_path = run_dir / "manifest.json"
    manifest: dict[str, Any] = {
        "tool": "marketing-brain visual reference capture",
        "date": args.date,
        "source_slug": source_slug,
        "source_url": args.url,
        "final_url": final_url,
        "project_dir": project_dir.as_posix() if project_dir else None,
        "run_dir": run_dir.as_posix(),
        "manifest_path": manifest_path.as_posix(),
        "discovered_image_urls": discovered_urls,
        "screenshots": screenshots,
        "web_images": web_images,
        "project_images": project_images,
        "note_path": None,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if not args.no_note:
        note = _write_note(vault, source_slug, manifest)
        manifest["note_path"] = note.as_posix()
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    _update_raw_manifest(vault, manifest_path, manifest["note_path"], args.date)

    captured = sum(1 for item in screenshots if item.get("status") == "captured")
    downloaded = sum(1 for item in web_images if item.get("status") == "downloaded")
    copied = sum(1 for item in project_images if item.get("status") == "copied")

    print(f"Visual capture written to: {run_dir}")
    print(f"  screenshots captured: {captured}")
    print(f"  web images downloaded: {downloaded}")
    print(f"  project images copied: {copied}")
    if manifest["note_path"]:
        print(f"  source note: {manifest['note_path']}")
    print(f"  manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
