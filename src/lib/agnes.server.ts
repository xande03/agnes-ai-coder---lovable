import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const AGENT_MODEL = "agnes-2.5-flash";
export const AGNES_API_KEY = "sk-wBXWbKNp9S0IyIw4k0LZdxpxsOrvtZh2Je2OmNK26knFsY2F";
export const AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";

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

export function createAgent() {
  const provider = createOpenAICompatible({
    name: "agnes",
    baseURL: AGNES_BASE_URL,
    apiKey: AGNES_API_KEY,
    fetch: resilientFetch,
  });

  return provider(AGENT_MODEL);
}
