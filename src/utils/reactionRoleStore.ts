import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reaction role storage helper
 *
 * Uses a JSON file at `src/data/reaction_roles.json` so:
 * - /reactionrole command can save changes
 * - reaction handler can read current config
 *
 * File shape:
 * {
 *   "reactionRoleRules": [
 *     {
 *       "guildId": "",
 *       "channelId": "",
 *       "messageId": "",
 *       "emoji": "",
 *       "roleId": "",
 *       "removeOnUnreact": true
 *     }
 *   ]
 * }
 */

export type EmojiIdentifier = string;

export interface ReactionRoleRule {
  guildId: string;
  channelId: string;
  messageId: string;

  /**
   * Emoji identifier:
   * - Unicode emoji: store a literal like "🖋️"
   * - Custom emoji: store the numeric emoji id
   */
  emoji: EmojiIdentifier;

  roleId: string;

  /**
   * If true (default), removing the reaction removes the role.
   * If false, only add-on-react is performed.
   */
  removeOnUnreact?: boolean;
}

export interface ReactionRoleStoreShape {
  reactionRoleRules: ReactionRoleRule[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "reaction_roles.json",
);

const DEFAULT_STORE: ReactionRoleStoreShape = {
  reactionRoleRules: [],
};

let cachedPath: string | null = null;
let cachedStore: ReactionRoleStoreShape | null = null;
const rulesByMessage = new Map<string, ReactionRoleRule[]>();

function setCache(storePath: string, store: ReactionRoleStoreShape): void {
  cachedPath = storePath;
  cachedStore = store;
  rulesByMessage.clear();
  for (const rule of store.reactionRoleRules) {
    const list = rulesByMessage.get(rule.messageId);
    if (list) list.push(rule);
    else rulesByMessage.set(rule.messageId, [rule]);
  }
}

function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && /^\d{15,25}$/.test(value);
}

function isReactionRoleRule(value: unknown): value is ReactionRoleRule {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<ReactionRoleRule>;

  if (!isSnowflake(r.guildId)) return false;
  if (!isSnowflake(r.channelId)) return false;
  if (!isSnowflake(r.messageId)) return false;
  if (typeof r.emoji !== "string" || r.emoji.trim().length === 0) return false;
  if (!isSnowflake(r.roleId)) return false;

  if (
    r.removeOnUnreact !== undefined &&
    typeof r.removeOnUnreact !== "boolean"
  ) {
    return false;
  }

  return true;
}

function normalizeStoreShape(value: unknown): ReactionRoleStoreShape {
  if (!value || typeof value !== "object") return { ...DEFAULT_STORE };

  const obj = value as Partial<ReactionRoleStoreShape>;
  const rules = Array.isArray(obj.reactionRoleRules)
    ? obj.reactionRoleRules
    : [];

  const normalizedRules: ReactionRoleRule[] = [];
  for (const rule of rules) {
    if (!isReactionRoleRule(rule)) continue;

    normalizedRules.push({
      guildId: rule.guildId,
      channelId: rule.channelId,
      messageId: rule.messageId,
      emoji: rule.emoji.trim(),
      roleId: rule.roleId,
      removeOnUnreact: rule.removeOnUnreact ?? true,
    });
  }

  return { reactionRoleRules: normalizedRules };
}

function ensureStoreFileExists(storePath: string): void {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
  }
}

export function getReactionRoleStorePath(): string {
  return DEFAULT_STORE_PATH;
}

/**
 * Reads and validates the JSON store from disk.
 * On any parse or validation issues, it returns a safe default shape instead of throwing.
 */
export function readReactionRoleStore(
  storePath: string = DEFAULT_STORE_PATH,
): ReactionRoleStoreShape {
  if (cachedStore && cachedPath === storePath) return cachedStore;

  try {
    ensureStoreFileExists(storePath);
    const store = normalizeStoreShape(
      JSON.parse(fs.readFileSync(storePath, "utf8")) as unknown,
    );
    setCache(storePath, store);
    return store;
  } catch {
    return { ...DEFAULT_STORE };
  }
}

/**
 * Writes the provided store shape to disk atomically-ish (writeFileSync).
 * The input is also normalized before writing.
 */
