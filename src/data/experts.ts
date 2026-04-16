export type ExpertReview = {
  quote: string;
  name: string;
  role: string;
};

export type ExpertStats = {
  usersHelped: number;
  downloads: number;
  avgRating: number;
  reviewCount: number;
};

export type Expert = {
  id: string;
  name: string;
  title: string;
  yearsExperience: number;
  credentials: string[];
  portraitUrl: string;
  heroPortraitUrl?: string;
  bio: string;
  approach?: string;
  specialties?: string[];
  notableClients?: string[];
  stats: ExpertStats;
  reviews: ExpertReview[];
};

export const experts: Expert[] = [
  {
    id: "hannah-reiter",
    name: "Hannah Reiter",
    title: "Head of RevOps · ex-Gong, ex-Salesforce",
    yearsExperience: 12,
    credentials: [
      "Scaled RevOps from $5M → $120M ARR at two B2B SaaS companies",
      "Built the forecasting playbook now used by 30+ Series B sales teams",
      "Former Sales Strategy lead at Salesforce (Enterprise segment)",
      "Regular speaker at SaaStr, Pavilion, and RevOps Co-op",
    ],
    portraitUrl: "https://randomuser.me/api/portraits/women/44.jpg",
    heroPortraitUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1600&q=80",
    bio: "Hannah has spent the last decade building revenue operations from the ground up at B2B software companies. She joined Gong as employee #40 and helped scale their RevOps function through the Series C and D. Before that she owned Enterprise sales strategy at Salesforce. She's been in the weeds of stage definitions, forecast calls, and outbound sequencing — and brings that lived detail to every skill she designs.",
    approach:
      "Hannah treats the CRM as the team's source of truth, not a CRM manager's toy. Every playbook she ships makes reps faster, not busier — and gives sales leaders a forecast they can actually defend to their board.",
    specialties: [
      "Pipeline hygiene & stage discipline",
      "Forecast narrative & board prep",
      "Outbound sequencing (ICP-led)",
      "Deal desk & approval workflows",
      "Renewals & expansion motions",
      "SDR → AE handoff choreography",
    ],
    notableClients: [
      "Gong (Series A → D)",
      "Salesforce Enterprise",
      "Clari",
      "Outreach",
    ],
    stats: {
      usersHelped: 1240,
      downloads: 3810,
      avgRating: 4.9,
      reviewCount: 318,
    },
    reviews: [
      {
        quote:
          "The forecast-prep flow alone paid for the skill in our first board meeting. Our CRO actually reads the notes now.",
        name: "Chloé Bernard",
        role: "VP Sales, growth-stage SaaS",
      },
      {
        quote:
          "Finally a RevOps playbook that's been through the fire. I stopped reinventing stage definitions every quarter.",
        name: "Marcus Delaney",
        role: "RevOps Manager, Series B startup",
      },
      {
        quote:
          "Hannah's skill caught three stalled enterprise deals our reps had written off. We closed two of them that quarter.",
        name: "Priya Ramaswamy",
        role: "CRO, cybersecurity startup",
      },
      {
        quote:
          "The CRM audit doesn't just flag bad hygiene — it rewrites the fix in the rep's voice. Our AEs stopped ignoring it.",
        name: "Liam O'Sullivan",
        role: "Director of Sales Ops, fintech",
      },
      {
        quote:
          "Every RevOps tool we've tried was either rigid or useless. This was the first one that felt like Hannah herself was in the Slack.",
        name: "Dr. Yuki Takahashi",
        role: "VP Revenue, developer-tools scale-up",
      },
    ],
  },
  {
    id: "tomas-alvarez",
    name: "Tomás Alvarez",
    title: "Former VP Marketing · Series A → IPO at two B2B SaaS companies",
    yearsExperience: 15,
    credentials: [
      "Authored the brief framework adopted across 200+ campaigns",
      "Mentor at Reforge for the Brand Strategy program",
      "Led marketing through two successful IPOs (2019, 2022)",
      "Launched 12 category-defining products, 4 reached unicorn status",
    ],
    portraitUrl: "https://randomuser.me/api/portraits/men/52.jpg",
    heroPortraitUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1600&q=80",
    bio: "Tomás has sat in every marketing seat, from demand gen IC to VP Marketing through two IPOs. His frameworks shaped how Gartner-quadrant brands like Clari and Lattice talk about themselves. He's been on the receiving end of bad briefs from every side of the business — and he designs for the CMO who has been, too.",
    approach:
      "Every brief is a contract between marketing and the rest of the business. Tomás' discipline: no brief ships without a measurable success metric, a named audience, and a link to a KPI the CFO actually tracks.",
    specialties: [
      "Campaign & creative briefs",
      "Positioning & messaging hierarchies",
      "Research synthesis (interviews, analytics, CI)",
      "KPI trees & attribution modeling",
      "Brand voice & editorial review",
      "Product launch strategy",
    ],
    notableClients: [
      "Lattice",
      "Clari",
      "Ramp",
      "Notion",
    ],
    stats: {
      usersHelped: 960,
      downloads: 2410,
      avgRating: 4.8,
      reviewCount: 240,
    },
    reviews: [
      {
        quote:
          "Cut our brief cycle from a week to an afternoon, and the outputs are sharper than what I used to write by hand.",
        name: "Sana Iqbal",
        role: "Director of Marketing, B2B SaaS",
      },
      {
        quote:
          "Tomás clearly designed this for a CMO who has been burned by vague briefs. You can feel it in every section.",
        name: "Greta Halvorsen",
        role: "Head of Brand, fintech",
      },
      {
        quote:
          "My junior PMMs now ship briefs that read like they have five years of experience. That's a hiring multiplier.",
        name: "Jordan Mbeki",
        role: "CMO, vertical SaaS",
      },
      {
        quote:
          "The KPI tree discipline alone killed three half-baked campaigns before we wasted budget on them.",
        name: "Rina Sato",
        role: "Head of Demand Gen, cybersecurity",
      },
    ],
  },
  {
    id: "noa-feldstein",
    name: "Noa Feldstein",
    title: "Former Editor-in-Chief · published 1,200+ pieces",
    yearsExperience: 14,
    credentials: [
      "Built editorial systems at three venture-backed media programs",
      "Advisor on style guides for Notion, Linear, and a16z Future",
      "Longlisted twice for the Loeb Award for business journalism",
      "Columnist at Every and The Generalist (quarterly)",
    ],
    portraitUrl: "https://randomuser.me/api/portraits/women/68.jpg",
    heroPortraitUrl:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=1600&q=80",
    bio: "Noa spent fourteen years running editorial desks, from daily news to long-form venture media. She shipped the style guide Notion still uses, rebuilt Linear's docs voice, and ghost-writes for two Forbes 400 CEOs. She knows the difference between a 'house voice' and a style guide — and wires that nuance into every piece the skill produces.",
    approach:
      "Good content is not 'more words about the topic'. Noa's rule: every draft earns its publish by answering a specific question a specific reader actually asked — and never mimicking a generic LLM tone.",
    specialties: [
      "Long-form thought leadership",
      "Product documentation voice",
      "Ghost-writing for executives",
      "Content strategy & calendar",
      "Style guide design & enforcement",
      "Editorial workflow & approvals",
    ],
    notableClients: [
      "Notion",
      "Linear",
      "a16z Future",
      "Every",
    ],
    stats: {
      usersHelped: 1430,
      downloads: 4120,
      avgRating: 4.9,
      reviewCount: 386,
    },
    reviews: [
      {
        quote:
          "Drafts come back reading like us — not like a generic LLM with our logo on top. That was the whole bar.",
        name: "Jules Okafor",
        role: "Content Lead, developer-tools startup",
      },
      {
        quote:
          "The style-guide awareness is remarkable. It caught three voice slips in my own draft last week.",
        name: "Ines Vasquez",
        role: "Senior Writer, B2B media",
      },
      {
        quote:
          "Noa's skill cut my editing time in half without compromising quality. It's like she left a ghost in the machine.",
        name: "Anders Kjellberg",
        role: "Head of Content, infra startup",
      },
      {
        quote:
          "The editorial workflow awareness matters more than any LLM bell and whistle. Nothing ships that hasn't earned its place.",
        name: "Miriam Chen",
        role: "Editorial Director, VC firm",
      },
      {
        quote:
          "Our CEO's LinkedIn went from 400 likes to 40k in four months. Same person, sharper voice.",
        name: "Tomás Pereira",
        role: "Chief of Staff, Series C startup",
      },
    ],
  },
  {
    id: "kenji-arima",
    name: "Kenji Arima",
    title: "Principal Automation Engineer · ex-Google Workspace partner team",
    yearsExperience: 11,
    credentials: [
      "Shipped 80+ Workspace integrations for enterprise customers",
      "Co-author of an O'Reilly title on no-code workflow automation",
      "Former Apps Script PM at Google (2017–2021)",
      "Contributor to the Workspace Add-on SDK",
    ],
    portraitUrl: "https://randomuser.me/api/portraits/men/23.jpg",
    heroPortraitUrl:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=1600&q=80",
    bio: "Kenji built automations for Google Workspace customers at every scale, from two-person studios to Fortune 500 legal teams. At Google he led the partner engineering team that onboarded Dropbox, Atlassian, and Salesforce to Workspace. He treats permissions and audit trails as first-class design inputs — not afterthoughts.",
    approach:
      "Kenji's rule: no automation writes to a system of record unless it logs the action, names who owns the change, and can be undone. Convenience is never allowed to trump audit.",
    specialties: [
      "Drive filing & nomenclature",
      "Gmail triage & canned responses",
      "Sheets → Docs recurring reports",
      "Calendar automation & scheduling",
      "Forms → Sheets data pipelines",
      "Permission posture & audit logging",
    ],
    notableClients: [
      "Google Workspace Partner team",
      "Dropbox",
      "Atlassian (internal ops)",
      "A Fortune 50 legal department",
    ],
    stats: {
      usersHelped: 870,
      downloads: 2180,
      avgRating: 4.7,
      reviewCount: 194,
    },
    reviews: [
      {
        quote:
          "Our IT lead was skeptical until she read the permissions posture. The audit trail alone made this pass review.",
        name: "Abeni Tafari",
        role: "Head of Operations, consultancy",
      },
      {
        quote:
          "Took down four internal Zapier flows I'd been maintaining for years. Haven't missed them.",
        name: "Rupert Halloway",
        role: "Operations Manager, e-commerce",
      },
      {
        quote:
          "Kenji's skill flagged a sharing mistake our legal team had made three months ago. That's the kind of quiet value you can't see in a Zapier flow.",
        name: "Yael Berkowitz",
        role: "COO, legal-tech startup",
      },
      {
        quote:
          "The weekly revenue report went from 4 hours of my time to zero, and with a cleaner audit trail than the spreadsheet it replaced.",
        name: "Carlos Mendoza",
        role: "Finance Manager, e-commerce",
      },
    ],
  },
  {
    id: "amara-okonkwo",
    name: "Amara Okonkwo",
    title: "VP People · ex-Stripe, ex-Asana",
    yearsExperience: 16,
    credentials: [
      "Designed onboarding for orgs scaling 50 → 1,200 employees",
      "SHRM-SCP certified; advisor on the 2024 People Ops benchmark report",
      "Ran People at Asana through the IPO and Stripe through a hypergrowth phase",
      "Guest lecturer in People Strategy at Stanford GSB",
    ],
    portraitUrl: "https://randomuser.me/api/portraits/women/83.jpg",
    heroPortraitUrl:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=1600&q=80",
    bio: "Amara has run People at hyper-growth companies where the headcount chart was a moving target. At Stripe she built the onboarding system that absorbed 60+ hires a month without breaking culture. She's obsessive about confidentiality posture and allergic to HR pabulum — both biases show up in the skill.",
    approach:
      "Amara's lens: People Ops is not the policy police, it's the team that quietly lets everyone else do their best work. Every response should route to legal when it should — and absolutely not when it shouldn't.",
    specialties: [
      "New-hire onboarding checklists",
      "Performance review prep & calibration",
      "Policy Q&A with legal routing",
      "Offboarding with empathy",
      "Confidentiality posture & redaction",
      "Leave & time-off navigation",
    ],
    notableClients: [
      "Stripe",
      "Asana (pre-IPO → post-IPO)",
      "A Y Combinator cohort (People advisory)",
    ],
    stats: {
      usersHelped: 720,
      downloads: 1910,
      avgRating: 4.8,
      reviewCount: 172,
    },
    reviews: [
      {
        quote:
          "Finally, a People skill that doesn't treat every question like it's a lawsuit waiting to happen. It still routes the right ones to legal.",
        name: "Theo Rask",
        role: "People Lead, growth-stage startup",
      },
      {
        quote:
          "Our new-hire onboarding checklist is now actually checked. That has never happened before.",
        name: "Yasmin Archambault",
        role: "HR Business Partner, mid-market",
      },
      {
        quote:
          "Saved my People team half a headcount in review-cycle prep alone. The calibration notes felt like Amara had interviewed the managers herself.",
        name: "Devin Park",
        role: "Chief People Officer, 800-person SaaS",
      },
      {
        quote:
          "Our offboarding used to feel cold and transactional. Amara's flow made it humane without slipping on anything compliance-related.",
        name: "Reem Haddad",
        role: "HRBP, health-tech scale-up",
      },
    ],
  },
];

export function getExpert(id: string): Expert | null {
  return experts.find((e) => e.id === id) ?? null;
}
