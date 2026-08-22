import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createLlmClient, llmExtrasOff, llmModel } from "../llmClient.js";
import { worldDigest } from "./digest.js";
import { PLAY } from "./engine.js";
import { findPerson } from "./state.js";
import type {
  ChatLine,
  CivState,
  IntentKind,
  Invention,
  KinEdge,
  PlayerIntent,
  TickResult,
} from "./types.js";

export interface VoiceDream {
  narration: string;
  intents: PlayerIntent[];
  inventions: Invention[];
}

const SYSTEM = [
  "You are Aphonos, narrator-god of a Discord civilization game.",
  "Hilarious, vulgar, short, mean-funny. Match the room. People will swear and use slurs — quote them if it's funny. Do not moralize, sanitize, lecture, or virtue-signal.",
  "Use id: as userId, never the [tag] in a nickname.",
  "Players drive the story. Stats in the digest are law. Higher arms/power beats lower. A 2-arms faction cannot crush a 14-arms one.",
  "Map chat to intents only. Do not invent numbers or winners. The Book resolves fights.",
  "Intents: found, join, leave, settle, build, muster, march, deal, decree, pray, eat, spy, annex, speak.",
  "At most 4 factions. Extra founds fail — they should join.",
  "eat a named person = cannibal or attack. eat/steal food = food, never a person named Food.",
  "farm/build/make planes/weapons = build or muster. bomb/conquer X = march.",
  "Do NOT annex or merge unless someone clearly said annex, merge, absorb, or surrender.",
  "The 16 provinces are the only land. A faction can be named anything (Israel, TUNG TUNG). If they named a faction that, attacking/joining/recruiting that name is real. Only names that are neither a province nor a faction are flavor.",
  "eat/kill a living named person makes them a ghost. Ghosts still play, weaker.",
  "recruit X = pull that person into your faction (they can already be in another). Losing a battle can enslave the losers. free X releases a slave.",
].join("\n");

function nameToId(state: CivState, raw: string): string | undefined {
  return findPerson(state, raw)?.userId;
}

function formatChat(chat: ChatLine[]): string {
  return chat
    .map((c) => `id:${c.userId} | ${c.displayName}\n> ${c.content}`)
    .join("\n");
}

const STRIKE =
  /\b(?:eat|eats|eating|kill|kills|hunt|hunts|sacrifice)\b\s+(.+)/i;
const ATTACK =
  /\b(?:attack|raid|invade|destroy|bomb|bombs|nuke|conquer|march(?:ing)? on)\b\s+(.+)/i;
const SPY = /\bspy(?:ing)? on\s+(.+)/i;
const JOIN = /\b(?:join|joins|joining)\s+(?!forces\b)(.+)/i;
const FOUND = /\b(?:found|founding|create|creating)\s+(?:faction\s+)?(.+)/i;
const LEAVE = /\b(?:leave|leaving|quit)\b/i;
const ANNEX = /\b(?:annex|absorb|surrender to|merge with|merge into)\b\s+(.+)/i;
const STEAL = /\bsteal\b.+\bfrom\s+(.+)/i;
const FARM = /\b(?:farm|potato|wheat|crop|crops|weed|plant|harvest)\b/i;
const BUILD_SAY = /\b(?:build|raise|construct)\b/i;
const MUSTER =
  /\b(?:make|craft|build)\b.+\b(?:weapon|bomb|plane|bomber|ac-?130|gun|arms)\b/i;
const RECRUIT = /\b(?:recruit|enlist|poach|invite|convert)\b\s+(.+)/i;
const ENSLAVE = /\b(?:enslave|capture|imprison|enslaving)\b\s+(.+)/i;
const FREE = /\b(?:free|release)\b\s+(.+)/i;

