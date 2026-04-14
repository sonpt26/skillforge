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

interface Env {
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  SKILLFORGE_PROVIDER?: string;
}

async function handleInterview(request: Request, env: Env): Promise<Response> {
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

async function handleFinalize(request: Request): Promise<Response> {
  let body: FinalizeRequest;
  try {
    body = (await request.json()) as FinalizeRequest;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (!body.skillId || typeof body.profile !== "object" || body.profile === null) {
    return json({ error: "skillId and profile are required." }, 400);
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

  return new Response(zipped, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${result.folderName}.zip"`,
      "cache-control": "no-store",
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/interview") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405);
      }
      return handleInterview(request, env);
    }

    if (url.pathname === "/api/finalize") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405);
      }
      return handleFinalize(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