export function writeReactionRoleStore(
  store: ReactionRoleStoreShape,
  storePath: string = DEFAULT_STORE_PATH,
): void {
  ensureStoreFileExists(storePath);

  const normalized = normalizeStoreShape(store);
  fs.writeFileSync(
    storePath,
    JSON.stringify(normalized, null, 2) + "\n",
    "utf8",
  );
  setCache(storePath, normalized);
}

/**
 * Get all rules, optionally scoped to a guild.
 */
export function getReactionRoleRules(params?: {
  storePath?: string;
  guildId?: string;
}): ReactionRoleRule[] {
  const store = readReactionRoleStore(params?.storePath ?? DEFAULT_STORE_PATH);
  const all = store.reactionRoleRules;

  if (!params?.guildId) return all;
  return all.filter((r) => r.guildId === params.guildId);
}

/**
 * Add a rule if it doesn't already exist (guild/channel/message/emoji uniqueness).
 *
 * Returns `true` if the rule was added, `false` if it already existed.
 */
export function addReactionRoleRule(
  rule: ReactionRoleRule,
  params?: { storePath?: string },
): boolean {
  const storePath = params?.storePath ?? DEFAULT_STORE_PATH;
  const store = readReactionRoleStore(storePath);

  const normalizedRule: ReactionRoleRule = {
    guildId: rule.guildId,
    channelId: rule.channelId,
    messageId: rule.messageId,
    emoji: rule.emoji.trim(),
    roleId: rule.roleId,
    removeOnUnreact: rule.removeOnUnreact ?? true,
  };

  const key = reactionRoleRuleKey(normalizedRule);
  const exists = store.reactionRoleRules.some(
    (r) => reactionRoleRuleKey(r) === key,
  );
  if (exists) return false;

  writeReactionRoleStore(
    { reactionRoleRules: [...store.reactionRoleRules, normalizedRule] },
    storePath,
  );
  return true;
}

/**
 * Remove a rule by identity fields.
 *
 * Returns `true` if a rule was removed.
 */
export function removeReactionRoleRule(
  ident: Pick<
    ReactionRoleRule,
    "guildId" | "channelId" | "messageId" | "emoji"
  >,
  params?: { storePath?: string },
): boolean {
  const storePath = params?.storePath ?? DEFAULT_STORE_PATH;
  const store = readReactionRoleStore(storePath);

  const emoji = ident.emoji.trim();
  const next = store.reactionRoleRules.filter((r) => {
    if (r.guildId !== ident.guildId) return true;
    if (r.channelId !== ident.channelId) return true;
    if (r.messageId !== ident.messageId) return true;
    if (r.emoji !== emoji) return true;
    return false;
  });

  if (next.length === store.reactionRoleRules.length) return false;
  writeReactionRoleStore({ reactionRoleRules: next }, storePath);
  return true;
}

export function hasReactionRoleMessage(
  messageId: string,
  storePath: string = DEFAULT_STORE_PATH,
): boolean {
  readReactionRoleStore(storePath);
  return rulesByMessage.has(messageId);
}

export function findMatchingReactionRoleRules(params: {
  guildId: string;
  channelId: string;
  messageId: string;
  emojiNameOrId: string | null;
  storePath?: string;
}): ReactionRoleRule[] {
  const { guildId, channelId, messageId, emojiNameOrId } = params;
  if (!emojiNameOrId) return [];

  readReactionRoleStore(params.storePath ?? DEFAULT_STORE_PATH);
  const rules = rulesByMessage.get(messageId);
  if (!rules) return [];
  return rules.filter(
    (r) =>
      r.guildId === guildId &&
      r.channelId === channelId &&
      r.emoji === emojiNameOrId,
  );
}

export function reactionRoleRuleKey(
  r: Pick<ReactionRoleRule, "guildId" | "channelId" | "messageId" | "emoji">,
): string {
  return `${r.guildId}:${r.channelId}:${r.messageId}:${r.emoji}`;
}

/**
 * Normalizes emoji input from a command option:
 * - `<:name:id>` / `<a:name:id>` -> returns `"id"`
 * - otherwise returns trimmed input
 */
export function normalizeEmojiInput(raw: string): string {
  const s = raw.trim();
  const mentionMatch = s.match(/^<a?:\w+:(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  return s;
}