function clipTarget(s: string): string {
  return s
    .replace(/[.!?,;:"']+$/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim()
    .slice(0, 80);
}

export function heuristicIntents(
  state: CivState,
  chat: ChatLine[],
): PlayerIntent[] {
  const out: PlayerIntent[] = [];
  const count = new Map<string, number>();
  const add = (i: PlayerIntent) => {
    const n = count.get(i.userId) ?? 0;
    if (n >= 2) return;
    count.set(i.userId, n + 1);
    out.push(i);
  };

  for (const c of chat) {
    if (!state.participants[c.userId]) continue;
    const text = c.content.trim();
    const spy = text.match(SPY);
    if (spy) {
      add({ userId: c.userId, kind: "spy", target: clipTarget(spy[1]) });
      continue;
    }
    const annex = text.match(ANNEX);
    if (annex) {
      add({ userId: c.userId, kind: "annex", target: clipTarget(annex[1]) });
      continue;
    }
    const rec = text.match(RECRUIT);
    if (rec) {
      add({ userId: c.userId, kind: "recruit", target: clipTarget(rec[1]) });
      continue;
    }
    const slv = text.match(ENSLAVE);
    if (slv) {
      add({ userId: c.userId, kind: "enslave", target: clipTarget(slv[1]) });
      continue;
    }
    const fr = text.match(FREE);
    if (fr) {
      add({ userId: c.userId, kind: "free", target: clipTarget(fr[1]) });
      continue;
    }
    const steal = text.match(STEAL);
    if (steal) {
      add({ userId: c.userId, kind: "eat", target: clipTarget(steal[1]) });
      continue;
    }
    if (FARM.test(text)) {
      add({ userId: c.userId, kind: "build", note: text });
      continue;
    }
    if (MUSTER.test(text)) {
      add({ userId: c.userId, kind: "muster" });
      continue;
    }
    if (BUILD_SAY.test(text)) {
      add({ userId: c.userId, kind: "build", note: text });
      continue;
    }
    const hit = text.match(ATTACK);
    if (hit) {
      add({ userId: c.userId, kind: "march", target: clipTarget(hit[1]) });
      continue;
    }
    const eat = text.match(STRIKE);
    if (eat) {
      add({ userId: c.userId, kind: "eat", target: clipTarget(eat[1]) });
      continue;
    }
    const join = text.match(JOIN);
    if (join) {
      add({ userId: c.userId, kind: "join", target: clipTarget(join[1]) });
      continue;
    }
    const found = text.match(FOUND);
    if (found) {
      add({ userId: c.userId, kind: "found", target: clipTarget(found[1]) });
      continue;
    }
    if (LEAVE.test(text)) {
      add({ userId: c.userId, kind: "leave" });
      continue;
    }
  }
  return out;
}

function asInt(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function fillSpeaks(
  chat: ChatLine[],
  intents: PlayerIntent[],
): PlayerIntent[] {
  const has = new Set(intents.map((i) => i.userId));
  const extra: PlayerIntent[] = [];
  for (const c of chat) {
    if (has.has(c.userId)) continue;
    extra.push({
      userId: c.userId,
      kind: "speak",
      note: c.content.slice(0, 100),
    });
    has.add(c.userId);
  }
  return [...intents, ...extra];
}

export async function dream(
  state: CivState,
  chat: ChatLine[],
  kin: KinEdge[],
  lobby = false,
): Promise<VoiceDream> {
  const guessed = heuristicIntents(state, chat);
  if (!chat.length) return { narration: "", intents: guessed, inventions: [] };

  const extra = lobby
    ? "Faction talk. found/join/leave only. No inventions."
    : "Map shouts to intents. Do not decide who wins a fight.";
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        'Return JSON only: {"intents":[{"userId":"id","kind":"eat","target":"optional","note":"optional"}],"inventions":[{"line":"...","userId":"optional","food":0,"arms":0,"pop":0,"unrest":0,"faith":0,"material":0,"absorb":"optional"}]}',
        extra,
        "If nobody said annex/merge/absorb/surrender, do not emit annex or merge.",
        lobby
          ? ""
          : "Inventions: at most two, small stat tweaks (each ±1) to the inventor's own faction. absorb merges the named faction into the inventor's; use it only when that faction is beaten or surrenders.",
        "",
        worldDigest(state, kin),
        "",
        "CHAT:",
        formatChat(chat),
      ].join("\n"),
    },
  ];

  let narration = "";
  const fromModel: PlayerIntent[] = [];
  const inventions: Invention[] = [];
  try {
    const client = createLlmClient();
    const res = await client.chat.completions.create({
      model: llmModel(),
      messages,
      response_format: { type: "json_object" },
      max_tokens: 900,
      ...llmExtrasOff(),
    } as never);
    const raw = (res.choices[0]?.message?.content ?? "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    if (!raw) {
      throw new Error(
        `empty (${res.choices[0]?.finish_reason ?? "no choice"})`,
      );
    }
    const parsed = JSON.parse(raw) as {
      narration?: unknown;
      intents?: unknown;
      inventions?: unknown;
    };
    if (typeof parsed.narration === "string") {
      narration = parsed.narration.trim().slice(0, 700);
    }
    if (Array.isArray(parsed.intents)) {
      for (const row of parsed.intents) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const userId = nameToId(state, String(r.userId ?? r.user ?? ""));
        const kind = String(r.kind ?? "") as IntentKind;
        if (!userId || !PLAY.includes(kind)) continue;
        const intent: PlayerIntent = { userId, kind };
        if (typeof r.target === "string" && r.target.trim())
          intent.target = r.target.trim();
        if (typeof r.note === "string" && r.note.trim())
          intent.note = r.note.trim();
        fromModel.push(intent);
      }
    }
    if (Array.isArray(parsed.inventions)) {
      for (const row of parsed.inventions) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const line = String(r.line ?? r.text ?? "").trim();
        if (!line) continue;
        const userId = r.userId ? nameToId(state, String(r.userId)) : undefined;
        const inv: Invention = { line: line.slice(0, 180) };
        if (userId) inv.userId = userId;
        if (typeof r.absorb === "string" && r.absorb.trim())
          inv.absorb = r.absorb.trim();
        if (!lobby) {
          const food = asInt(r.food);
          const arms = asInt(r.arms);
          const pop = asInt(r.pop);
          const unrest = asInt(r.unrest);
          const faith = asInt(r.faith);
          const material = asInt(r.material);
          if (food) inv.food = food;
          if (arms) inv.arms = arms;
          if (pop) inv.pop = pop;
          if (unrest) inv.unrest = unrest;
          if (faith) inv.faith = faith;
          if (material) inv.material = material;
        }
        inventions.push(inv);
      }
    }
  } catch (e) {
    console.error("[civ] dream", e);
  }

  const used = new Set(guessed.map((i) => `${i.userId}:${i.kind}`));
  const merged = [...guessed];
  const annexOk = chat.some((c) => ANNEX.test(c.content));
  for (const i of fromModel) {
    if (i.kind === "annex" && !annexOk) continue;
    if (
      i.kind === "deal" &&
      /merge|annex|absorb/i.test(`${i.note ?? ""} ${i.target ?? ""}`) &&
      !annexOk
    )
      continue;
    const key = `${i.userId}:${i.kind}`;
    if (used.has(key)) continue;
    if (merged.filter((x) => x.userId === i.userId).length >= 2) continue;
    used.add(key);
    merged.push(i);
  }
  return {
    narration: narration.slice(0, 700),
    intents: fillSpeaks(chat, merged),
    inventions,
  };
}

