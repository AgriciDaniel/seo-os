# Vault data contract (read-only memo for FilesApp implementation)

## GET /api/brain?clientSlug=…

Returns: { notes: BrainNote[], summary: {...}, reviewQueue: BrainNote[] }

BrainNote shape (from BrainNoteSchema in src/lib/brain/types.ts):
- path: string (relative to vault root)
- type: 'audit' | 'decision' | 'deliverable' | 'keyword-strategy' | …
- title: string
- approval_status: 'approved' | 'needs-review' | 'rejected' | undefined
- risk_level: 'low' | 'medium' | 'high' | undefined
- confidence: number (0-1) | undefined
- created, updated: ISO timestamps
- owner: string | undefined

## What FilesApp reuses
- The full `notes` array.

## What FilesApp discards (deliberate friction removal)
- `response.reviewQueue` — segregated queue is the noise we're killing.
- `response.summary.pending`, `summary.highRiskReview` — header counters retired.

## Folder grouping rule
FilesApp derives folders from `note.path` prefix segments:
- "audits/2026-05-12-audit.md"     → folder "audits" / file "2026-05-12-audit.md"
- "sources/dataforseo/2026-05.json" → folder "sources" / folder "dataforseo" / file …
- "hot.md", "log.md", "index.md"    → root files

Folders sorted alphabetically; files sorted by path.
