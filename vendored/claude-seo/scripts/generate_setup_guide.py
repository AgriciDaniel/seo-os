#!/usr/bin/env python3
"""Generate a Google API Setup Guide PDF matching the claude-seo report style."""

import os
import sys
import datetime

try:
    from weasyprint import HTML
except ImportError:
    print("Error: weasyprint required. Install with: pip install weasyprint", file=sys.stderr)
    sys.exit(1)

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

HTML_CONTENT = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
@page {
    size: A4;
    margin: 20mm 18mm 20mm 18mm;
}
@page :first {
    margin: 0;
}
* { box-sizing: border-box; }
body {
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
}

/* Title Page */
.title-page {
    width: 210mm;
    height: 297mm;
    background: #ffffff;
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
}
.title-top-bar {
    height: 8mm;
    background: #1e3a5f;
    width: 100%;
}
.title-content {
    padding: 45mm 25mm 30mm 25mm;
    flex: 1;
}
.title-content h1 {
    font-size: 28pt;
    color: #1e3a5f;
    margin: 0 0 8mm 0;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1.15;
}
.title-content .subtitle {
    font-size: 14pt;
    color: #555;
    margin: 0 0 15mm 0;
    line-height: 1.4;
}
.title-meta {
    font-size: 10pt;
    color: #777;
    border-top: 1px solid #ddd;
    padding-top: 5mm;
}
.title-meta span {
    display: block;
    margin-bottom: 2mm;
}
.title-footer {
    padding: 8mm 25mm;
    border-top: 1px solid #e0e0e0;
    font-size: 9pt;
    color: #999;
    display: table;
    width: 100%;
}
.title-footer .left { display: table-cell; text-align: left; }
.title-footer .right { display: table-cell; text-align: right; }

/* Content Pages */
h2 {
    font-size: 16pt;
    color: #1e3a5f;
    margin: 12mm 0 4mm 0;
    border-bottom: 2px solid #1e3a5f;
    padding-bottom: 2mm;
}
h3 {
    font-size: 12pt;
    color: #1e3a5f;
    margin: 6mm 0 3mm 0;
}
p { margin: 0 0 3mm 0; }
ul, ol { margin: 0 0 4mm 0; padding-left: 7mm; }
li { margin-bottom: 1.5mm; }
a { color: #1e3a5f; text-decoration: underline; }

/* Code blocks */
code {
    font-family: "Courier New", monospace;
    font-size: 9.5pt;
    background: #f5f5f0;
    padding: 0.5mm 1.5mm;
    border-radius: 1mm;
}
pre {
    background: #f5f5f0;
    border: 1px solid #e0e0e0;
    border-radius: 2mm;
    padding: 4mm;
    font-size: 9pt;
    font-family: "Courier New", monospace;
    line-height: 1.6;
    margin: 3mm 0 5mm 0;
    overflow-wrap: break-word;
    white-space: pre-wrap;
}

/* Tables */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 3mm 0 5mm 0;
    font-size: 10pt;
}
th {
    background: #1e3a5f;
    color: #fff;
    padding: 2.5mm 3mm;
    text-align: left;
    font-weight: 600;
}
td {
    padding: 2mm 3mm;
    border-bottom: 1px solid #e0e0e0;
}
tr:nth-child(even) td {
    background: #faf9f7;
}

