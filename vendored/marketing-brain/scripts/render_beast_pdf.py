#!/usr/bin/env python3
"""
Step 6 deliverable — render the ULTIMATE BEAST Plan to an editorial PDF.

Reads ``<vault>/wiki/deliverables/ULTIMATE BEAST Plan.md`` (or ``--plan-md``)
plus vault metadata (client name, site URL, date) from the manifest. Loads
``<repo>/assets/beast-pdf.html`` + ``<repo>/assets/editorial-pdf.css``,
substitutes ``{{placeholder}}`` tokens, and shells out to WeasyPrint.

Drop-cap workaround
-------------------
WeasyPrint cannot float ``::first-letter``. The bundled HTML template uses
``::first-line`` emphasis instead. Do NOT add ``float: left`` to a
``::first-letter`` rule unless you have re-tested with the installed
WeasyPrint version (older smoke builds hit this bug repeatedly).

Inputs
------
- ``--vault``: vault root.
- ``--plan-md``: explicit path to the markdown plan (default ``wiki/deliverables/ULTIMATE BEAST Plan.md``).
- ``--out``: explicit PDF output path (default ``<vault>/<client-slug>-Beast-Plan.pdf``).
- ``--template-html`` / ``--template-css``: override bundled assets.
- ``--weasyprint``: path to the weasyprint binary (default ``~/.local/bin/weasyprint``).

Outputs
-------
- ``<vault>/<client-slug>-Beast-Plan.pdf``
- Stdout: file size and page count (best-effort via WeasyPrint stderr parse).

Cost
----
$0 (no API calls).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HTML_TEMPLATE = REPO_ROOT / "assets" / "beast-pdf.html"
DEFAULT_CSS = REPO_ROOT / "assets" / "editorial-pdf.css"
DEFAULT_WEASY = Path(shutil.which("weasyprint") or "~/.local/bin/weasyprint").expanduser()

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}")


def _substitute(text: str, vars: dict[str, str]) -> str:
    def repl(m: re.Match[str]) -> str:
        return str(vars.get(m.group(1), m.group(0)))
    return _PLACEHOLDER_RE.sub(repl, text)


def _detect_vault_meta(vault: Path) -> dict[str, str]:
    """Pull client/site/date from the latest scaffold entry in the manifest."""
    out: dict[str, str] = {"date": date.today().isoformat()}
    manifest = vault / ".raw" / ".manifest.json"
    if not manifest.exists():
        return out
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return out
    history = data.get("scaffold_history") or []
    if history:
        last = history[-1]
        out["client"] = last.get("client_slug", "")
        out["client_slug"] = last.get("client_slug", "")
        out["business_type"] = last.get("business_type", "")
        out["client_name"] = last.get("client_name", "")
        out["site_url"] = last.get("site_url", "")
    return out


def _markdown_to_inline_html(md_text: str) -> str:
    """Lightweight markdown -> HTML for embedding in the PDF template body.

    We deliberately do not pull in a markdown library: the beast plan markdown
    is well-structured and we want zero extra deps. Supports: H1/H2/H3,
    paragraphs, ``**bold**`` / ``*em*``, simple unordered lists, fenced code
    blocks. If you need richer rendering, swap this for ``markdown2`` later.
    """
    lines = md_text.splitlines()
    html: list[str] = []
    in_list = False
    in_code = False
    code_lang = ""
    para_buf: list[str] = []

    def flush_para():
        nonlocal para_buf
        if para_buf:
            text = " ".join(para_buf).strip()
            if text:
                html.append(f"<p>{_inline(text)}</p>")
            para_buf = []

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            flush_para()
            if in_code:
                html.append("</code></pre>")
                in_code = False
                code_lang = ""
            else:
                code_lang = line[3:].strip()
                html.append(f'<pre><code class="lang-{code_lang}">')
                in_code = True
            continue
        if in_code:
            html.append(_escape(raw))
            continue

        if not line.strip():
            flush_para()
            if in_list:
                html.append("</ul>")
                in_list = False
            continue

        # Headings
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            flush_para()
            if in_list:
                html.append("</ul>")
                in_list = False
            level = len(m.group(1))
            html.append(f"<h{level}>{_inline(m.group(2))}</h{level}>")
            continue

        # Lists
        m = re.match(r"^[-*]\s+(.*)$", line)
        if m:
            flush_para()
            if not in_list:
                html.append("<ul>")
                in_list = True
            html.append(f"<li>{_inline(m.group(1))}</li>")
            continue

        if in_list:
            html.append("</ul>")
            in_list = False
        para_buf.append(line)

    flush_para()
    if in_list:
        html.append("</ul>")
    if in_code:
        html.append("</code></pre>")
    return "\n".join(html)


def _inline(text: str) -> str:
    text = _escape(text)
    # ``code``
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    # **bold**
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    # *em*
    text = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", text)
    # [text](url)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def _escape(text: str) -> str:
    return (text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vault", required=True)
    parser.add_argument("--plan-md", default=None)
    parser.add_argument("--out", default=None)
    parser.add_argument("--template-html", default=str(DEFAULT_HTML_TEMPLATE))
    parser.add_argument("--template-css", default=str(DEFAULT_CSS))
    parser.add_argument("--weasyprint", default=str(DEFAULT_WEASY))
    parser.add_argument("--html-only", action="store_true", help="Write the report HTML and skip PDF rendering")
    parser.add_argument("--client-name", default=None)
    parser.add_argument("--site-url", default=None)
    parser.add_argument("--kpi", action="append", default=[],
                        help="KPI in 'label=value' form. May be repeated. Mapped to {{kpi1_label}}/{{kpi1_value}} etc.")
    args = parser.parse_args(argv)

    vault = Path(args.vault).expanduser().resolve()
    plan_md = Path(args.plan_md).expanduser().resolve() if args.plan_md else (
        vault / "wiki" / "deliverables" / "ULTIMATE BEAST Plan.md"
    )
    if not plan_md.exists():
        print(f"ERROR: plan markdown not found: {plan_md}", file=sys.stderr)
        return 1
    template_html = Path(args.template_html).expanduser().resolve()
    template_css = Path(args.template_css).expanduser().resolve()

    if not template_html.exists():
        print(f"WARN: HTML template missing at {template_html}; falling back to bare-bones HTML.", file=sys.stderr)
        template_text = _fallback_template()
    else:
        template_text = template_html.read_text(encoding="utf-8")

    css_text = template_css.read_text(encoding="utf-8") if template_css.exists() else ""

    meta = _detect_vault_meta(vault)
    vars_dict: dict[str, str] = {
        "client": args.client_name or meta.get("client", ""),
        "client_name": args.client_name or meta.get("client_name") or meta.get("client", "").replace("-", " ").title(),
        "client_slug": meta.get("client_slug", ""),
        "site_url": args.site_url or meta.get("site_url", ""),
        "date": date.today().isoformat(),
        "today": date.today().isoformat(),
        "business_type": meta.get("business_type", ""),
    }
    # KPI slots.
    for i, raw in enumerate(args.kpi, start=1):
        if "=" not in raw:
            print(f"WARN: --kpi '{raw}' is not 'label=value'; ignoring.", file=sys.stderr)
            continue
        label, value = raw.split("=", 1)
        vars_dict[f"kpi{i}_label"] = label.strip()
        vars_dict[f"kpi{i}_value"] = value.strip()

    # Render the plan body.
    plan_body = _markdown_to_inline_html(plan_md.read_text(encoding="utf-8"))
    vars_dict["plan_body"] = plan_body
    vars_dict["plan_css"] = css_text

    rendered = _substitute(template_text, vars_dict)

    # Write a temp HTML next to the PDF (handy for debugging).
    out_pdf = Path(args.out).expanduser().resolve() if args.out else (
        vault / f"{meta.get('client_slug', 'client')}-Beast-Plan.pdf"
    )
    tmp_html = out_pdf.with_suffix(".html")
    tmp_html.parent.mkdir(parents=True, exist_ok=True)
    tmp_html.write_text(rendered, encoding="utf-8")
    if template_css.exists():
        shutil.copy2(template_css, tmp_html.parent / template_css.name)

    if args.html_only:
        print(f"Wrote HTML report: {tmp_html}")
        return 0

    weasy = Path(args.weasyprint).expanduser()
    if not weasy.exists():
        print(f"ERROR: weasyprint not found at {weasy}. Install or override with --weasyprint.", file=sys.stderr)
        return 1

    cmd = [str(weasy), str(tmp_html), str(out_pdf)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"ERROR: weasyprint exited {proc.returncode}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}", file=sys.stderr)
        return proc.returncode
    if proc.stderr.strip():
        # WeasyPrint emits warnings here; pass them through but don't fail.
        print(proc.stderr, file=sys.stderr)

    size_kb = out_pdf.stat().st_size / 1024
    page_count = _estimate_page_count(out_pdf)
    print(f"Wrote {out_pdf} ({size_kb:.1f} KB, ~{page_count} pages)")
    print(f"HTML kept at {tmp_html} (for debugging)")
    return 0


def _estimate_page_count(pdf_path: Path) -> int | str:
    """Cheap PDF page-count estimator. Counts /Type /Page tokens in the raw PDF.
    Returns "?" on failure rather than crashing — page count is informational.
    """
    try:
        data = pdf_path.read_bytes()
    except OSError:
        return "?"
    return data.count(b"/Type /Page") - data.count(b"/Type /Pages")


def _fallback_template() -> str:
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<title>{{client_name}} — Beast Plan</title>"
        "<style>{{plan_css}}</style></head><body>"
        "<header><h1>{{client_name}}</h1><p>{{site_url}} — {{date}}</p></header>"
        "<main>{{plan_body}}</main></body></html>"
    )


if __name__ == "__main__":
    raise SystemExit(main())
