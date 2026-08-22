export const CIV_OWNER_ID = "380694434980954114";
export const CIV_COLOR = "#6B21A8";
export const CIV_ABORT_COLOR = "#8B0000";
export const TICK_MS = 10_000;
export const MAX_TICKS = 180;
export const REGENCY_SILENT = 18;
export const WORLD_EVERY = 6;
export const INTENTS_PER_USER = 2;
export const MAX_FACTIONS = 4;

export type Terrain = "plain" | "waste" | "coast" | "high" | "grove";
export type Development =
  | "empty"
  | "farm"
  | "fort"
  | "temple"
  | "workshop"
  | "walls";
export type CivPhase =
  | "factions"
  | "live"
  | "paused"
  | "complete"
  | "aborted";
export type CivPlayPhase = "factions" | "live";
export type Band = "dawn" | "strife" | "dusk";
export type DecreeId = "pious" | "last" | "blood" | "strong" | "compact";
export type IntentKind =
  | "found"
  | "join"
  | "leave"
  | "settle"
  | "build"
  | "muster"
  | "march"
  | "deal"
  | "decree"
  | "pray"
  | "eat"
  | "spy"
  | "annex"
  | "recruit"
  | "enslave"
  | "free"
  | "speak";
export type DealKind = "merge" | "trade" | "nap";
export type DecreeKind = "festival" | "conscript" | "rations" | "kick";
export type KinType = "spouse" | "parent" | "sibling";
export type SoftClaimKind = "spouse-settle" | "heir-found";

export const DECREES: DecreeId[] = [
  "pious",
  "last",
  "blood",
  "strong",
  "compact",
];

export interface Province {
  id: string;
  name: string;
  epithet: string;
  terrain: Terrain;
  neighbors: string[];
  owner: string | null;
  development: Development;
  garrison: number;
}

export interface Participant {
  userId: string;
  displayName: string;
  aura: number;
  factionId: string | null;
  joinedTick: number;
  silentTicks: number;
  dead?: boolean;
  killedBy?: string;
  bond?: "slave";
}

export interface Faction {
  id: string;
  name: string;
  founderId: string;
  memberIds: string[];
  capital: string | null;
  food: number;
  material: number;
  faith: number;
  arms: number;
  pop: number;
  unrest: number;
  marchesWon: number;
  dealsHonored: number;
  dealsBroken: number;
}

export interface KinEdge {
  a: string;
  b: string;
  type: KinType;
}

export interface SoftClaim {
  provinceId: string;
  untilTick: number;
  kind: SoftClaimKind;
  userId: string;
  factionId?: string;
}

export interface PlayerIntent {
  userId: string;
  kind: IntentKind;
  target?: string;
  note?: string;
}

export interface Invention {
  userId?: string;
  line: string;
  food?: number;
  arms?: number;
  pop?: number;
  unrest?: number;
  faith?: number;
  material?: number;
  absorb?: string;
}

export interface ChatLine {
  userId: string;
  displayName: string;
  content: string;
}

export interface TickResult {
  tick: number;
  lines: string[];
  omen?: string;
  winnerFactionId?: string;
  joins: string[];
}

export interface CivAwards {
  chosen?: string;
  hegemon?: string;
  priest?: string;
  warmonger?: string;
  kinRight?: string;
  fallen?: string;
}

export interface CivLogEntry {
  at: string;
  kind: string;
  detail?: unknown;
}

export interface CivState {
  id: string;
  guildId: string;
  channelId: string;
  createdAt: string;
  updatedAt: string;
  phase: CivPhase;
  resumePhase?: CivPlayPhase;
  tick: number;
  decree: DecreeId;
  factionsFounded: number;
  firstFallenFactionId: string | null;
  spawnQueue: string[];
  provinces: Province[];
  participants: Record<string, Participant>;
  factions: Record<string, Faction>;
  claims: SoftClaim[];
  successionOmenDone: string[];
  log: CivLogEntry[];
  lastLines: string[];
  awards?: CivAwards;
}

export interface CivLogFile {
  version: 1;
  active: Record<string, CivState>;
  history: CivState[];
}

export function bandFor(tick: number): Band {
  if (tick <= 8) return "dawn";
  if (tick <= 18) return "strife";
  return "dusk";
}
