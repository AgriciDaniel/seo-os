#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
TEXT_SUFFIXES = {".base", ".canvas", ".css", ".csv", ".html", ".json", ".md", ".py", ".sh", ".toml", ".txt", ".yaml", ".yml"}
MAX_SCAN_BYTES = 25 * 1024 * 1024
SKIP_PARTS = {".git", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".venv", "__pycache__", "build", "dist", "venv"}
SKIP_SUFFIXES = {".pyc", ".pyo", ".log", ".pdf"}
FORBIDDEN_ENTRY_NAMES = {".env", ".env.local", ".env.production", ".DS_Store", "Thumbs.db", "workspace.json"}
LOCAL_HOME_PATTERN = rb"/home/" + rb"agrici" + rb"daniel"
FORBIDDEN_TEXT_PATTERNS = {
    "local home path": re.compile(LOCAL_HOME_PATTERN),
    "personal gmail": re.compile(rb"agricidaniel@gmail\.com", re.I),
    "private key": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "openai api key": re.compile(rb"sk-[A-Za-z0-9_-]{20,}"),
    "anthropic api key": re.compile(rb"sk-ant-[A-Za-z0-9_-]{20,}"),
    "github token": re.compile(rb"(ghp|github_pat)_[A-Za-z0-9_]{20,}"),
    "aws key": re.compile(rb"AKIA[0-9A-Z]{16}"),
    "google api key": re.compile(rb"AIza[0-9A-Za-z_-]{20,}"),
    "google oauth token": re.compile(rb"ya29\.[A-Za-z0-9_-]{20,}"),
    "slack token": re.compile(rb"xox[baprs]-[A-Za-z0-9-]{20,}"),
    "bearer literal": re.compile(rb"Bearer\s+[A-Za-z0-9._-]{24,}"),
    "real eval domain": re.compile(rb"ontario" + rb"trout" + rb"and" + rb"steelhead" + rb"\.com", re.I),
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build and verify Marketing Brain release ZIP artifacts.")
    parser.add_argument("--version", required=True, help="Release version without leading v, for example 0.1.5")
    parser.add_argument("--dist-dir", default="dist")
    args = parser.parse_args(argv)
    version = normalize_version(args.version)
    dist = Path(args.dist_dir).expanduser()
    if not dist.is_absolute():
        dist = REPO / dist
    dist.mkdir(parents=True, exist_ok=True)

    scan_source_tree()
    artifacts = [
        build_source_zip(dist / f"marketing-brain-v{version}.zip", version),
        build_zip(dist / f"marketing-brain-template-v{version}.zip", REPO / "assets" / "template-brain", "marketing-brain-template"),
        build_zip(dist / f"marketing-brain-sample-vault-v{version}.zip", REPO / "examples" / "sample-vault", "marketing-brain-sample-vault"),
        build_source_zip(dist / f"marketing-brain-source-v{version}.zip", version),
    ]
    for artifact in artifacts:
        validate_zip(artifact["path"])

    manifest = {
        "product": "marketing-brain",
        "version": version,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "git_commit": git_commit(),
        "artifacts": [
            {
                "file": artifact["path"].name,
                "sha256": sha256_file(artifact["path"]),
                "bytes": artifact["path"].stat().st_size,
                "entries": artifact["entries"],
            }
            for artifact in artifacts
        ],
        "checks": [
            "repo source scan passed",
            "zip entry scan passed",
            "zip content secret scan passed",
            "zip content local-path scan passed",
        ],
    }
    manifest_path = dist / "RELEASE_MANIFEST.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    sums_path = dist / "SHA256SUMS"
    write_sha256s(sums_path, [*(artifact["path"] for artifact in artifacts), manifest_path])
    validate_sha256s(sums_path)
    print(f"Release package built in {dist}")
    for artifact in artifacts:
        print(f"- {artifact['path'].name} ({artifact['entries']} entries)")
    print(f"- {manifest_path.name}")
    print(f"- {sums_path.name}")
    return 0


def normalize_version(value: str) -> str:
    version = value.strip().removeprefix("v")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise SystemExit("ERROR: --version must look like 0.1.5")
    return version


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & SKIP_PARTS:
        return True
    if path.name in FORBIDDEN_ENTRY_NAMES:
        return True
    return path.suffix in SKIP_SUFFIXES


def iter_tree(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*"):
        rel = path.relative_to(root)
        if path.is_symlink():
            raise SystemExit(f"ERROR: symlink not allowed in release package: {rel.as_posix()}")
        if path.is_file() and not should_skip(rel):
            files.append(path)
    return sorted(files)


def build_zip(out: Path, source: Path, root_name: str) -> dict[str, object]:
    if not source.exists():
        raise SystemExit(f"ERROR: package source missing: {source}")
    entries = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in iter_tree(source):
            rel = path.relative_to(source)
            zf.write(path, (Path(root_name) / rel).as_posix())
            entries += 1
    return {"path": out, "entries": entries}


def build_source_zip(out: Path, version: str) -> dict[str, object]:
    entries = 0
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in source_files():
            rel = path.relative_to(REPO)
            if should_skip(rel):
                continue
            zf.write(path, (Path(f"marketing-brain-v{version}") / rel).as_posix())
            entries += 1
    return {"path": out, "entries": entries}


def source_files() -> list[Path]:
    if (REPO / ".git").exists():
        reject_untracked_files()
        proc = subprocess.run(["git", "ls-files", "-z", "--cached"], cwd=REPO, check=False, capture_output=True)
        if proc.returncode != 0:
            raise SystemExit(proc.stderr.decode("utf-8", "replace"))
        files = []
        for raw in proc.stdout.split(b"\0"):
            if raw:
                path = REPO / raw.decode("utf-8", "replace")
                if path.is_file():
                    files.append(path)
        return sorted(files)
    return iter_tree(REPO)


def reject_untracked_files() -> None:
    proc = subprocess.run(["git", "ls-files", "-z", "--others", "--exclude-standard"], cwd=REPO, check=False, capture_output=True)
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.decode("utf-8", "replace"))
    untracked = sorted(raw.decode("utf-8", "replace") for raw in proc.stdout.split(b"\0") if raw)
    allowed = [path for path in untracked if not should_skip(Path(path))]
    if allowed:
        preview = ", ".join(allowed[:10])
        extra = "" if len(allowed) <= 10 else f", ... ({len(allowed)} total)"
        raise SystemExit(f"ERROR: untracked files would make the release non-reproducible: {preview}{extra}")


def scan_source_tree() -> None:
    for path in source_files():
        rel = path.relative_to(REPO)
        if not should_skip(rel):
            scan_file(path, rel.as_posix())


def validate_zip(path: Path) -> None:
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        if not names:
            raise SystemExit(f"ERROR: empty artifact: {path.name}")
        for name in names:
            rel = Path(name)
            if should_skip(rel) or any(part in SKIP_PARTS for part in rel.parts):
                raise SystemExit(f"ERROR: forbidden zip entry in {path.name}: {name}")
            mode = zf.getinfo(name).external_attr >> 16
            if stat.S_ISLNK(mode):
                raise SystemExit(f"ERROR: symlink entry in {path.name}: {name}")
            scan_bytes(zf.read(name), f"{path.name}:{name}", suffix=rel.suffix)


def scan_file(path: Path, label: str) -> None:
    size = path.stat().st_size
    if size > MAX_SCAN_BYTES:
        raise SystemExit(f"ERROR: file too large for release secret scan: {label} ({size} bytes)")
    scan_bytes(path.read_bytes(), label, suffix=path.suffix)


def scan_bytes(data: bytes, label: str, *, suffix: str) -> None:
    if suffix and suffix not in TEXT_SUFFIXES:
        return
    for name, pattern in FORBIDDEN_TEXT_PATTERNS.items():
        if pattern.search(data):
            raise SystemExit(f"ERROR: {name} found in {label}")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_sha256s(path: Path, artifacts: list[Path]) -> None:
    lines = [f"{sha256_file(artifact)}  {artifact.name}" for artifact in artifacts]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def validate_sha256s(path: Path) -> None:
    for line in path.read_text(encoding="utf-8").splitlines():
        expected, filename = line.split("  ", 1)
        actual = sha256_file(path.parent / filename)
        if expected != actual:
            raise SystemExit(f"ERROR: checksum mismatch for {filename}")


def git_commit() -> str | None:
    if not (REPO / ".git").exists():
        return None
    proc = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=False)
    return proc.stdout.strip() if proc.returncode == 0 else None


if __name__ == "__main__":
    raise SystemExit(main())
