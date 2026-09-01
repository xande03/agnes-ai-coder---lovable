import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const AGNES_MODEL = "agnes-2.5-flash";

export function createAgnes() {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const provider = createOpenAICompatible({
    name: "agnes",
    baseURL: "https://apihub.agnes-ai.com/v1",
    apiKey,
  });

  return provider(AGNES_MODEL);
}
