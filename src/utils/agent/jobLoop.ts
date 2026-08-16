import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createLlmClient, llmExtras, llmModel } from "../llmClient.js";
import { getMcpSession } from "./mcpSession.js";
import { prepareToolArgs, toTools } from "./tools.js";
import { systemPrompt, userPrompt } from "./prompt.js";
import type { WikiConfig } from "./wikis.js";
import { pageUrl } from "./wikis.js";

const MAX_STEPS = Number(process.env.JOB_MAX_STEPS ?? 20);
const TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 12 * 60 * 1000);
const TOOL_RESULT_MAX = 24_000;
const CONTEXT_LIMIT = Number(process.env.LLM_CONTEXT_LIMIT || 0) || null;

export interface JobInput {
  wiki: WikiConfig;
  task: string;
  sessionPage: string;
  outputPage: string;
  jobId: string;
  isContinue?: boolean;
  thinking?: boolean;
  onProgress?: (msg: string) => void | Promise<void>;
}

export interface JobResult {
  summary: string;
  sessionPage: string;
  outputPage: string;
  sessionUrl: string;
  outputUrl: string;
  steps: number;
  peakPromptTokens: number;
  contextLimit: number | null;
}

const fmtTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n);

const authFailed = (text: string) =>
  /credentials could not be authenticated|incorrect username or password|too many recent login attempts/i.test(
    text,
  );

export function formatContextUsage(
  peakPromptTokens: number,
  contextLimit: number | null,
): string {
  if (!peakPromptTokens) return "-";
  if (contextLimit) {
    const pct = ((peakPromptTokens / contextLimit) * 100).toFixed(1);
    return `${fmtTokens(peakPromptTokens)} / ${fmtTokens(contextLimit)} peak prompt (${pct}%)`;
  }
  return `${fmtTokens(peakPromptTokens)} peak prompt`;
}

export async function runJob(input: JobInput): Promise<JobResult> {
  const started = Date.now();
  const model = llmModel();
  const thinking = input.thinking !== false;
  let peakPromptTokens = 0;

  const result = (summary: string, steps: number): JobResult => ({
    summary,
    sessionPage: input.sessionPage,
    outputPage: input.outputPage,
    sessionUrl: pageUrl(input.wiki, input.sessionPage),
    outputUrl: pageUrl(input.wiki, input.outputPage),
    steps,
    peakPromptTokens,
    contextLimit: CONTEXT_LIMIT,
  });

  await input.onProgress?.("Connecting to wiki tools...");
  const mcp = await getMcpSession();
  const tools = toTools(await mcp.listTools());
  if (!tools.length) throw new Error("No MCP tools available after filter");

  const who = await mcp.callTool("whoami", { wiki: input.wiki.mcpKey });
  if (authFailed(who)) throw new Error(`Wiki login failed:\n${who}`);

  const client = createLlmClient();
  const extras = llmExtras(thinking);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt(input.wiki, input.sessionPage, input.outputPage),
    },
    {
      role: "user",
      content: userPrompt(
        input.task,
        input.sessionPage,
        input.outputPage,
        input.jobId,
        input.isContinue,
      ),
    },
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (Date.now() - started > TIMEOUT_MS) {
      return result(
        `Timed out after ${step - 1} steps. Session: \`${input.sessionPage}\`.`,
        step - 1,
      );
    }

    await input.onProgress?.(
      `${thinking ? "Thinking" : "Working"} (step ${step}/${MAX_STEPS})…`,
    );

    const res = await client.chat.completions.create({
      model,
      messages,
      tools,
      ...extras,
    } as never);

    peakPromptTokens = Math.max(
      peakPromptTokens,
      res.usage?.prompt_tokens ?? 0,
    );

    const msg = res.choices[0]?.message;
    if (!msg) throw new Error("Empty completion");

    messages.push({
      role: "assistant",
      content: msg.content,
      tool_calls: msg.tool_calls,
      ...(msg.reasoning_content
        ? { reasoning_content: msg.reasoning_content }
        : {}),
    });

    if (!msg.tool_calls?.length) {
      return result(
        msg.content?.trim() || `Done. Session: \`${input.sessionPage}\`.`,
        step,
      );
    }

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const { name, arguments: rawArgs } = call.function;
      await input.onProgress?.(`\`${name}\`...`);

      const prepared = prepareToolArgs(name, rawArgs, input.wiki);
      let content = prepared.ok
        ? await mcp.callTool(name, prepared.args)
        : prepared.error;
      if (content.length > TOOL_RESULT_MAX) {
        content = `${content.slice(0, TOOL_RESULT_MAX)}\n...[truncated ${content.length - TOOL_RESULT_MAX} chars]`;
      }

      console.log(`[job ${input.jobId}] ${input.wiki.choice} tool=${name}`);
      if (authFailed(content))
        throw new Error(`Wiki login failed:\n${content}`);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content,
      });
    }
  }

  return result(
    `Hit max steps (${MAX_STEPS}). Session: \`${input.sessionPage}\`.`,
    MAX_STEPS,
  );
}