/* Callout boxes */
.tip {
    background: #f0f7f0;
    border-left: 3px solid #2d6a4f;
    padding: 3mm 4mm;
    margin: 3mm 0 5mm 0;
    font-size: 10pt;
}
.tip strong { color: #2d6a4f; }
.warning {
    background: #fef8f0;
    border-left: 3px solid #d4740e;
    padding: 3mm 4mm;
    margin: 3mm 0 5mm 0;
    font-size: 10pt;
}
.warning strong { color: #d4740e; }

/* Step numbers */
.step {
    display: inline-block;
    background: #1e3a5f;
    color: #fff;
    width: 7mm;
    height: 7mm;
    line-height: 7mm;
    text-align: center;
    border-radius: 50%;
    font-size: 10pt;
    font-weight: 700;
    margin-right: 2mm;
    vertical-align: middle;
}

/* Footer */
.page-footer {
    font-size: 8pt;
    color: #aaa;
    text-align: center;
    margin-top: 10mm;
    border-top: 1px solid #e0e0e0;
    padding-top: 3mm;
}
</style>
</head>
<body>

<!-- TITLE PAGE -->
<div class="title-page">
    <div class="title-top-bar"></div>
    <div class="title-content">
        <h1>Google SEO API<br>Setup Guide</h1>
        <div class="subtitle">
            Connect Claude SEO to Google's data APIs.<br>
            PageSpeed, CrUX, Search Console, Indexing, GA4.
        </div>
        <div class="title-meta">
            <span><strong>Version:</strong> 1.7.0</span>
            <span><strong>Date:</strong> """ + datetime.date.today().strftime("%B %d, %Y") + """</span>
            <span><strong>Author:</strong> Claude SEO by AgriciDaniel</span>
        </div>
    </div>
    <div class="title-footer">
        <span class="left">github.com/AgriciDaniel/claude-seo</span>
        <span class="right">Powered by Google APIs</span>
    </div>
</div>

<!-- PAGE 2: OVERVIEW -->
<h2>What You Get</h2>

<p>Four credential tiers. Each unlocks more data. Start at Tier 0 (free, 2 minutes) and upgrade as needed.</p>

<table>
    <tr><th>Tier</th><th>Auth</th><th>APIs Unlocked</th><th>Setup Time</th></tr>
    <tr><td><strong>0</strong></td><td>API Key</td><td>PageSpeed Insights, CrUX, CrUX History, YouTube, NLP</td><td>2 min</td></tr>
    <tr><td><strong>1</strong></td><td>+ OAuth</td><td>+ Search Console, URL Inspection, Indexing API</td><td>10 min</td></tr>
    <tr><td><strong>2</strong></td><td>+ GA4 config</td><td>+ GA4 organic traffic, landing pages, devices</td><td>5 min</td></tr>
    <tr><td><strong>3</strong></td><td>+ Ads token</td><td>+ Keyword Planner volumes and ideas</td><td>15 min</td></tr>
</table>

<div class="tip">
    <strong>Tip:</strong> Most users only need Tier 0 or Tier 1. Tier 0 gives you Core Web Vitals field data with zero authentication hassle.
</div>

<!-- PAGE 3: TIER 0 -->
<h2><span class="step">0</span> Tier 0: API Key (2 minutes)</h2>

<h3>Create a Google Cloud Project</h3>
<ol>
    <li>Go to <a href="https://console.cloud.google.com">console.cloud.google.com</a></li>
    <li>Click <strong>Select a project</strong> (top bar) then <strong>New Project</strong></li>
    <li>Name it (e.g. "claude-seo") and click <strong>Create</strong></li>
</ol>

<h3>Enable APIs</h3>
<ol>
    <li>Go to <a href="https://console.cloud.google.com/apis/library">APIs &amp; Services &gt; Library</a></li>
    <li>Search and enable each:
        <ul>
            <li><strong>PageSpeed Insights API</strong></li>
            <li><strong>Chrome UX Report API</strong></li>
        </ul>
    </li>
</ol>

<h3>Create an API Key</h3>
<ol>
    <li>Go to <a href="https://console.cloud.google.com/apis/credentials">APIs &amp; Services &gt; Credentials</a></li>
    <li>Click <strong>+ Create Credentials</strong> then <strong>API key</strong></li>
    <li>Copy the key (starts with <code>AIza...</code>)</li>
    <li>Click <strong>Restrict key</strong>. Under "API restrictions", select:
        <ul>
            <li>PageSpeed Insights API</li>
            <li>Chrome UX Report API</li>
        </ul>
    </li>
</ol>

<h3>Save to Config</h3>
<pre>mkdir -p ~/.config/claude-seo
cat &gt; ~/.config/claude-seo/google-api.json &lt;&lt; 'EOF'
{
  "api_key": "YOUR_API_KEY_HERE"
}
EOF</pre>

<h3>Verify</h3>
<pre>python scripts/google_auth.py --check --json</pre>

<div class="tip">
    <strong>Done.</strong> You can now run: <code>/seo google psi &lt;url&gt;</code>, <code>/seo google crux &lt;url&gt;</code>, <code>/seo google history &lt;url&gt;</code>
</div>

<!-- PAGE 4: TIER 1 -->
<h2><span class="step">1</span> Tier 1: OAuth (10 minutes)</h2>

<p>Adds Search Console, URL Inspection, and Indexing API access using your personal Google account.</p>

<h3>Create OAuth Web Credentials</h3>
<ol>
    <li>Go to <a href="https://console.cloud.google.com/apis/credentials">APIs &amp; Services &gt; Credentials</a></li>
    <li>Click <strong>+ Create Credentials</strong> then <strong>OAuth client ID</strong></li>
    <li>If prompted, configure the <strong>OAuth consent screen</strong> first:
        <ul>
            <li>User type: <strong>External</strong></li>
            <li>App name: "Claude SEO"</li>
            <li>Support email: your email</li>
            <li>Add scopes: <code>webmasters.readonly</code>, <code>indexing</code></li>
            <li>Test users: add your own email</li>
        </ul>
    </li>
    <li>Application type: <strong>Web application</strong></li>
    <li>Add Authorized redirect URI: <code>http://localhost:8085</code></li>
    <li>Click <strong>Create</strong></li>
    <li>Download the JSON file (<strong>Download JSON</strong> icon)</li>
</ol>

<h3>Enable Additional APIs</h3>
<p>In <a href="https://console.cloud.google.com/apis/library">APIs &amp; Services &gt; Library</a>, enable:</p>
<ul>
    <li><strong>Google Search Console API</strong></li>
    <li><strong>Web Search Indexing API</strong></li>
</ul>

<h3>Run the Auth Flow</h3>
<pre>python scripts/google_auth.py --auth --creds /path/to/client_secret.json</pre>

<p>A browser window opens. Sign in, grant permissions, close the tab when done.</p>

<h3>Update Config</h3>
<pre>{
  "api_key": "YOUR_API_KEY",
  "oauth_client_path": "/path/to/client_secret.json",
  "default_property": "sc-domain:yourdomain.com"
}</pre>

<div class="tip">
    <strong>Done.</strong> You can now run: <code>/seo google gsc</code>, <code>/seo google inspect &lt;url&gt;</code>, <code>/seo google index &lt;url&gt;</code>
</div>

<div class="warning">
    <strong>Indexing API scope:</strong> Google restricts the Indexing API to pages with <code>JobPosting</code> or <code>BroadcastEvent</code> schema. Quota: 200 URLs/day.
</div>

<!-- PAGE 5: TIER 2 -->
<h2><span class="step">2</span> Tier 2: GA4 (5 minutes)</h2>

<p>Adds organic traffic reports, top landing pages, device and country breakdowns.</p>

<h3>Enable the API</h3>
<p>In <a href="https://console.cloud.google.com/apis/library">APIs &amp; Services &gt; Library</a>, enable:</p>
<ul>
    <li><strong>Google Analytics Data API</strong></li>
</ul>

<h3>Find Your Property ID</h3>
<ol>
    <li>Go to <a href="https://analytics.google.com">analytics.google.com</a></li>
    <li><strong>Admin</strong> (gear icon) &gt; <strong>Property Settings</strong></li>
    <li>Copy the <strong>Property ID</strong> (numeric, e.g. <code>123456789</code>)</li>
</ol>

<h3>Add Scopes to OAuth</h3>
<p>The default OAuth flow already requests <code>analytics.readonly</code>. If you ran the auth before enabling GA4, re-run:</p>
<pre>python scripts/google_auth.py --auth --creds /path/to/client_secret.json</pre>

<h3>Update Config</h3>
<pre>{
  "api_key": "YOUR_API_KEY",
  "oauth_client_path": "/path/to/client_secret.json",
  "default_property": "sc-domain:yourdomain.com",
  "ga4_property_id": "properties/123456789"
}</pre>

<div class="tip">
    <strong>Done.</strong> You can now run: <code>/seo google ga4 traffic</code>, <code>/seo google ga4 top-pages</code>, <code>/seo google ga4 devices</code>
</div>

<!-- PAGE 6: COMMANDS REFERENCE -->
<h2>Quick Command Reference</h2>

<table>
    <tr><th>Command</th><th>Tier</th><th>What It Does</th></tr>
    <tr><td><code>/seo google check</code></td><td>any</td><td>Show credential tier and available APIs</td></tr>
    <tr><td><code>/seo google psi &lt;url&gt;</code></td><td>0</td><td>PageSpeed Insights (mobile + desktop)</td></tr>
    <tr><td><code>/seo google crux &lt;url&gt;</code></td><td>0</td><td>CrUX field data (28-day p75)</td></tr>
    <tr><td><code>/seo google history &lt;url&gt;</code></td><td>0</td><td>CrUX 25-week trend analysis</td></tr>
    <tr><td><code>/seo google gsc</code></td><td>1</td><td>Top queries and pages (28 days)</td></tr>
    <tr><td><code>/seo google inspect &lt;url&gt;</code></td><td>1</td><td>URL Inspection (index status, crawl)</td></tr>
    <tr><td><code>/seo google sitemaps</code></td><td>1</td><td>Sitemap status in Search Console</td></tr>
    <tr><td><code>/seo google index &lt;url&gt;</code></td><td>1</td><td>Submit URL to Indexing API</td></tr>
    <tr><td><code>/seo google ga4 traffic</code></td><td>2</td><td>Organic sessions, users, engagement</td></tr>
    <tr><td><code>/seo google ga4 top-pages</code></td><td>2</td><td>Top organic landing pages</td></tr>
    <tr><td><code>/seo google report [type]</code></td><td>0+</td><td>Generate PDF report (cwv-audit, gsc-performance, full)</td></tr>
</table>

<!-- PAGE 7: RATE LIMITS -->
<h2>Rate Limits</h2>

<table>
    <tr><th>API</th><th>Free Quota</th><th>Shared?</th></tr>
    <tr><td>PageSpeed Insights</td><td>240/min, 25,000/day</td><td>No</td></tr>
    <tr><td>CrUX + CrUX History</td><td>150/min combined</td><td>Yes</td></tr>
    <tr><td>Search Console</td><td>1,200/min</td><td>No</td></tr>
    <tr><td>URL Inspection</td><td>600/day, 2,000/day per property</td><td>No</td></tr>
    <tr><td>Indexing API</td><td>200/day</td><td>No</td></tr>
    <tr><td>GA4 Data API</td><td>10,000 tokens/day/property</td><td>No</td></tr>
</table>

<div class="tip">
    <strong>All free.</strong> No billing required for any of these APIs at the listed quotas.
</div>

<!-- PAGE 8: TROUBLESHOOTING -->
<h2>Troubleshooting</h2>

<table>
    <tr><th>Error</th><th>Fix</th></tr>
    <tr><td><code>403 Forbidden</code> on GSC</td><td>Add your OAuth email as a user in Search Console (<strong>Settings &gt; Users</strong>)</td></tr>
    <tr><td><code>404</code> on CrUX</td><td>Site has insufficient Chrome traffic. Use PSI lab data instead.</td></tr>
    <tr><td><code>401 Unauthorized</code></td><td>Token expired. Re-run: <code>python scripts/google_auth.py --auth --creds ...</code></td></tr>
    <tr><td><code>429 Rate Limit</code></td><td>Wait 60 seconds. CrUX and History share a 150/min limit.</td></tr>
    <tr><td>GA4 returns empty</td><td>Check <code>ga4_property_id</code> format: must be <code>properties/123456789</code></td></tr>
    <tr><td>Indexing API rejected</td><td>Only works for pages with JobPosting or BroadcastEvent schema.</td></tr>
</table>

<h3>Full Config File Reference</h3>
<pre>~/.config/claude-seo/google-api.json
{
  "api_key": "AIzaSy...",
  "oauth_client_path": "/path/to/client_secret.json",
  "default_property": "sc-domain:example.com",
  "ga4_property_id": "properties/123456789",
  "service_account_path": "/path/to/sa.json"
}</pre>

<div class="page-footer">
    Claude SEO v1.7.0 &middot; github.com/AgriciDaniel/claude-seo &middot; MIT License
</div>

</body>
</html>"""


def main():
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    pdf_path = os.path.join(output_dir, "Google-API-Setup-Guide-claude-seo.pdf")
    html_path = os.path.join(output_dir, "Google-API-Setup-Guide-claude-seo.html")

    # Save HTML
    with open(html_path, "w") as f:
        f.write(HTML_CONTENT)
    print(f"HTML saved: {html_path}")

    # Generate PDF
    try:
        HTML(string=HTML_CONTENT).write_pdf(pdf_path)
        print(f"PDF saved: {pdf_path}")
    except Exception as e:
        print(f"PDF generation failed: {e}", file=sys.stderr)
        print("HTML file is still available.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
