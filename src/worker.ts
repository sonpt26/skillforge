import { zipSync, strToU8 } from "fflate";
import { getSchema } from "./data/schemas";
import { skills } from "./data/skills";
import type { InterviewRequest } from "./lib/protocol";
import { buildSkill } from "./lib/skill-builder";
import {
  createProvider,
  resolveProviderName,
  ProviderError,
} from "./providers";
import {
  createAdvisorApplication,
  SPECIALTY_IDS,
  SPECIALTY_OPTIONS,
} from "./server/advisor-applications";
import {
  createLoginCode,
  createSession,
  deleteSession,
  findOrCreateUser,
  findUserByEmail,
  getSessionUser,
  verifyAndConsumeCode,
  type UserRow,
} from "./server/auth";
import {
  clearSessionCookie,
  parseCookies,
  sessionCookie,
  SESSION_COOKIE,
} from "./server/cookies";
import {
  confirmPurchase,
  createPendingPurchase,
  hasAccessByEmail,
  hasAccessToSkill,
} from "./server/purchase";
import { getTier, TIERS, type TierId } from "./server/tiers";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  SKILLFORGE_PROVIDER?: string;
  SKILLFORGE_MOCK_MODE?: string;
}

function isMockMode(env: Env): boolean {
  return env.SKILLFORGE_MOCK_MODE === "true";
}

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;
  return getSessionUser(env.DB, sessionId);
}

// ──────────────────────────────────────────────────────────────────────────
// Auth endpoints
// ──────────────────────────────────────────────────────────────────────────

type RequestCodeBody = { email?: unknown; skillId?: unknown };

async function handleAuthRequestCode(request: Request, env: Env): Promise<Response> {
  let body: RequestCodeBody;
  try {
    body = (await request.json()) as RequestCodeBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!isValidEmail(body.email)) {
    return json({ error: "A valid email is required." }, 400);
  }
  const email = body.email as string;
  const skillId = typeof body.skillId === "string" ? body.skillId : null;

  const existingUser = await findUserByEmail(env.DB, email);
  const hasAccess = skillId && existingUser
    ? await hasAccessToSkill(env.DB, existingUser.id, skillId)
    : existingUser
      ? true
      : false;

  // New user OR user with no access to this skill → must go through purchase.
  if (!existingUser || (skillId && !hasAccess)) {
    return json({
      status: "needs_purchase",
      userExists: !!existingUser,
    });
  }

  // Returning user with access → issue a login code.
  const { code } = await createLoginCode(env.DB, email, "login");
  return json({
    status: "needs_verify",
    email,
    ...(isMockMode(env) ? { mockCode: code } : {}),
  });
}

type VerifyCodeBody = { email?: unknown; code?: unknown };

async function handleAuthVerifyCode(request: Request, env: Env): Promise<Response> {
  let body: VerifyCodeBody;
  try {
    body = (await request.json()) as VerifyCodeBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!isValidEmail(body.email) || typeof body.code !== "string") {
    return json({ error: "email and code are required." }, 400);
  }
  const email = body.email as string;
  const code = body.code as string;

  // Mock-mode bypass: any non-empty code is accepted. Real code is still
  // consumed if it happens to match — otherwise we just auth the email.
  const mock = isMockMode(env);
  if (!mock) {
    const result = await verifyAndConsumeCode(env.DB, email, code);
    if (!result.ok) {
      return json({ error: `Code ${result.reason.replace("_", " ")}.` }, 400);
    }
  } else if (code.trim().length === 0) {
    return json({ error: "Code required (any value in mock mode)." }, 400);
  } else {
    // Best-effort consume so the DB stays clean, but ignore failures.
    await verifyAndConsumeCode(env.DB, email, code).catch(() => undefined);
  }

  const user = await findOrCreateUser(env.DB, email);
  const { sessionId, maxAgeSec } = await createSession(env.DB, user.id);

  return json(
    { status: "ok", user: { id: user.id, email: user.email } },
    200,
    { "set-cookie": sessionCookie(sessionId, maxAgeSec) },
  );
}

