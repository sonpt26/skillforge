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
import { isAdmin } from "./server/admin";
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
  isInsecureRequest,
  parseCookies,
  sessionCookie,
  SESSION_COOKIE,
} from "./server/cookies";
import { experts as staticExperts } from "./data/experts";
import { getTemplate } from "./data/skill-templates";
import {
  getExpertRow,
  isExpertMcpEnabled,
  listExperts,
  rowToExpert,
  seedExpertsIfMissing,
  setExpertMcpEnabled,
  setExpertStatus,
  upsertExpert,
} from "./server/experts-db";
import { loadAdvisorSkillSet } from "./server/advisor-skill-set";
import {
  appendArtifactVersion,
  getArtifactForUser,
  getArtifactVersion,
  listArtifactVersions,
  listArtifactsForUser,
} from "./server/artifacts-db";
import {
  archiveActiveSession,
  ensureActiveSession,
  getActiveSession,
  listActiveSessionsWithUser,
  recordTurnStats,
  saveTranscript,
  setMcpConversationId,
} from "./server/chat-sessions-db";
import {
  isGemmaConfigured,
  mcpSessionClose,
  mcpSessionOpen,
  mcpSessionTurn,
} from "./server/mcp-runtime";
import { log, logError } from "./server/logger";
import { getKhaiVanSkill } from "./data/khai-van-skills";
import { renderReport } from "./lib/skill-builder";
import { reconstructProfile } from "./lib/profile";
import {
  clearPriceForExpert,
  listAllPricing,
  resolvePriceForExpert,
  setPriceForExpert,
} from "./server/pricing-db";
import {
  confirmPurchase,
  createPendingPurchase,
  hasAccessByEmail,
  hasAccessToSkill,
} from "./server/purchase";
import { getTier, TIERS, type TierId } from "./server/tiers";

export interface Env {
  // Optional so the same Env shape works for the standalone Bun backend where
  // nginx serves static assets — the CF worker still gets this via the
  // wrangler.jsonc `assets` binding and the fallback below.
  ASSETS?: Fetcher;
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  SKILLFORGE_PROVIDER?: string;
  SKILLFORGE_MOCK_MODE?: string;
  ADMIN_EMAILS?: string;
  GEMMA_URL?: string;
  GEMMA_TOKEN?: string;
  GEMMA_MODEL?: string;
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

  // No skill specified → generic sign-in. Always issue a code so admins and
  // returning users can log into /admin, /me, etc. without going through the
  // purchase flow.
  if (!skillId) {
    const { code } = await createLoginCode(env.DB, email, "login");
    return json({
      status: "needs_verify",
      email,
      ...(isMockMode(env) ? { mockCode: code } : {}),
    });
  }

  const existingUser = await findUserByEmail(env.DB, email);
  const hasAccess = existingUser
    ? await hasAccessToSkill(env.DB, existingUser.id, skillId)
    : false;

