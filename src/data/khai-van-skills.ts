export type SlotOption = {
  id: string;
  label: string;
  hint?: string;
};

export type Slot = {
  key: string;
  title: string;
  description: string;
  kind: "text" | "choice" | "multi";
  options?: SlotOption[];
  required?: boolean;
};

/**
 * A "khai vấn" (discovery interview) skill.
 *
 * Role in the pipeline:
 *   1. The Coach Agent loads a KhaiVanSkill and conducts a conversation with the user,
 *      asking questions until every slot is filled.
 *   2. The captured answers are rendered through `reportTemplate` to produce a human-readable
 *      Report the user can preview/approve/edit.
 *   3. Once the Report is confirmed, it is passed to the Skill Forge Agent along with the
 *      chosen SkillTemplate to produce the final personalized skill.
 *
 * A single KhaiVanSkill can be attached to many SkillTemplates — e.g. all templates that need
 * "brand voice" context share the same brand khai-van-skill. Reports are keyed by KhaiVanSkill id,
 * so when a user buys a template that reuses a khai-van-skill they've already completed, their
 * existing report can be reused (no re-interview).
 */
export type KhaiVanSkill = {
  id: string;
  name: string;
  description: string;
  coachPersona: string;
  mission: string;
  slots: Slot[];
  reportTemplate: string;
};

const commonSlots: Slot[] = [
  {
    key: "tone",
    title: "Preferred tone",
    description: "How should the skill sound when it writes or speaks to colleagues?",
    kind: "choice",
    required: true,
    options: [
      { id: "neutral", label: "Neutral & professional" },
      { id: "warm", label: "Warm & conversational" },
      { id: "direct", label: "Direct & concise" },
      { id: "playful", label: "Playful & informal" },
    ],
  },
  {
    key: "approval",
    title: "Approval model",
    description: "When should the skill act autonomously vs. wait for a human?",
    kind: "choice",
    required: true,
    options: [
      { id: "auto", label: "Act autonomously, summarize after" },
      { id: "confirm", label: "Confirm before external actions" },
      { id: "review", label: "Draft only, a human reviews everything" },
    ],
  },
];

