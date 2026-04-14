export type AdvisorReview = {
  quote: string;
  name: string;
  role: string;
};

export type AdvisorStats = {
  usersHelped: number;
  downloads: number;
  avgRating: number;
  reviewCount: number;
};

export type Advisor = {
  name: string;
  title: string;
  yearsExperience: number;
  credentials: string[];
  portraitUrl: string;
  bio: string;
  stats: AdvisorStats;
  reviews: AdvisorReview[];
};

export type Skill = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  highlights: string[];
  advisor: Advisor;
};

export const skills: Skill[] = [
  {
    id: "sales-ops",
    name: "Sales Operations",
    category: "Revenue",
    tagline: "Pipeline hygiene, qualified follow-ups, forecast notes.",
    description:
      "An agent skill that audits your CRM, drafts personalized outreach, and keeps deal stages honest. Configurable to your ICP, sales motion, and tooling.",
    highlights: ["CRM audits", "Outbound drafting", "Forecast prep"],
    advisor: {
      name: "Hannah Reiter",
      title: "Head of RevOps · ex-Gong, ex-Salesforce",
      yearsExperience: 12,
      credentials: [
        "Scaled RevOps from $5M → $120M ARR at two companies",
        "Built the forecasting playbook used by 30+ Series B sales teams",
      ],
      portraitUrl: "https://randomuser.me/api/portraits/women/44.jpg",
      bio: "Hannah has spent the last decade building revenue operations from the ground up at B2B software companies. She's been in the weeds of stage definitions, forecast calls, and outbound sequencing — and she brings that lived detail into the skill you'll configure here.",
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
      ],
    },
  },
  {
    id: "marketing-brief",
    name: "Marketing Briefs",
    category: "Marketing",
    tagline: "From insight to brief in minutes, not days.",
    description:
      "Synthesize research, customer interviews, and analytics into structured briefs your team will actually read. Tuned to your brand voice and KPI tree.",
    highlights: ["Research synthesis", "Brand-voice tuning", "KPI alignment"],
    advisor: {
      name: "Tomás Alvarez",
      title: "Former VP Marketing · Series A → IPO at two B2B SaaS companies",
      yearsExperience: 15,
      credentials: [
        "Authored the brief framework adopted across 200+ campaigns",
        "Mentor at Reforge for the Brand Strategy program",
      ],
      portraitUrl: "https://randomuser.me/api/portraits/men/52.jpg",
      bio: "Tomás has sat in every marketing seat, from demand gen IC to VP Marketing through two IPOs. He treats briefs as contracts between marketing and the rest of the business — the skill reflects that discipline.",
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
      ],
    },
  },
  {
    id: "content-studio",
    name: "Content Studio",
    category: "Content",
    tagline: "A long-form writing partner that knows your style guide.",
    description:
      "Plans, drafts, and edits content across blog, docs, and social. Learns your style guide, source-of-truth links, and approval workflow.",
    highlights: ["Style-guide aware", "Multi-format", "Editorial workflow"],
    advisor: {
      name: "Noa Feldstein",
      title: "Former Editor-in-Chief · published 1,200+ pieces",
      yearsExperience: 14,
      credentials: [
        "Built editorial systems at three venture-backed media programs",
        "Advisor on style guides for Notion, Linear, and a16z Future",
      ],
      portraitUrl: "https://randomuser.me/api/portraits/women/68.jpg",
      bio: "Noa spent fourteen years running editorial desks, from daily news to long-form venture media. She knows the difference between a 'house voice' and a style guide — and she's wired that nuance into the skill.",
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
      ],
    },
  },
  {
    id: "google-ops",
    name: "Google Workspace Automations",
    category: "Operations",
    tagline: "Drive, Sheets, Gmail, Calendar — wired to your processes.",
    description:
      "Automates routine work across the Google ecosystem: filing, summarizing, scheduling, and reporting. Permissions-aware and audit-friendly.",
    highlights: ["Drive + Sheets", "Inbox triage", "Recurring reports"],
    advisor: {
      name: "Kenji Arima",
      title: "Principal Automation Engineer · ex-Google Workspace partner team",
      yearsExperience: 11,
      credentials: [
        "Shipped 80+ Workspace integrations for enterprise customers",
        "Co-author of an O'Reilly title on no-code workflow automation",
      ],
      portraitUrl: "https://randomuser.me/api/portraits/men/23.jpg",
      bio: "Kenji built automations for Google Workspace customers at every scale, from two-person studios to Fortune 500 legal teams. He treats permissions and audit trails as first-class design inputs — not afterthoughts.",
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
      ],
    },
  },
  {
    id: "people-ops",
    name: "People Operations",
    category: "HR",
    tagline: "Onboarding, policy answers, and review prep — done quietly.",
    description:
      "An HR partner skill that handles policy lookups, onboarding checklists, and review cycles, while respecting your tone and confidentiality rules.",
    highlights: ["Onboarding", "Policy Q&A", "Review cycles"],
    advisor: {
      name: "Amara Okonkwo",
      title: "VP People · ex-Stripe, ex-Asana",
      yearsExperience: 16,
      credentials: [
        "Designed onboarding for orgs scaling 50 → 1,200 employees",
        "SHRM-SCP certified; advisor on the 2024 People Ops benchmark report",
      ],
      portraitUrl: "https://randomuser.me/api/portraits/women/83.jpg",
      bio: "Amara has run People at hyper-growth companies where the headcount chart was a moving target. She's obsessive about confidentiality posture and hates HR pabulum — both biases show up in the skill.",
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
      ],
    },
  },
];
