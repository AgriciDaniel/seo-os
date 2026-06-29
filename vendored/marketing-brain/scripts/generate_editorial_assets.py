#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "assets" / "svg"
ATTACH = REPO / "assets" / "template-brain" / "_attachments"


def main(argv: list[str] | None = None) -> int:
    del argv
    OUT.mkdir(parents=True, exist_ok=True)
    ATTACH.mkdir(parents=True, exist_ok=True)
    assets = {
        "hero-frontispiece-a1.svg": hero(),
        "pipeline-six-step-a1.svg": pipeline(),
        "search-trust-framework-a1.svg": trust(),
        "vault-output-map-a1.svg": vault_map(),
        "release-build-v015-a1.svg": release(),
    }
    for name, svg in assets.items():
        (OUT / name).write_text(svg, encoding="utf-8")
    (ATTACH / "vault-relationship-graph.svg").write_text(vault_map(), encoding="utf-8")
    (ATTACH / "search-trust-gates.svg").write_text(trust(), encoding="utf-8")
    print(f"Generated {len(assets)} SVG assets")
    return 0


def shell(title: str, subtitle: str, body: str, *, width: int = 1200, height: int = 630) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0b1720"/>
      <stop offset="0.45" stop-color="#12324a"/>
      <stop offset="1" stop-color="#1f4e45"/>
    </linearGradient>
    <style>
      .title{{font:700 56px Arial,sans-serif;fill:#f7fbff}}
      .sub{{font:400 24px Arial,sans-serif;fill:#c7d7e2}}
      .label{{font:700 19px Arial,sans-serif;fill:#10202b}}
      .small{{font:500 15px Arial,sans-serif;fill:#314655}}
      .node{{rx:8;stroke:#ffffff;stroke-width:2}}
      .line{{stroke:#c7d7e2;stroke-width:4;stroke-linecap:round;opacity:.75}}
    </style>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="48" y="48" width="1104" height="534" rx="18" fill="none" stroke="#d7efe8" stroke-width="2" opacity=".5"/>
  <text x="82" y="126" class="title">{title}</text>
  <text x="86" y="166" class="sub">{subtitle}</text>
{body}
</svg>
"""


def hero() -> str:
    body = """
  <path class="line" d="M145 395 C310 260 420 495 565 352 S855 250 1010 386"/>
  <rect class="node" x="94" y="294" width="190" height="88" fill="#66d9b8"/>
  <text class="label" x="122" y="330">Source Truth</text><text class="small" x="122" y="356">raw exports + docs</text>
  <rect class="node" x="372" y="392" width="190" height="88" fill="#ffd166"/>
  <text class="label" x="404" y="428">Search Signals</text><text class="small" x="404" y="454">keywords + SERPs</text>
  <rect class="node" x="650" y="292" width="190" height="88" fill="#ef767a"/>
  <text class="label" x="684" y="328">BEAST Plan</text><text class="small" x="684" y="354">source-cited actions</text>
  <rect class="node" x="928" y="390" width="190" height="88" fill="#8ecae6"/>
  <text class="label" x="964" y="426">Client Report</text><text class="small" x="964" y="452">HTML + PDF</text>
"""
    return shell("Marketing Brain", "Obsidian strategy OS for search, content, and AI-era measurement", body)


def pipeline() -> str:
    labels = ["Scaffold", "Competitors", "Keywords", "PAA", "Synthesize", "Report"]
    colors = ["#66d9b8", "#8ecae6", "#ffd166", "#f4a261", "#ef767a", "#b8a1ff"]
    body = ""
    for i, (label, color) in enumerate(zip(labels, colors)):
        x = 95 + i * 178
        body += f'<rect class="node" x="{x}" y="310" width="142" height="92" fill="{color}"/>\n'
        body += f'<text class="label" x="{x+19}" y="360">{label}</text>\n'
        if i < len(labels) - 1:
            body += f'<path class="line" d="M{x+145} 356 H{x+174}"/>\n'
    return shell("Six-Step Pipeline", "Deterministic demo first, live DataForSEO behind caps", body)


def trust() -> str:
    labels = ["Indexed", "Helpful", "Cited", "Approved", "Rollback"]
    colors = ["#8ecae6", "#66d9b8", "#ffd166", "#f4a261", "#ef767a"]
    body = ""
    for i, (label, color) in enumerate(zip(labels, colors)):
        x = 125 + i * 200
        body += f'<circle cx="{x}" cy="355" r="68" fill="{color}" stroke="#fff" stroke-width="3"/>\n'
        body += f'<text class="label" x="{x-43}" y="362">{label}</text>\n'
    return shell("Search Trust Gates", "No recommendation ships without source, owner, confidence, approval, and rollback", body)


def vault_map() -> str:
    body = """
  <rect class="node" x="90" y="302" width="180" height="82" fill="#8ecae6"/><text class="label" x="132" y="350">Hot</text>
  <rect class="node" x="330" y="302" width="180" height="82" fill="#66d9b8"/><text class="label" x="372" y="350">Index</text>
  <rect class="node" x="570" y="235" width="180" height="82" fill="#ffd166"/><text class="label" x="610" y="283">Wiki</text>
  <rect class="node" x="570" y="370" width="180" height="82" fill="#f4a261"/><text class="label" x="606" y="418">Sources</text>
  <rect class="node" x="810" y="302" width="260" height="82" fill="#ef767a"/><text class="label" x="862" y="350">Deliverables</text>
  <path class="line" d="M270 343 H330"/><path class="line" d="M510 343 C548 343 536 276 570 276"/><path class="line" d="M510 343 C548 343 536 411 570 411"/><path class="line" d="M750 276 C788 276 775 343 810 343"/><path class="line" d="M750 411 C788 411 775 343 810 343"/>
"""
    return shell("Vault Relationship Graph", "Hot / Index / Wiki with immutable raw sources and source-cited outputs", body)


def release() -> str:
    body = """
  <rect class="node" x="115" y="275" width="250" height="135" fill="#66d9b8"/><text class="label" x="157" y="330">Template ZIP</text><text class="small" x="157" y="358">buyer vault</text>
  <rect class="node" x="475" y="275" width="250" height="135" fill="#ffd166"/><text class="label" x="515" y="330">Sample ZIP</text><text class="small" x="515" y="358">synthetic demo</text>
  <rect class="node" x="835" y="275" width="250" height="135" fill="#8ecae6"/><text class="label" x="885" y="330">Source ZIP</text><text class="small" x="885" y="358">private repo</text>
  <path class="line" d="M365 343 H475"/><path class="line" d="M725 343 H835"/>
"""
    return shell("v0.1.5 Release Build", "ZIPs, checksums, manifest, secret scan, and vault lint gates", body)


if __name__ == "__main__":
    raise SystemExit(main())
