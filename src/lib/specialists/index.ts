/**
 * Specialist barrel — importing this module registers every specialist in
 * the registry. API routes import this once before reading the registry.
 *
 * The orchestrator (`full-site-audit`) imports LAST because it delegates to
 * other specialists and they must be registered before it runs.
 */
import "server-only";

// v0.1 — original 6
import "./technical-auditor";
import "./content-strategist";
import "./schema-validator";
import "./keyword-researcher";
import "./beast-planner";
import "./brand-strategist";

// v0.1.7 phase 1 — pure-LLM specialists
import "./sitemap-architect";
import "./hreflang-auditor";
import "./page-analyzer";
import "./flow-framework";
import "./programmatic-strategist";

// v0.1.7 phase 2 — DataForSEO-backed specialists
import "./topic-clusterer";
import "./content-brief-generator";
import "./competitor-pages";
import "./ecommerce-analyst";
import "./geo-specialist";
import "./local-seo";
import "./maps-intelligence";
import "./sxo-analyst";

// v0.1.7 phase 3 — multi-source / standalone
import "./backlink-analyst";
import "./image-auditor";
import "./drift-monitor";
import "./technical-deep-auditor";

// v0.1.7 phase 4 — heavy / orchestrator
import "./image-generator";
import "./google-suite";

// v0.1.8 — gcloud-ADC OAuth specialists
import "./google-search-console";
import "./google-analytics";

// v0.1.9 — Deep Brain phase checkpoints
import "./phase-gate";

// v0.1.9 — vault health: lints schema drift, dead wikilinks, manifest drift
import "./vault-linter";
// v0.1.10 — vault snapshots for safe rollback before destructive ops
import "./vault-archiver";

// Secretary's semantic double-check — verification pass over the built brain
import "./brain-reviewer";

import "./full-site-audit";

export { listSpecialists, getSpecialist } from "@/lib/orchestrator/registry";
