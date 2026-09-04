import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const AGNES_MODEL = "agnes-2.5-flash";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch com backoff para 429/5xx da API da Agnes (limite de requisições por minuto). */
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
  return lastResponse ?? new Response("Agnes indisponível", { status: 503 });
};

export function createAgnes() {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const provider = createOpenAICompatible({
    name: "agnes",
    baseURL: "https://apihub.agnes-ai.com/v1",
    apiKey,
    fetch: resilientFetch,
  });

  return provider(AGNES_MODEL);
}
