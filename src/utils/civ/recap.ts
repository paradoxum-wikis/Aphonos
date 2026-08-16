import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createLlmClient, llmExtrasOff, llmModel } from "../llmClient.js";
import { saveStory } from "./log.js";
import type { CivState } from "./types.js";

const DISCORD_CHUNK = 1900;

export function chronicle(state: CivState): string {
  const people = Object.values(state.participants)
    .map(
      (p) =>
        `${p.displayName}${p.dead ? " (ghost)" : ""} faction=${state.factions[p.factionId ?? ""]?.name ?? "none"}`,
    )
    .join("; ");
  const factions = Object.values(state.factions)
    .map(
      (f) =>
        `${f.name}: food ${f.food}, arms ${f.arms}, land ${state.provinces.filter((p) => p.owner === f.id).length}, members ${f.memberIds.map((id) => state.participants[id]?.displayName ?? id).join(",")}`,
    )
    .join("\n");
  const ticks = state.log
    .filter((e) => e.kind === "tick" || e.kind === "lobby" || e.kind === "begin")
    .map((e) => {
      const d = e.detail as { tick?: number; lines?: string[] } | undefined;
      const lines = d?.lines?.join(" / ") ?? "";
      return `t${d?.tick ?? "?"} ${e.kind}: ${lines}`;
    })
    .join("\n");
  const awards = state.awards
    ? `chosen=${state.awards.chosen} hegemon=${state.awards.hegemon}`
    : "none yet";
  return [
    `id ${state.id} guild ${state.guildId} phase ${state.phase} ticks ${state.tick}`,
    `people: ${people || "none"}`,
    `factions:\n${factions || "none"}`,
    `awards: ${awards}`,
    `events:\n${ticks || "none"}`,
  ].join("\n");
}

export function splitStory(text: string, max = DISCORD_CHUNK): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.4) cut = rest.lastIndexOf(". ", max);
    if (cut < max * 0.4) cut = max;
    if (rest[cut] === ".") cut += 1;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function tellAge(state: CivState): Promise<string[]> {
  const source = chronicle(state);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are Aphonos. Write a readable chronicle of this Discord civilization Age.",
        "Hilarious, vulgar, short chapters. Use the real names and FACTS. Do not invent a different winner or reverse deaths.",
        "You may color scenes. Do not mention hidden decrees unless the Age is complete.",
        "Plain text. No markdown headings longer than a line. No code fences.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Turn this Book into a story.\n\n${source}`,
    },
  ];
  const client = createLlmClient();
  const res = await client.chat.completions.create({
    model: llmModel(),
    messages,
    max_tokens: 4000,
    ...llmExtrasOff(),
  } as never);
  const story =
    res.choices[0]?.message?.content?.trim() || "The Book is blank.";
  await saveStory(state.id, story);
  return splitStory(story);
}
