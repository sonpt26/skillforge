import type { Slot } from "../data/khai-van-skills";

/**
 * Shared template-interpolation helpers used by both the Report renderer
 * (`renderReport`) and Skill Forge (`forgeSkill`). The same profile → context
 * mapping has to drive both artifacts so that placeholders like `{{crmLabel}}`
 * mean the same thing in the Report the user reviews and the SKILL.md that
 * Skill Forge produces.
 */

const APPROVAL_BLOCKS: Record<string, string> = {
  auto:
    "Act autonomously on routine, low-risk tasks. Summarize what you did at the end of every work session.",
  confirm:
    "Before any action that leaves the team's systems (sending email, writing to a system of record, calling an external API), confirm intent with the user and wait for explicit approval.",
  review:
    "Produce drafts only. A human reviews every output before anything ships. Do not auto-execute tasks.",
};

const PERMISSIONS_BLOCKS: Record<string, string> = {
  strict:
    "Never modify sharing or ACL settings. If a task requires a permission change, surface the request and wait for a human to perform it.",
  domain:
    "Domain-only sharing is acceptable. Do not grant access outside the primary Google Workspace domain.",
  flexible:
    "Permission changes are allowed, but every action must be logged in the team's shared audit document with a timestamp and reason.",
};

const CONFIDENTIALITY_BLOCKS: Record<string, string> = {
  strict:
    "Redact names and identifying details by default. Use role descriptors (\"a senior engineer\", \"a new hire\") unless the user explicitly authorizes naming an individual.",
  standard:
    "Team-level context is acceptable. Avoid referencing individual employees by name in group summaries unless the context warrants it.",
  open:
    "Internal-only context may reference individuals and teams by name. Do not apply proactive redaction unless the user asks.",
};

const APPROVAL_LABELS: Record<string, string> = {
  auto: "Act autonomously, summarize after",
  confirm: "Confirm before external actions",
  review: "Draft only, a human reviews everything",
};

function labelFor(slot: Slot, id: unknown): string {
  if (typeof id !== "string") return String(id ?? "");
  return slot.options?.find((o) => o.id === id)?.label ?? id;
}

function listOf(items: string[]): string {
  if (items.length === 0) return "(none provided)";
  return items.map((i) => `- ${i}`).join("\n");
}

export function buildContext(
  slots: Slot[],
  profile: Record<string, unknown>,
): Record<string, string> {
  const ctx: Record<string, string> = {};

  for (const slot of slots) {
    const raw = profile[slot.key];

    if (slot.kind === "text") {
      ctx[slot.key] = typeof raw === "string" ? raw : "(not provided)";
      ctx[`${slot.key}Label`] = ctx[slot.key];
      continue;
    }

    if (slot.kind === "choice") {
      const label = labelFor(slot, raw);
      ctx[slot.key] = typeof raw === "string" ? raw : "";
      ctx[`${slot.key}Label`] = label;
      continue;
    }

    if (slot.kind === "multi") {
      const ids = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string")
        : [];
      const labels = ids.map((id) => labelFor(slot, id));
      ctx[slot.key] = ids.join(",");
      ctx[`${slot.key}Labels`] = labels.join(", ");
      ctx[`${slot.key}List`] = listOf(labels);
    }
  }

  const approval = typeof profile.approval === "string" ? profile.approval : "confirm";
  ctx.approvalBlock = APPROVAL_BLOCKS[approval] ?? APPROVAL_BLOCKS.confirm;
  ctx.approvalLabel = APPROVAL_LABELS[approval] ?? APPROVAL_LABELS.confirm;

  if (typeof profile.permissions === "string") {
    ctx.permissionsBlock =
      PERMISSIONS_BLOCKS[profile.permissions] ?? PERMISSIONS_BLOCKS.strict;
  }
  if (typeof profile.confidentiality === "string") {
    ctx.confidentialityBlock =
      CONFIDENTIALITY_BLOCKS[profile.confidentiality] ?? CONFIDENTIALITY_BLOCKS.standard;
  }

  if (typeof profile.stages === "string") {
    const stages = profile.stages
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    ctx.stagesList = listOf(stages);
  }

  return ctx;
}

export function render(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(ctx, key) ? ctx[key] : match,
  );
}
