/**
 * Orchestrator tool definitions.
 *
 * The Orchestrator no longer announces dispatch intent by emitting a
 * `[PROPOSED ACTION: run-<id>]` text shim — it calls the `assign_task`
 * tool, which the chat route handler intercepts to create an Assignment
 * (see `src/lib/orchestrator/assignment.ts`) and enqueue the corresponding
 * job.
 *
 * Native tool-use is only honoured by the `anthropic-api` provider today;
 * subscription CLI providers ignore tools and continue to communicate via
 * plain text. For those providers the chat route falls back to its legacy
 * text parser.
 */
import "server-only";

import type { LLMTool } from "@/lib/integrations/providers/types";
import { SPECIALISTS } from "@/lib/specialists/catalog";
import { TEMPLATE_IDS } from "@/lib/orchestrator/task-templates";

/** Canonical list of valid specialist ids, sourced from the catalog. */
const SPECIALIST_IDS = SPECIALISTS.map((s) => s.id);

export const ASSIGN_TASK_TOOL_NAME = "assign_task";
export const PLAN_TREE_TOOL_NAME = "plan_tree";

/**
 * The Orchestrator dispatches work by calling this tool. Inputs match
 * `CreateAssignmentInputZ` from `assignment.ts` minus `client_slug` and
 * `request_id`, both of which the server fills in.
 */
export const assignTaskTool: LLMTool = {
  name: ASSIGN_TASK_TOOL_NAME,
  description:
    "Dispatch one SEO specialist to perform a task. The specialist will run " +
    "asynchronously and stream progress to the UI. Use this when the user's " +
    "intent maps cleanly onto a known specialist's capability — never invent " +
    "a specialist id; always pick from the enum. For ambiguous requests, ask " +
    "the user a clarifying question instead of guessing.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      specialist_id: {
        type: "string",
        enum: SPECIALIST_IDS,
        description:
          "The exact id of the specialist to dispatch. Must be one of the " +
          "registered values.",
      },
      title: {
        type: "string",
        maxLength: 120,
        description:
          "One-line title for this assignment. Becomes the inbox row label " +
          "(e.g. \"Audit example.com for technical SEO\"). Concrete > abstract.",
      },
      brief: {
        type: "string",
        maxLength: 4000,
        description:
          "Why you picked this specialist for this task, what you expect them " +
          "to deliver, and any constraints the user mentioned. The specialist " +
          "reads this as their assignment prompt. Be specific — cite hot.md " +
          "or audit findings when relevant.",
      },
      payload: {
        type: "object",
        description:
          "Structured input for the specialist's `execute()` function. Shape " +
          "varies per specialist; leave as `{}` if unsure and the specialist " +
          "will use its defaults.",
      },
      permission_mode: {
        type: "string",
        enum: ["plan", "read_only", "auto", "full_access"],
        description:
          "How autonomously the specialist may operate. Match this to the " +
          "conversation's current permission mode unless the user explicitly " +
          "asks for an override.",
      },
      force: {
        type: "boolean",
        description:
          "Set true ONLY when the user explicitly wants a fresh re-run of a " +
          "specialist that already has a current artifact (e.g. 'force a " +
          "re-run', 'refresh the audit', 'redo it anyway'). Leave unset/false " +
          "normally — the server skips specialists whose work is already " +
          "current and tells the user so.",
      },
    },
    required: ["specialist_id", "title", "brief", "permission_mode"],
  },
};

/**
 * `plan_tree` — multi-agent fan-out. Use when the user's intent maps onto
 * a wide audit / sweep / deep-dive and a single specialist call would
 * understate the work. The model picks a canned template id OR supplies
 * an inline list of child specialists; the server materialises the Task
 * tree and the existing parallel runner dispatches every unblocked leaf
 * concurrently.
 */
export const planTreeTool: LLMTool = {
  name: PLAN_TREE_TOOL_NAME,
  description:
    "Plan and dispatch a MULTI-SPECIALIST fan-out. Prefer this over `assign_task` " +
    "when the user asks for a broad audit, sweep, deep dive, or otherwise " +
    "multi-faceted review (e.g. 'do a full site audit', 'review keyword opportunity " +
    "end to end', 'sweep the compliance signals'). " +
    "Pick a `template_id` from the enum, OR supply an inline `children` array of " +
    "specialist leaves with optional dependency edges between them. " +
    "Never invent specialist ids — pick from the registered list. " +
    "Do NOT call this for single-specialist work — use `assign_task` instead.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      template_id: {
        type: "string",
        enum: TEMPLATE_IDS,
        description:
          "The canned template to dispatch. Mutually exclusive with `children`.",
      },
      root_title: {
        type: "string",
        maxLength: 160,
        description:
          "Title shown on the root Task in the vault plan note. Override the " +
          "template default when the user used a more specific phrasing.",
      },
      root_goal: {
        type: "string",
        maxLength: 4000,
        description:
          "Free-form goal for the root Task. Reads in the vault plan note.",
      },
      children: {
        type: "array",
        minItems: 2,
        maxItems: 16,
        description:
          "Inline alternative to `template_id`. Each entry is one specialist leaf.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            specialist_id: {
              type: "string",
              enum: SPECIALIST_IDS,
              description: "Real specialist id from the registry.",
            },
            title: {
              type: "string",
              maxLength: 160,
              description: "Inbox-visible title for this leaf.",
            },
            goal: {
              type: "string",
              maxLength: 4000,
              description: "Brief the specialist reads as its prompt.",
            },
            payload: {
              type: "object",
              description: "Structured input for the specialist; `{}` is fine.",
            },
            blocked_on_indices: {
              type: "array",
              items: { type: "integer", minimum: 0 },
              description:
                "Indices into this same `children` array whose Tasks must " +
                "reach a terminal status before this leaf can dispatch. " +
                "Use sparingly — most fan-outs should be fully parallel.",
            },
          },
          required: ["specialist_id", "title", "goal"],
        },
      },
      permission_mode: {
        type: "string",
        enum: ["plan", "read_only", "auto", "full_access"],
        description:
          "Permission mode applied to every leaf. Match the active " +
          "conversation mode unless the user asked for an override.",
      },
      force: {
        type: "boolean",
        description:
          "Set true ONLY when the user explicitly asks to rebuild from " +
          "scratch / re-run everything (e.g. 'rebuild the brain', 'force a " +
          "full refresh'). Leave unset/false normally — the sweep skips " +
          "children whose artifacts are already current and runs only what " +
          "is stale or missing.",
      },
    },
    required: ["permission_mode"],
  },
};

/** The Orchestrator's tool roster. Kept as a list so we can grow it later. */
export const ORCHESTRATOR_TOOLS: LLMTool[] = [assignTaskTool, planTreeTool];