  // New user OR user with no access to this skill → must go through purchase.
  if (!existingUser || !hasAccess) {
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

  const cookieOpts = { secure: !isInsecureRequest(request) };
  log({ msg: "auth.login", user: user.email });
  return json(
    { status: "ok", user: { id: user.id, email: user.email } },
    200,
    { "set-cookie": sessionCookie(sessionId, maxAgeSec, cookieOpts) },
  );
}

async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) await deleteSession(env.DB, sessionId);
  const cookieOpts = { secure: !isInsecureRequest(request) };
  return json({ status: "ok" }, 200, {
    "set-cookie": clearSessionCookie(cookieOpts),
  });
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
  const template = getTemplate(body.skillId);
  if (!schema || !skill || !template) {
    return json({ error: `Unknown skillId: ${body.skillId}` }, 400);
  }

  if (!(await hasAccessToSkill(env.DB, user.id, body.skillId))) {
    return json({ error: "Forbidden — no active access to this skill." }, 403);
  }

  // Per-advisor routing: if the admin has toggled MCP on for this advisor we
  // hand the conversation to the self-hosted Gemma 4 session. Otherwise we
  // stay on the default LLM provider (DeepSeek / Anthropic).
  const mcpEnabled = await isExpertMcpEnabled(env.DB, template.expertId);
  const desiredMode: "llm" | "mcp" = mcpEnabled ? "mcp" : "llm";

  // Pin the session's mode on creation; the admin flipping MCP while a user
  // is mid-chat shouldn't bounce them to a different backend.
  const session = await ensureActiveSession(
    env.DB,
    user.id,
    body.skillId,
    desiredMode,
  );
  const sessionMode = session.mode === "mcp" ? "mcp" : "llm";

  const t0 = Date.now();
  try {
    let message;
    let providerLabel: string;
    let usage: { input: number; output: number } | undefined;
    let sessionOpened = false;

    if (sessionMode === "mcp") {
      const skillSet = loadAdvisorSkillSet(template.expertId);
      if (!skillSet) {
        return json({ error: "No advisor skill set available." }, 500);
      }
      const mcpInput = {
        schema,
        advisor: skill.advisor,
        skillSet,
        transcript: body.transcript,
      };
      if (!session.mcp_conversation_id) {
        const opened = await mcpSessionOpen(env, mcpInput);
        await setMcpConversationId(env.DB, session.id, opened.conversationId);
        message = opened.message;
        usage = opened.usage;
        providerLabel = `mcp(${opened.model})`;
        sessionOpened = true;
      } else {
        const turn = await mcpSessionTurn(
          env,
          session.mcp_conversation_id,
          mcpInput,
        );
        message = turn.message;
        usage = turn.usage;
        providerLabel = `mcp(${turn.model})`;
      }
    } else {
      const url = new URL(request.url);
      const providerOverride = url.searchParams.get("provider");
      const providerName = resolveProviderName(env, providerOverride);
      const provider = createProvider(providerName, env);
      const result = await provider.interview(
        schema,
        skill.advisor,
        body.transcript,
      );
      message = result.message;
      usage = result.usage;
      providerLabel = provider.name;
    }

    // Mirror the new transcript into D1 so the user can resume after a reload
    // or from another device. Profile is reconstructed for quick access in the
    // skill folder / finalize step.
    const newTranscript = [...body.transcript, { role: "bot" as const, message }];
    const profile = reconstructProfile(newTranscript);
    await saveTranscript(env.DB, session.id, newTranscript, profile);
    await recordTurnStats(
      env.DB,
      session.id,
      usage?.input ?? 0,
      usage?.output ?? 0,
    );

    log({
      msg: sessionOpened ? "interview.open" : "interview.turn",
      user: user.email,
      skill: body.skillId,
      advisor: template.expertId,
      mode: sessionMode,
      provider: providerLabel,
      turns: newTranscript.length,
      tokens_in: usage?.input,
      tokens_out: usage?.output,
      reply_type: message.type,
      ms: Date.now() - t0,
      mcp_gemma: sessionMode === "mcp" ? isGemmaConfigured(env) : undefined,
    });

    return json({ message, provider: providerLabel, sessionId: session.id });
  } catch (err) {
    logError("interview.fail", err, {
      user: user.email,
      skill: body.skillId,
      mode: sessionMode,
      ms: Date.now() - t0,
    });
    if (err instanceof ProviderError) {
      return json({ error: err.message }, err.status);
    }
    return json({ error: "Unexpected server error." }, 500);
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

  // Persist the forge as a new artifact version for this user+skill.
  // Markdown report is stored; the binary ZIP is rebuilt on demand from the
  // profile so we don't balloon D1 storage.
  const template = getTemplate(body.skillId);
  const khaiVan = template ? getKhaiVanSkill(template.khaiVanSkillId) : null;
  const reportMarkdown = khaiVan
    ? renderReport(khaiVan, body.profile).markdown
    : "";
  await appendArtifactVersion(
    env.DB,
    user.id,
    body.skillId,
    body.profile,
    reportMarkdown,
  );

  // If this session was backed by MCP, release the conversation now that the
  // user has committed to this forge. Best-effort — Gemma frees whatever
  // per-session state it was holding; stub mode is a no-op.
  const session = await getActiveSession(env.DB, user.id, body.skillId);
  if (session?.mode === "mcp" && session.mcp_conversation_id) {
    await mcpSessionClose(env, session.mcp_conversation_id);
    log({
      msg: "mcp.close",
      user: user.email,
      skill: body.skillId,
      reason: "forge",
      conv_id: session.mcp_conversation_id,
    });
  }
  log({
    msg: "forge",
    user: user.email,
    skill: body.skillId,
    folder: result.folderName,
    files: result.files.length,
  });

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
// Chat session + artifact history (signed-in users)
// ──────────────────────────────────────────────────────────────────────────

async function handleChatSessionGet(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const skillId = url.searchParams.get("skillId");
  if (!skillId) return json({ error: "skillId required." }, 400);
  const row = await getActiveSession(env.DB, user.id, skillId);
  if (!row) return json({ session: null });
  return json({
    session: {
      id: row.id,
      skillId: row.skill_id,
      mode: row.mode,
      mcpConversationId: row.mcp_conversation_id,
      transcript: safeJsonParse(row.transcript, []),
      profile: safeJsonParse(row.profile, {}),
      updatedAt: row.updated_at,
    },
  });
}

type ChatResetBody = { skillId?: unknown };

async function handleChatSessionReset(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Unauthorized." }, 401);
  let body: ChatResetBody;
  try {
    body = (await request.json()) as ChatResetBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.skillId !== "string") {
    return json({ error: "skillId required." }, 400);
  }
  const archived = await archiveActiveSession(env.DB, user.id, body.skillId);
  if (archived?.mode === "mcp" && archived.mcp_conversation_id) {
    await mcpSessionClose(env, archived.mcp_conversation_id);
    log({
      msg: "mcp.close",
      user: user.email,
      skill: body.skillId,
      reason: "reset",
      conv_id: archived.mcp_conversation_id,
    });
  }
  log({
    msg: "chat.reset",
    user: user.email,
    skill: body.skillId,
    had_session: !!archived,
  });
  return json({ status: "ok" });
}

async function handleMyArtifacts(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Unauthorized." }, 401);
  const artifacts = await listArtifactsForUser(env.DB, user.id);
  const enriched = await Promise.all(
    artifacts.map(async (a) => {
      const versions = await listArtifactVersions(env.DB, a.id);
      return {
        id: a.id,
        skillId: a.skill_id,
        latestVersion: a.latest_version,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        versions: versions.map((v) => ({
          id: v.id,
          version: v.version,
          createdAt: v.created_at,
          reportMarkdown: v.report_markdown,
        })),
      };
    }),
  );
  return json({ artifacts: enriched });
}

async function handleMyArtifactDownload(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Unauthorized." }, 401);
  const url = new URL(request.url);
  const artifactId = url.searchParams.get("artifactId");
  const versionStr = url.searchParams.get("version");
  if (!artifactId || !versionStr) {
    return json({ error: "artifactId and version required." }, 400);
  }
  const artifact = await getArtifactForUser(env.DB, artifactId, user.id);
  if (!artifact) return json({ error: "Not found." }, 404);
  const version = Number(versionStr);
  const versionRow = await getArtifactVersion(env.DB, artifactId, version);
  if (!versionRow) return json({ error: "Version not found." }, 404);
  const profile = safeJsonParse(versionRow.profile_data, {}) as Record<
    string,
    unknown
  >;
  const result = buildSkill(artifact.skill_id, profile);
  if (!result) return json({ error: "Could not rebuild skill." }, 500);
  const zipInput: Record<string, Uint8Array> = {};
  for (const file of result.files) {
    zipInput[file.path] = strToU8(file.content);
  }
  const zipped = zipSync(zipInput, { level: 6 });
  return new Response(zipped as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${result.folderName}-v${version}.zip"`,
      "cache-control": "no-store",
    },
  });
}

function safeJsonParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Exposed tier catalog (used by the entry modal)
// ──────────────────────────────────────────────────────────────────────────

async function handleTiersList(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const skillId = url.searchParams.get("skillId");
  const expertId = skillId ? (getTemplate(skillId)?.expertId ?? null) : null;

  const base = Object.values(TIERS);
  const tiers = await Promise.all(
    base.map(async (t) => {
      let priceCents = t.priceCents;
      let currency: string = t.currency;
      let source: "override" | "default" = "default";
      if (expertId && t.scopeType !== "all") {
        const resolved = await resolvePriceForExpert(env.DB, expertId, t.id);
        priceCents = resolved.priceCents;
        currency = resolved.currency;
        source = resolved.source;
      }
      return {
        id: t.id,
        name: t.name,
        tagline: t.tagline,
        priceCents,
        currency,
        scopeType: t.scopeType,
        durationDays: t.durationDays,
        features: t.features,
        priceSource: source,
      };
    }),
  );
  return json({ tiers });
}

// ──────────────────────────────────────────────────────────────────────────
// Admin endpoints — gated by email allowlist (ADMIN_EMAILS env var)
// ──────────────────────────────────────────────────────────────────────────

async function requireAdmin(
  request: Request,
  env: Env,
): Promise<UserRow | Response> {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Unauthorized." }, 401);
  if (!isAdmin(user, env.ADMIN_EMAILS)) {
    return json({ error: "Forbidden." }, 403);
  }
  return user;
}

