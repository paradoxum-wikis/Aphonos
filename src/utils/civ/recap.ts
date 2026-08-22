import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createLlmClient, llmExtrasOff, llmModel } from "../llmClient.js";
import { saveStory } from "./log.js";
import type { CivState } from "./types.js";

const DISCORD_CHUNK = 1900;

export function chronicle(state: CivState): string {
  const who = (id?: string) =>
    (id && state.participants[id]?.displayName) || id || "?";
  const fac = (id?: string) => (id && state.factions[id]?.name) || id || "none";
  const people = Object.values(state.participants)
    .map((p) => {
      const bits = [p.displayName, `banner=${fac(p.factionId ?? undefined)}`];
      if (p.dead)
        bits.push(p.killedBy ? `ghost killedBy ${who(p.killedBy)}` : "ghost");
      if (p.bond === "slave") bits.push("slave");
      return bits.join(", ");
    })
    .join("\n");
  const factions = Object.values(state.factions)
    .map((f) => {
      const land = state.provinces.filter((p) => p.owner === f.id).length;
      return `${f.name} founder=${who(f.founderId)} members=${f.memberIds.map(who).join(",")} land=${land} food=${f.food} arms=${f.arms} faith=${f.faith} marchesWon=${f.marchesWon}`;
    })
    .join("\n");
  const ticks = state.log
    .filter(
      (e) =>
        e.kind === "tick" ||
        e.kind === "lobby" ||
        e.kind === "begin" ||
        e.kind === "complete",
    )
    .map((e) => {
      const d = e.detail as { tick?: number; lines?: string[] } | undefined;
      const lines = d?.lines?.join(" / ") ?? "";
      return `t${d?.tick ?? "?"} ${e.kind}: ${lines}`;
    })
    .join("\n");
  const a = state.awards;
  const awards = a
    ? `chosen=${fac(a.chosen)} hegemon=${fac(a.hegemon)} priest=${fac(a.priest)} warmonger=${fac(a.warmonger)} kin-right=${who(a.kinRight)} fallen=${fac(a.fallen)}`
    : "none yet";
  return [
    `phase ${state.phase} ticks ${state.tick}`,
    `people:\n${people || "none"}`,
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
        "You are Aphonos. Chronicle this Discord civilization Age.",
        "Hilarious, vulgar, short chapters. Real names. FACTS only. Do not invent a winner or reverse deaths. Do not retell the same beat twice.",
        "Keep faction titles (Chosen, Hegemon, High Priest, Warmonger, Fallen).",
        "End with a closing roll: banners first, then PEOPLE. Name players and what they did (founded X, ate Y, died to Z, enslaved, kin-right). Skip spectators. Do not credit a person unless the FACTS name them.",
        "You may color scenes. Do not mention hidden decrees unless the Age is complete.",
        "Plain text. No long headings. No code fences.",
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
  const story = res.choices[0]?.message?.content?.trim() ?? "";
  if (!story) {
    throw new Error(
      `Empty recap (${res.choices[0]?.finish_reason ?? "no choice"}).`,
    );
  }
  await saveStory(state.id, story);
  return splitStory(story);
}
