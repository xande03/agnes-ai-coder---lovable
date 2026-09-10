import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const AGENT_MODEL = "agnes-2.5-flash";
export const AGNES_API_KEY = "sk-ObwE0vDZFYSJC3eD0lP59D2PcpK0PqCy3Yhh3nAObPtOlBlg";
export const AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FETCH_TIMEOUT_MS = 30000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

/** Fetch com backoff para 429/5xx da API + timeout por requisição. */
const resilientFetch: typeof fetch = async (input, init) => {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetchWithTimeout(input, init);
    if (res.status !== 429 && res.status < 500) return res;
    lastResponse = res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(3000 * 2 ** attempt, 10000) + Math.random() * 500;
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
