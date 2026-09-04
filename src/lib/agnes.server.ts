import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const AGENT_MODEL = "deepseek-ai/deepseek-v4-flash-0731";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch com backoff para 429/5xx da API. */
const resilientFetch: typeof fetch = async (input, init) => {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429 && res.status < 500) return res;
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
