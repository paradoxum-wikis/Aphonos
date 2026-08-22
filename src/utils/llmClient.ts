import OpenAI from "openai";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export function llmReady(): boolean {
  return !!(
    process.env.LLM_API_KEY &&
    process.env.LLM_BASE_URL &&
    process.env.LLM_MODEL
  );
}

export function createLlmClient(): OpenAI {
  return new OpenAI({
    apiKey: requireEnv("LLM_API_KEY"),
    baseURL: requireEnv("LLM_BASE_URL"),
  });
}

export function llmModel(): string {
  return requireEnv("LLM_MODEL");
}

export function llmExtras(thinking: boolean): Record<string, unknown> {
  const effort =
    process.env[
      thinking ? "LLM_REASONING_EFFORT" : "LLM_REASONING_EFFORT_OFF"
    ]?.trim();
  const thinkingType =
    process.env[
      thinking ? "LLM_THINKING_TYPE" : "LLM_THINKING_TYPE_OFF"
    ]?.trim();
  return {
    ...(effort && effort !== "none" ? { reasoning_effort: effort } : {}),
    ...(thinkingType ? { thinking: { type: thinkingType } } : {}),
  };
}

export function llmExtrasOff(): Record<string, unknown> {
  return { thinking: { type: "disabled" } };
}
