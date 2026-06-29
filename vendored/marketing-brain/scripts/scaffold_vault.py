#!/usr/bin/env python3
"""
Step 5 — scaffold a per-client Obsidian vault from the template-brain.

Thin CLI wrapper around ``_vault_renderer.render_vault``. Validates the
business-type slug, computes a sensible default ``--out-dir``, slots in client
context (``client``, ``site``, ``niche``, ``owner``), then prints the next
recommended pipeline command (``find_competitors.py``).

Inputs
------
- ``--client``: kebab-case client slug (becomes the vault folder name).
- ``--site``: client site URL.
- ``--niche``: short human-readable niche description.
- ``--business-type``: one of the ``BUSINESS_TYPE_FILES`` slugs.
- ``--owner``: human owner / strategist name.
- ``--out-dir``: where to write the vault (default ``~/marketing-brain-vaults``).
- ``--force``: overwrite even user-modified files.

Outputs
-------
- A populated vault at ``<out-dir>/<client>/`` with manifest entry recorded.
- A "next steps" message printed to stdout.

Cost
----
$0 (no API calls).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import _vault_renderer as vr


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATE_DIR = REPO_ROOT / "assets" / "template-brain"
DEFAULT_OUT_DIR = Path("~/marketing-brain-vaults").expanduser()


def _validate_slug(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,60}", value):
        raise argparse.ArgumentTypeError(
            f"Invalid client slug '{value}'. Use kebab-case: lowercase letters, digits, dashes; 2-61 chars."
        )
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--client", required=True, type=_validate_slug, help="Kebab-case client slug")
    parser.add_argument("--site", required=True, help="Client site URL")
    parser.add_argument("--niche", required=True, help="Short niche description (e.g. 'Ontario fly fishing')")
    parser.add_argument("--business-type", required=True, choices=sorted(vr.BUSINESS_TYPE_FILES.keys()))
    parser.add_argument("--owner", required=True, help="Human owner / strategist name")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help=f"Default {DEFAULT_OUT_DIR}")
    parser.add_argument("--client-name", default=None, help="Display name (defaults to titlecased slug)")
    parser.add_argument("--site-brand", default=None, help="Brand string for {{site_brand}} (defaults to hostname)")
    parser.add_argument("--template-dir", default=str(DEFAULT_TEMPLATE_DIR), help="Override the template-brain directory")
    parser.add_argument("--force", action="store_true", help="Overwrite even user-modified files")
    args = parser.parse_args(argv)

    template_dir = Path(args.template_dir).expanduser().resolve()
    if not template_dir.is_dir():
        print(f"ERROR: template directory not found: {template_dir}", file=sys.stderr)
        return 1

    client_name = args.client_name or args.client.replace("-", " ").title()
    # crude default for {{site_brand}}: hostname stripped of www
    site_brand = args.site_brand or _hostname_for(args.site)

    vars_dict = {
        "client": args.client,
        "client_slug": args.client,
        "client_name": client_name,
        "site_url": args.site,
        "site": args.site,
        "site_brand": site_brand,
        "site_type": args.business_type,
        "niche": args.niche,
        "owner": args.owner,
        "business_type": args.business_type,
    }

    try:
        result = vr.render_vault(
            template_dir=template_dir,
            out_dir=Path(args.out_dir).expanduser(),
            client_slug=args.client,
            vars=vars_dict,
            business_type=args.business_type,
            force=args.force,
        )
    except vr.TemplateRenderError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"\nVault scaffolded at: {result['vault_path']}")
    print(f"  Files written:    {len(result['files_written'])}")
    print(f"  Files preserved:  {len(result['files_preserved'])} (user-modified; --force to overwrite)")
    print(f"  Files skipped:    {len(result['files_skipped'])}")
    print(f"  Business overlay: {result['business_type']} -> {result['business_type_file']}")
    if result["overlay"].get("removals"):
        print(f"  Overlay removed:  {', '.join(result['overlay']['removals'])}")
    if result["overlay"].get("notes"):
        for note in result["overlay"]["notes"]:
            print(f"  Note: {note}")

    print("\nNext steps:")
    print(f"  python {Path(__file__).parent / 'find_competitors.py'} \\")
    print(f"    --site {args.site} \\")
    print(f"    --vault {result['vault_path']}")
    print()
    print("Then in order:")
    print("  pull_competitor_kw.py  --vault VAULT")
    print("  build_keyword_xlsx.py  --vault VAULT")
    print("  mine_paa_serps.py      --vault VAULT")
    print("  synthesize_beast_plan.py --vault VAULT")
    print("  render_beast_pdf.py     --vault VAULT")
    return 0


def _hostname_for(url: str) -> str:
    from urllib.parse import urlparse
    host = urlparse(url).hostname or url
    if host.startswith("www."):
        host = host[4:]
    return host


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    raise SystemExit(main())
