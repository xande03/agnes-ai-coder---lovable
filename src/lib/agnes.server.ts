import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const AGENT_MODEL = "deepseek-ai/deepseek-v4-pro-0813";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch que:
 * 1. Faz backoff para 429/5xx
 * 2. Corrige reasoning models: copia reasoning_content → content quando content é null
 */
const resilientFetch: typeof fetch = async (input, init) => {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429 && res.status < 500) {
      return patchReasoningContent(res);
    }
    lastResponse = res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(1500 * 2 ** attempt, 20000) + Math.random() * 500;
    await res.body?.cancel();
    await sleep(waitMs);
  }
  return lastResponse ?? new Response("Modelo indisponível", { status: 503 });
};

/** Se a resposta tiver content=null e reasoning_content preenchido, move para content. */
async function patchReasoningContent(res: Response): Promise<Response> {
  try {
    const cloned = res.clone();
    const json = await cloned.json() as Record<string, unknown>;
    const choices = json.choices as Array<{ message?: { content?: string | null; reasoning_content?: string | null } }> | undefined;
    if (choices) {
      let patched = false;
      for (const c of choices) {
        const msg = c.message;
        if (msg && msg.content === null && msg.reasoning_content) {
          msg.content = msg.reasoning_content;
          patched = true;
        }
      }
      if (patched) {
        return new Response(JSON.stringify(json), {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
    }
    return res;
  } catch {
    return res;
  }
}

export function createAgent(apiKey?: string) {
  const key = apiKey || process.env["NVIDIA_API_KEY"];
  if (!key) throw new Error("Missing NVIDIA_API_KEY");

  const provider = createOpenAICompatible({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey: key,
    fetch: resilientFetch,
  });

  return provider(AGENT_MODEL);
}