export const khaiVanSkills: Record<string, KhaiVanSkill> = {
  "sales-ops-discovery": {
    id: "sales-ops-discovery",
    name: "Sales Ops Discovery",
    description:
      "Captures the context needed to configure any revenue-operations skill: CRM of record, ICP, pipeline stages, active sales motions, plus team tone and approval posture.",
    coachPersona: "a sharp revenue-operations partner",
    mission:
      "Configure a Sales Operations skill that audits CRM hygiene, drafts outreach, and prepares forecast notes.",
    slots: [
      {
        key: "crm",
        title: "CRM system",
        description: "Which CRM is the source of truth?",
        kind: "choice",
        required: true,
        options: [
          { id: "salesforce", label: "Salesforce" },
          { id: "hubspot", label: "HubSpot" },
          { id: "pipedrive", label: "Pipedrive" },
          { id: "attio", label: "Attio" },
          { id: "other", label: "Something else" },
        ],
      },
      {
        key: "icp",
        title: "Ideal customer profile",
        description:
          "Describe your ICP in one or two sentences — segments, company size, titles that matter.",
        kind: "text",
        required: true,
      },
      {
        key: "stages",
        title: "Pipeline stages",
        description:
          "List the deal stages you use (comma-separated) so the skill can audit against them.",
        kind: "text",
        required: true,
      },
      {
        key: "motions",
        title: "Sales motions you run",
        description: "Pick everything that applies.",
        kind: "multi",
        required: true,
        options: [
          { id: "outbound", label: "Outbound prospecting" },
          { id: "inbound", label: "Inbound SDR triage" },
          { id: "plg", label: "Product-led follow-ups" },
          { id: "partner", label: "Partner / channel" },
          { id: "renewals", label: "Renewals & expansion" },
        ],
      },
      ...commonSlots,
    ],
    reportTemplate: `# Sales Operations — Discovery Report

**CRM of record:** {{crmLabel}}

**Ideal customer profile**
{{icp}}

**Pipeline stages**
{{stagesList}}

**Active sales motions**
{{motionsList}}

**Preferred tone:** {{toneLabel}}

**Approval model:** {{approvalLabel}}
`,
  },

  "marketing-brief-discovery": {
    id: "marketing-brief-discovery",
    name: "Marketing Brief Discovery",
    description:
      "Captures brand positioning, primary audiences, brief formats in use, and the KPI tree the team holds marketing to.",
    coachPersona: "a seasoned marketing strategist",
    mission:
      "Configure a Marketing Briefs skill that turns research, interviews, and analytics into structured briefs on-brand.",
    slots: [
      {
        key: "brand",
        title: "Brand name & positioning",
        description:
          "What's the brand, and what's the one-line positioning you want the skill to internalize?",
        kind: "text",
        required: true,
      },
      {
        key: "audiences",
        title: "Primary audiences",
        description: "List the 1–3 audiences most briefs target.",
        kind: "text",
        required: true,
      },
      {
        key: "briefTypes",
        title: "Brief formats you need",
        description: "Pick the formats the skill should be fluent in.",
        kind: "multi",
        required: true,
        options: [
          { id: "campaign", label: "Campaign brief" },
          { id: "creative", label: "Creative brief" },
          { id: "product-launch", label: "Product launch brief" },
          { id: "content", label: "Content brief" },
          { id: "research", label: "Research synthesis" },
        ],
      },
      {
        key: "kpi",
        title: "KPI tree",
        description:
          "What metrics do briefs need to ladder up to? (e.g., MQLs, pipeline influenced, NRR)",
        kind: "text",
        required: true,
      },
      ...commonSlots,
    ],
    reportTemplate: `# Marketing Briefs — Discovery Report

**Brand & positioning**
{{brand}}

**Primary audiences**
{{audiences}}

**Brief formats in scope**
{{briefTypesList}}

**KPI tree**
{{kpi}}

**Preferred tone:** {{toneLabel}}

**Approval model:** {{approvalLabel}}
`,
  },

  "content-studio-discovery": {
    id: "content-studio-discovery",
    name: "Content Studio Discovery",
    description:
      "Captures the house voice / style guide, formats in scope, source-of-truth systems, and the editorial workflow a content skill must respect.",
    coachPersona: "an editor-in-chief with ghost-writing chops",
    mission:
      "Configure a Content Studio skill that plans, drafts, and edits across blog, docs, and social in your voice.",
    slots: [
      {
        key: "styleGuide",
        title: "Style guide / voice",
        description:
          "Describe your house voice, any taboo phrases, and whether you have a published style guide (link or key rules).",
        kind: "text",
        required: true,
      },
      {
        key: "formats",
        title: "Formats in scope",
        description: "Pick the formats the skill should plan and draft.",
        kind: "multi",
        required: true,
        options: [
          { id: "blog", label: "Long-form blog" },
          { id: "docs", label: "Product docs" },
          { id: "social", label: "Social posts (LinkedIn/X)" },
          { id: "newsletter", label: "Newsletter" },
          { id: "changelog", label: "Changelog / release notes" },
        ],
      },
      {
        key: "sources",
        title: "Source-of-truth systems",
        description:
          "Where should the skill look for product, customer, or research context? (Notion, Google Drive, Confluence, etc.)",
        kind: "text",
        required: true,
      },
      {
        key: "workflow",
        title: "Editorial workflow",
        description: "Briefly describe how a piece moves from draft to publish in your team.",
        kind: "text",
        required: true,
      },
      ...commonSlots,
    ],
    reportTemplate: `# Content Studio — Discovery Report

**Voice & style guide**
{{styleGuide}}

**Formats in scope**
{{formatsList}}

**Source-of-truth systems**
{{sources}}

**Editorial workflow**
{{workflow}}

**Preferred tone:** {{toneLabel}}

**Approval model:** {{approvalLabel}}
`,
  },

  "google-ops-discovery": {
    id: "google-ops-discovery",
    name: "Google Workspace Ops Discovery",
    description:
      "Captures which Google surfaces are in scope, the recurring routines the skill should own, and the permissions posture the team tolerates.",
    coachPersona: "an operations engineer fluent in Google Workspace",
    mission:
      "Configure a Google Workspace Automations skill that files documents, summarizes threads, and produces recurring reports.",
    slots: [
      {
        key: "surfaces",
        title: "Google surfaces in scope",
        description: "Pick the surfaces the skill should drive.",
        kind: "multi",
        required: true,
        options: [
          { id: "drive", label: "Drive / Docs" },
          { id: "sheets", label: "Sheets" },
          { id: "gmail", label: "Gmail" },
          { id: "calendar", label: "Calendar" },
          { id: "forms", label: "Forms" },
        ],
      },
      {
        key: "routines",
        title: "Recurring routines",
        description:
          "List 2–4 recurring tasks the skill should handle (e.g., weekly revenue report, filing contracts by customer).",
        kind: "text",
        required: true,
      },
      {
        key: "permissions",
        title: "Permissions posture",
        description: "How conservative should the skill be with sharing/permissions?",
        kind: "choice",
        required: true,
        options: [
          { id: "strict", label: "Strict — never change sharing settings" },
          { id: "domain", label: "Domain-only sharing allowed" },
          { id: "flexible", label: "Flexible, but audit-logged" },
        ],
      },
      ...commonSlots,
    ],
    reportTemplate: `# Google Workspace Ops — Discovery Report

**Surfaces in scope**
{{surfacesList}}

**Recurring routines**
{{routines}}

**Permissions posture:** {{permissionsLabel}}

**Preferred tone:** {{toneLabel}}

**Approval model:** {{approvalLabel}}
`,
  },

  "people-ops-discovery": {
    id: "people-ops-discovery",
    name: "People Ops Discovery",
    description:
      "Captures company size, where policies live, which People-Ops responsibilities are in scope, and the confidentiality posture the skill must hold.",
    coachPersona: "a thoughtful people-operations partner",
    mission:
      "Configure a People Ops skill that handles onboarding, policy Q&A, and review prep with the right confidentiality posture.",
    slots: [
      {
        key: "headcount",
        title: "Company size",
        description: "Roughly how many employees will this serve?",
        kind: "choice",
        required: true,
        options: [
          { id: "small", label: "Under 50" },
          { id: "mid", label: "50–250" },
          { id: "large", label: "250–1000" },
          { id: "enterprise", label: "1000+" },
        ],
      },
      {
        key: "policyHome",
        title: "Where policies live",
        description:
          "Where should the skill look up policies? (Notion, Confluence, Rippling, Drive, etc.)",
        kind: "text",
        required: true,
      },
      {
        key: "scope",
        title: "In-scope responsibilities",
        description: "Pick the areas the skill should handle.",
        kind: "multi",
        required: true,
        options: [
          { id: "onboarding", label: "Onboarding checklists" },
          { id: "policyQa", label: "Policy Q&A" },
          { id: "reviews", label: "Performance review prep" },
          { id: "leave", label: "Leave & time-off" },
          { id: "offboarding", label: "Offboarding" },
        ],
      },
      {
        key: "confidentiality",
        title: "Confidentiality posture",
        description: "How strict should the skill be about redaction and access?",
        kind: "choice",
        required: true,
        options: [
          { id: "strict", label: "Strict — redact names by default" },
          { id: "standard", label: "Standard — team-level context OK" },
          { id: "open", label: "Open — internal use, minimal redaction" },
        ],
      },
      ...commonSlots,
    ],
    reportTemplate: `# People Operations — Discovery Report

**Company size:** {{headcountLabel}}

**Where policies live**
{{policyHome}}

**Responsibilities in scope**
{{scopeList}}

**Confidentiality posture:** {{confidentialityLabel}}

**Preferred tone:** {{toneLabel}}

**Approval model:** {{approvalLabel}}
`,
  },
};

export function getKhaiVanSkill(id: string): KhaiVanSkill | null {
  return khaiVanSkills[id] ?? null;
}

export function listKhaiVanSkills(): KhaiVanSkill[] {
  return Object.values(khaiVanSkills);
}