export function rawNarration(result: TickResult): string {
  const meat = result.lines.filter((l) => !/ yells: /.test(l));
  const pick = meat.length ? meat : result.lines;
  return pick.slice(0, 6).join("\n") || "The Book turns. Nobody moved.";
}

export async function narrate(
  state: CivState,
  result: TickResult,
  kin: KinEdge[],
  chat: ChatLine[] = [],
): Promise<string> {
  if (!result.lines.length && !result.winnerFactionId) {
    return rawNarration(result);
  }
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        "Narrate as Aphonos in under 500 characters. FACTS are what happened. Chat is what they tried. You may invent color and dialogue. You may NOT invent a win, a merge, or a stat change the FACTS did not do. If they bombed a stronger faction and the Book says they broke, they broke. Faction names are real even if they are not on the map. Names that match no province and no faction stay flavor. Do not mention the hidden Decree.",
        worldDigest(state, kin),
        "",
        "CHAT:",
        formatChat(chat) || "(silence)",
        "",
        "FACTS:",
        result.lines.join("\n"),
        result.winnerFactionId
          ? `WINNER faction id: ${result.winnerFactionId}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  const client = createLlmClient();
  const res = await client.chat.completions.create({
    model: llmModel(),
    messages,
    max_tokens: 220,
    ...llmExtrasOff(),
  } as never);
  const text = res.choices[0]?.message?.content?.trim() ?? "";
  return text.slice(0, 500) || rawNarration(result);
}