async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) await deleteSession(env.DB, sessionId);
  return json({ status: "ok" }, 200, { "set-cookie": clearSessionCookie() });
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ user: null });
  return json({ user: { id: user.id, email: user.email } });
}

// ──────────────────────────────────────────────────────────────────────────
// Purchase endpoints
// ──────────────────────────────────────────────────────────────────────────

type PurchaseIntentBody = { email?: unknown; tier?: unknown; skillId?: unknown };

async function handlePurchaseIntent(request: Request, env: Env): Promise<Response> {
  let body: PurchaseIntentBody;
  try {
    body = (await request.json()) as PurchaseIntentBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (!isValidEmail(body.email)) return json({ error: "email required." }, 400);
  if (typeof body.tier !== "string" || !getTier(body.tier)) {
    return json({ error: "invalid tier." }, 400);
  }
  if (typeof body.skillId !== "string") {
    return json({ error: "skillId required." }, 400);
  }

  const result = await createPendingPurchase(
    env.DB,
    body.email as string,
    body.tier as TierId,
    body.skillId as string,
  );
  if (!result) return json({ error: "Could not create purchase." }, 400);

  // Real mode: would return a Stripe/VNPay checkout URL to encode into the QR.
  // Mock mode: return a placeholder URL and let the frontend simulate a click
  // to the confirm endpoint.
  const qrUrl = isMockMode(env)
    ? `mock://skillforge/pay/${result.purchase.id}`
    : `https://skillforge.ptson117.workers.dev/pay/${result.purchase.id}`;

  return json({
    status: "ok",
    purchaseId: result.purchase.id,
    tier: {
      id: result.tier.id,
      name: result.tier.name,
      priceCents: result.tier.priceCents,
      currency: result.tier.currency,
    },
    qrUrl,
    mock: isMockMode(env),
  });
}

type PurchaseConfirmBody = { purchaseId?: unknown };

async function handlePurchaseConfirm(request: Request, env: Env): Promise<Response> {
  // In production this endpoint would be called by the payment provider's
  // webhook (Stripe, VNPay, ...) with a signed payload. In mock mode the
  // frontend calls it directly to simulate a completed payment.
  let body: PurchaseConfirmBody;
  try {
    body = (await request.json()) as PurchaseConfirmBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.purchaseId !== "string") {
    return json({ error: "purchaseId required." }, 400);
  }

  const paymentRef = isMockMode(env)
    ? `mock_${Date.now()}`
    : `stripe_placeholder_${body.purchaseId}`;

  const purchase = await confirmPurchase(env.DB, body.purchaseId, paymentRef);
  if (!purchase) return json({ error: "Purchase not found." }, 404);

  const { code } = await createLoginCode(env.DB, purchase.email, "post_purchase");

  return json({
    status: "ok",
    email: purchase.email,
    tier: purchase.tier,
    ...(isMockMode(env) ? { mockCode: code } : {}),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Skill pipeline (gated by session + access)
// ──────────────────────────────────────────────────────────────────────────

async function handleInterview(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Unauthorized." }, 401);

  let body: InterviewRequest;
  try {
    body = (await request.json()) as InterviewRequest;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const schema = getSchema(body.skillId);
  const skill = skills.find((s) => s.id === body.skillId);
  if (!schema || !skill) {
    return json({ error: `Unknown skillId: ${body.skillId}` }, 400);
  }

  if (!(await hasAccessToSkill(env.DB, user.id, body.skillId))) {
    return json({ error: "Forbidden — no active access to this skill." }, 403);
  }

  const url = new URL(request.url);
  const providerOverride = url.searchParams.get("provider");
  const providerName = resolveProviderName(env, providerOverride);

  try {
    const provider = createProvider(providerName, env);
    const message = await provider.interview(schema, skill.advisor, body.transcript);
    return json({ message, provider: provider.name });
  } catch (err) {
    if (err instanceof ProviderError) {
      return json({ error: err.message, provider: providerName }, err.status);
    }
    return json({ error: "Unexpected server error.", provider: providerName }, 500);
  }
}

type FinalizeRequest = {
  skillId: string;
  profile: Record<string, unknown>;
};

async function handleFinalize(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Unauthorized." }, 401);

  let body: FinalizeRequest;
  try {
    body = (await request.json()) as FinalizeRequest;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (!body.skillId || typeof body.profile !== "object" || body.profile === null) {
    return json({ error: "skillId and profile are required." }, 400);
  }

  if (!(await hasAccessToSkill(env.DB, user.id, body.skillId))) {
    return json({ error: "Forbidden — no active access to this skill." }, 403);
  }

  const result = buildSkill(body.skillId, body.profile);
  if (!result) {
    return json({ error: `Unknown skillId: ${body.skillId}` }, 400);
  }

  const zipInput: Record<string, Uint8Array> = {};
  for (const file of result.files) {
    zipInput[file.path] = strToU8(file.content);
  }
  const zipped = zipSync(zipInput, { level: 6 });

  return new Response(zipped as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${result.folderName}.zip"`,
      "cache-control": "no-store",
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Advisor application submissions (public, no auth)
// ──────────────────────────────────────────────────────────────────────────

type AdvisorApplicationBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  specialty?: unknown;
  brief?: unknown;
};

async function handleAdvisorApplicationSubmit(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: AdvisorApplicationBody;
  try {
    body = (await request.json()) as AdvisorApplicationBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const specialty = typeof body.specialty === "string" ? body.specialty : "";
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";

  if (!name || name.length > 200) {
    return json({ error: "Name is required (max 200 chars)." }, 400);
  }
  if (!isValidEmail(email)) {
    return json({ error: "A valid email is required." }, 400);
  }
  if (phone.length > 50) {
    return json({ error: "Phone number too long." }, 400);
  }
  if (!SPECIALTY_IDS.includes(specialty)) {
    return json({ error: "Pick a valid specialty." }, 400);
  }
  if (brief.length > 2000) {
    return json({ error: "Brief too long (max 2000 chars)." }, 400);
  }

  const app = await createAdvisorApplication(env.DB, {
    name,
    email,
    phone: phone || undefined,
    specialty,
    brief: brief || undefined,
  });

  return json({ status: "ok", applicationId: app.id });
}

function handleAdvisorSpecialties(): Response {
  return json({ specialties: SPECIALTY_OPTIONS });
}

// ──────────────────────────────────────────────────────────────────────────
// Exposed tier catalog (used by the entry modal)
// ──────────────────────────────────────────────────────────────────────────

function handleTiersList(): Response {
  return json({
    tiers: Object.values(TIERS).map((t) => ({
      id: t.id,
      name: t.name,
      tagline: t.tagline,
      priceCents: t.priceCents,
      currency: t.currency,
      scopeType: t.scopeType,
      durationDays: t.durationDays,
      features: t.features,
    })),
  });
}

// ──────────────────────────────────────────────────────────────────────────

type Route = {
  method: string;
  path: string;
  handler: (request: Request, env: Env) => Promise<Response> | Response;
};

const routes: Route[] = [
  { method: "GET",  path: "/api/tiers",                   handler: () => handleTiersList() },
  { method: "GET",  path: "/api/advisor-specialties",     handler: () => handleAdvisorSpecialties() },
  { method: "POST", path: "/api/advisor-applications",    handler: handleAdvisorApplicationSubmit },
  { method: "POST", path: "/api/auth/request-code",       handler: handleAuthRequestCode },
  { method: "POST", path: "/api/auth/verify-code",        handler: handleAuthVerifyCode },
  { method: "POST", path: "/api/auth/logout",             handler: handleAuthLogout },
  { method: "GET",  path: "/api/me",                      handler: handleMe },
  { method: "POST", path: "/api/purchase/intent",         handler: handlePurchaseIntent },
  { method: "POST", path: "/api/purchase/confirm",        handler: handlePurchaseConfirm },
  { method: "POST", path: "/api/interview",               handler: handleInterview },
  { method: "POST", path: "/api/finalize",                handler: handleFinalize },
];

// Suppress unused-import warning — access helper surfaced for future modal UI.
void hasAccessByEmail;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    for (const route of routes) {
      if (url.pathname !== route.path) continue;
      if (request.method !== route.method) {
        return json({ error: "Method not allowed." }, 405);
      }
      return route.handler(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
