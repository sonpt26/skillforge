import { createAnthropicProvider } from "./anthropic";
import { createDeepseekProvider } from "./deepseek";
import { ProviderError, type Provider, type ProviderName } from "./types";

export { ProviderError };
export type { Provider, ProviderName };

export type ProviderEnv = {
  ANTHROPIC_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  SKILLFORGE_PROVIDER?: string;
};

export function resolveProviderName(
  env: ProviderEnv,
  override?: string | null,
): ProviderName {
  const raw = (override ?? env.SKILLFORGE_PROVIDER ?? "anthropic")
    .toString()
    .toLowerCase()
    .trim();
  if (raw === "deepseek") return "deepseek";
  return "anthropic";
}

export function createProvider(name: ProviderName, env: ProviderEnv): Provider {
  if (name === "deepseek") {
    if (!env.DEEPSEEK_API_KEY) {
      throw new ProviderError("Server is missing DEEPSEEK_API_KEY.", 500);
    }
    return createDeepseekProvider(env.DEEPSEEK_API_KEY);
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new ProviderError("Server is missing ANTHROPIC_API_KEY.", 500);
  }
  return createAnthropicProvider(env.ANTHROPIC_API_KEY);
}