async function handleAdminMe(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  return json({
    user: user ? { id: user.id, email: user.email } : null,
    isAdmin: isAdmin(user, env.ADMIN_EMAILS),
  });
}

async function handleAdminSeed(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const result = await seedExpertsIfMissing(env.DB, staticExperts);
  return json({ status: "ok", ...result });
}

async function handleAdminExpertsList(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const rows = await listExperts(env.DB);
  return json({
    mcpConfigured: isGemmaConfigured(env),
    experts: rows.map((r) => ({
      id: r.id,
      name: r.name,
      title: r.title,
      status: r.status,
      portraitUrl: r.portrait_url,
      mcpEnabled: r.mcp_enabled === 1,
      updatedAt: r.updated_at,
    })),
  });
}

type McpToggleBody = { id?: unknown; enabled?: unknown };

async function handleAdminSetMcpEnabled(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  let body: McpToggleBody;
  try {
    body = (await request.json()) as McpToggleBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.id !== "string" || !body.id) {
    return json({ error: "id required." }, 400);
  }
  if (typeof body.enabled !== "boolean") {
    return json({ error: "enabled (boolean) required." }, 400);
  }
  await setExpertMcpEnabled(env.DB, body.id, body.enabled);
  log({
    msg: "admin.mcp_toggle",
    admin: gate.email,
    advisor: body.id,
    enabled: body.enabled,
  });
  return json({ status: "ok" });
}

async function handleAdminExpertGet(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "id required." }, 400);
  const row = await getExpertRow(env.DB, id);
  if (!row) return json({ error: "Not found." }, 404);
  return json({ expert: rowToExpert(row), status: row.status });
}

type ExpertUpdateBody = {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  yearsExperience?: unknown;
  portraitUrl?: unknown;
  heroPortraitUrl?: unknown;
  bio?: unknown;
  approach?: unknown;
  specialties?: unknown;
  notableClients?: unknown;
  credentials?: unknown;
  stats?: unknown;
  reviews?: unknown;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

async function handleAdminExpertUpdate(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  let body: ExpertUpdateBody;
  try {
    body = (await request.json()) as ExpertUpdateBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.id !== "string" || !body.id) {
    return json({ error: "id required." }, 400);
  }
  const existing = await getExpertRow(env.DB, body.id);
  if (!existing) return json({ error: "Not found." }, 404);

  if (typeof body.name !== "string" || !body.name.trim()) {
    return json({ error: "name required." }, 400);
  }
  if (typeof body.title !== "string" || !body.title.trim()) {
    return json({ error: "title required." }, 400);
  }
  if (typeof body.bio !== "string" || !body.bio.trim()) {
    return json({ error: "bio required." }, 400);
  }
  if (typeof body.portraitUrl !== "string" || !body.portraitUrl.trim()) {
    return json({ error: "portraitUrl required." }, 400);
  }

  const statsIn =
    typeof body.stats === "object" && body.stats !== null
      ? (body.stats as Record<string, unknown>)
      : {};

  const reviews = Array.isArray(body.reviews)
    ? body.reviews
        .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
        .map((r) => ({
          quote: typeof r.quote === "string" ? r.quote : "",
          name: typeof r.name === "string" ? r.name : "",
          role: typeof r.role === "string" ? r.role : "",
        }))
        .filter((r) => r.quote.trim() && r.name.trim())
    : [];

  const specialties = asStringArray(body.specialties);
  const notableClients = asStringArray(body.notableClients);
  const credentials = asStringArray(body.credentials);

  await upsertExpert(
    env.DB,
    {
      id: body.id,
      name: body.name.trim(),
      title: body.title.trim(),
      yearsExperience:
        typeof body.yearsExperience === "number"
          ? Math.max(0, Math.round(body.yearsExperience))
          : 0,
      portraitUrl: body.portraitUrl.trim(),
      heroPortraitUrl:
        typeof body.heroPortraitUrl === "string" && body.heroPortraitUrl.trim()
          ? body.heroPortraitUrl.trim()
          : undefined,
      bio: body.bio,
      approach:
        typeof body.approach === "string" && body.approach.trim()
          ? body.approach
          : undefined,
      specialties: specialties.length > 0 ? specialties : undefined,
      notableClients: notableClients.length > 0 ? notableClients : undefined,
      credentials,
      stats: {
        usersHelped:
          typeof statsIn.usersHelped === "number" ? statsIn.usersHelped : 0,
        downloads:
          typeof statsIn.downloads === "number" ? statsIn.downloads : 0,
        avgRating:
          typeof statsIn.avgRating === "number" ? statsIn.avgRating : 0,
        reviewCount:
          typeof statsIn.reviewCount === "number" ? statsIn.reviewCount : 0,
      },
      reviews,
    },
    existing.status === "disabled" ? "disabled" : "active",
  );
  return json({ status: "ok" });
}

type ExpertStatusBody = { id?: unknown; status?: unknown };

async function handleAdminSetExpertStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  let body: ExpertStatusBody;
  try {
    body = (await request.json()) as ExpertStatusBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.id !== "string") return json({ error: "id required." }, 400);
  if (body.status !== "active" && body.status !== "disabled") {
    return json({ error: "status must be 'active' or 'disabled'." }, 400);
  }
  await setExpertStatus(env.DB, body.id, body.status);
  return json({ status: "ok" });
}

