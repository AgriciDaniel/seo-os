# Current Search Requirements Memo

Reviewed: 2026-05-11

Scope: Google Search, AI Overviews/AI Mode, Search Console measurement,
generative AI content guidance, spam policy risk, DataForSEO ranked keywords,
and Obsidian properties/Bases assumptions used by Marketing Brain v0.1.5.

## Release Positioning

Marketing Brain must not claim guaranteed rankings, guaranteed recovery,
guaranteed traffic, or guaranteed AI Overview inclusion. The correct claim is
that the brain improves evidence quality, source hygiene, technical readiness,
content planning, and execution governance.

## Google AI Features

Official source: https://developers.google.com/search/docs/appearance/ai-features?hl=en

Release-relevant requirements:

- Google states that standard SEO best practices remain relevant for AI
  Overviews and AI Mode.
- Pages need to be indexed and eligible to appear in Google Search with a
  snippet to be eligible as supporting links.
- Google says there are no additional AI-feature-specific technical
  requirements.
- Google says no special schema.org markup, AI text file, or machine-readable
  file is required for AI features.
- AI Overview and AI Mode traffic is included in overall Search Console Web
  performance data rather than exposed as a separate Marketing Brain KPI.

Marketing Brain implication: use AI/AIO language around eligibility, source
quality, query coverage, and measurement discipline. Do not present a separate
guaranteed AIO ranking workflow.

## Generative AI Content

Official source: https://developers.google.com/search/docs/fundamentals/using-gen-ai-content?hl=en

Release-relevant requirements:

- Generative AI can support research and structure.
- Scaled generated pages that do not add value can violate spam policies.
- Content should focus on accuracy, quality, relevance, and user value.
- Metadata, structured data, and alt text created with automation still need
  normal quality and policy compliance.

Marketing Brain implication: page briefs can use AI assistance, but the vault
must require real evidence, source review, owner approval, and quality checks
before publication.

## Spam Policy

Official source: https://developers.google.com/search/docs/essentials/spam-policies?hl=en

Release-relevant risks:

- Scaled content abuse, deceptive behavior, link schemes, and low-value
  automation are release-critical risks.
- The brain must reject link buying, PBNs, incentivized review wording, cloaked
  content, doorway pages, and mass AI pages without added value.

Marketing Brain implication: strategy notes must include risk, confidence,
owner, approval status, and rollback fields before implementation.

## DataForSEO Ranked Keywords

Official source: https://docs.dataforseo.com/v3/dataforseo_labs-google-ranked_keywords-live/

Release-relevant assumptions:

- The endpoint is `POST /v3/dataforseo_labs/google/ranked_keywords/live`.
- It returns keywords a domain or webpage ranks for, with SERP elements,
  monthly searches, and other keyword data.
- Data is updated weekly according to DataForSEO docs.
- Requests are paid and should remain behind hard cost caps and dry-run previews.

Marketing Brain implication: raw API responses remain immutable under `.raw/`,
source notes must cite the raw file, and release tests should include
deterministic fixtures so buyer demos do not require live paid calls.

## Obsidian Properties And Bases

Official sources:

- https://help.obsidian.md/properties
- https://help.obsidian.md/bases

Release-relevant assumptions:

- Obsidian properties are stored as YAML frontmatter at the top of Markdown
  notes.
- Properties should stay flat and machine-readable.
- Bases use local Markdown files and their properties as the data source.

Marketing Brain implication: `brain_schema`, source IDs, confidence, owner,
approval, risk, and freshness fields belong in flat YAML frontmatter. Bases
should read those fields rather than nested structures.

## Release Gate

This memo should be refreshed before every paid release. If official docs
change, update README, SKILL, report language, and vault notes before tagging.