async function handleAdminMonitoring(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const rows = await listActiveSessionsWithUser(env.DB);
  const now = Date.now();

  type SessionOut = {
    id: string;
    userEmail: string;
    skillId: string;
    skillName: string;
    mode: string;
    mcpConversationId: string | null;
    mcpOpen: boolean;
    turns: number;
    tokensIn: number;
    tokensOut: number;
    startedAt: string;
    lastActivityAt: string;
    ageSec: number;
    idleSec: number;
  };

  type AdvisorGroup = {
    expertId: string;
    expertName: string;
    mcpEnabled: boolean;
    activeSessions: number;
    totalTokensIn: number;
    totalTokensOut: number;
    sessions: SessionOut[];
  };

  const groups = new Map<string, AdvisorGroup>();
  let orphans: SessionOut[] = [];

  // Pull expert rows once so we can label MCP state + name.
  const experts = await listExperts(env.DB);
  const expertIndex = new Map(experts.map((e) => [e.id, e]));

  for (const r of rows) {
    const template = getTemplate(r.skill_id);
    const s: SessionOut = {
      id: r.id,
      userEmail: r.user_email,
      skillId: r.skill_id,
      skillName: template?.name ?? r.skill_id,
      mode: r.mode,
      mcpConversationId: r.mcp_conversation_id,
      mcpOpen: r.mode === "mcp" && !!r.mcp_conversation_id,
      turns: r.turn_count,
      tokensIn: r.total_tokens_in,
      tokensOut: r.total_tokens_out,
      startedAt: r.created_at,
      lastActivityAt: r.updated_at,
      ageSec: Math.floor((now - new Date(r.created_at).getTime()) / 1000),
      idleSec: Math.floor((now - new Date(r.updated_at).getTime()) / 1000),
    };
    if (!template) {
      orphans.push(s);
      continue;
    }
    const exp = expertIndex.get(template.expertId);
    const key = template.expertId;
    if (!groups.has(key)) {
      groups.set(key, {
        expertId: key,
        expertName: exp?.name ?? key,
        mcpEnabled: exp?.mcp_enabled === 1,
        activeSessions: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        sessions: [],
      });
    }
    const g = groups.get(key)!;
    g.sessions.push(s);
    g.activeSessions++;
    g.totalTokensIn += s.tokensIn;
    g.totalTokensOut += s.tokensOut;
  }

  const advisors = Array.from(groups.values()).sort(
    (a, b) => b.activeSessions - a.activeSessions,
  );

  const summary = {
    totalActiveSessions: rows.length,
    totalTokensIn: rows.reduce((a, r) => a + r.total_tokens_in, 0),
    totalTokensOut: rows.reduce((a, r) => a + r.total_tokens_out, 0),
    totalMcpOpen: rows.filter(
      (r) => r.mode === "mcp" && r.mcp_conversation_id,
    ).length,
    gemmaConfigured: isGemmaConfigured(env),
    serverTime: new Date(now).toISOString(),
  };

  return json({ summary, advisors, orphans });
}

async function handleAdminPricingList(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const rows = await listAllPricing(env.DB);
  return json({
    overrides: rows.map((r) => ({
      expertId: r.expert_id,
      tierId: r.tier_id,
      priceCents: r.price_cents,
      currency: r.currency,
      updatedAt: r.updated_at,
    })),
    defaults: Object.values(TIERS).map((t) => ({
      tierId: t.id,
      priceCents: t.priceCents,
      currency: t.currency,
      scopeType: t.scopeType,
    })),
  });
}

type PricingSetBody = {
  expertId?: unknown;
  tierId?: unknown;
  priceCents?: unknown;
};

async function handleAdminPricingSet(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  let body: PricingSetBody;
  try {
    body = (await request.json()) as PricingSetBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.expertId !== "string" || !body.expertId) {
    return json({ error: "expertId required." }, 400);
  }
  if (typeof body.tierId !== "string" || !getTier(body.tierId)) {
    return json({ error: "valid tierId required." }, 400);
  }
  const tier = getTier(body.tierId)!;
  if (tier.scopeType === "all") {
    return json(
      { error: "Lifetime tier has no per-advisor price override." },
      400,
    );
  }
  if (typeof body.priceCents !== "number" || body.priceCents < 0) {
    return json({ error: "priceCents must be a non-negative number." }, 400);
  }
  await setPriceForExpert(
    env.DB,
    body.expertId,
    body.tierId as TierId,
    Math.round(body.priceCents),
  );
  return json({ status: "ok" });
}

type PricingClearBody = { expertId?: unknown; tierId?: unknown };

async function handleAdminPricingClear(
  request: Request,
  env: Env,
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  let body: PricingClearBody;
  try {
    body = (await request.json()) as PricingClearBody;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (typeof body.expertId !== "string") {
    return json({ error: "expertId required." }, 400);
  }
  if (typeof body.tierId !== "string" || !getTier(body.tierId)) {
    return json({ error: "valid tierId required." }, 400);
  }
  await clearPriceForExpert(env.DB, body.expertId, body.tierId as TierId);
  return json({ status: "ok" });
}

// ──────────────────────────────────────────────────────────────────────────

type Route = {
  method: string;
  path: string;
  handler: (request: Request, env: Env) => Promise<Response> | Response;
};

const routes: Route[] = [
  { method: "GET",  path: "/api/tiers",                   handler: handleTiersList },
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

  { method: "GET",  path: "/api/chat/session",            handler: handleChatSessionGet },
  { method: "POST", path: "/api/chat/session/reset",      handler: handleChatSessionReset },
  { method: "GET",  path: "/api/me/artifacts",            handler: handleMyArtifacts },
  { method: "GET",  path: "/api/me/artifacts/download",   handler: handleMyArtifactDownload },

  { method: "GET",  path: "/api/admin/me",                handler: handleAdminMe },
  { method: "POST", path: "/api/admin/seed",              handler: handleAdminSeed },
  { method: "GET",  path: "/api/admin/experts",           handler: handleAdminExpertsList },
  { method: "GET",  path: "/api/admin/experts/get",       handler: handleAdminExpertGet },
  { method: "POST", path: "/api/admin/experts/update",    handler: handleAdminExpertUpdate },
  { method: "POST", path: "/api/admin/experts/status",    handler: handleAdminSetExpertStatus },
  { method: "POST", path: "/api/admin/experts/mcp",       handler: handleAdminSetMcpEnabled },
  { method: "GET",  path: "/api/admin/monitoring",        handler: handleAdminMonitoring },
  { method: "GET",  path: "/api/admin/pricing",           handler: handleAdminPricingList },
  { method: "POST", path: "/api/admin/pricing",           handler: handleAdminPricingSet },
  { method: "POST", path: "/api/admin/pricing/clear",     handler: handleAdminPricingClear },
];

// Suppress unused-import warning — access helper surfaced for future modal UI.
void hasAccessByEmail;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const match = routes.find(
      (r) => r.path === url.pathname && r.method === request.method,
    );
    if (match) return match.handler(request, env);

    const pathExists = routes.some((r) => r.path === url.pathname);
    if (pathExists) {
      return json({ error: "Method not allowed." }, 405);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: "Not found." }, 404);
  },
} satisfies ExportedHandler<Env>;
