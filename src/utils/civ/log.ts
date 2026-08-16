import fs from "fs/promises";
import path from "path";
import type { CivLogFile, CivState } from "./types.js";

const CIV_DIR = path.join(process.cwd(), "data", "civ");
const AGES_DIR = path.join(CIV_DIR, "ages");
const LIVE_PATH = path.join(CIV_DIR, "live.json");
const LEGACY_PATH = path.join(process.cwd(), "data", "civilization.json");

let writing = false;

async function withLock<T>(task: () => Promise<T>): Promise<T> {
  while (writing) {
    await new Promise((r) => setTimeout(r, 50));
  }
  writing = true;
  try {
    return await task();
  } finally {
    writing = false;
  }
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_") || "age";
}

export function ageFilePath(id: string): string {
  return path.join(AGES_DIR, `${safeId(id)}.json`);
}

export function storyFilePath(id: string): string {
  return path.join(AGES_DIR, `${safeId(id)}.story.md`);
}

interface LiveIndex {
  version: 1;
  byGuild: Record<string, string>;
}

function emptyLive(): LiveIndex {
  return { version: 1, byGuild: {} };
}

async function readLive(): Promise<LiveIndex> {
  try {
    const raw = await fs.readFile(LIVE_PATH, "utf-8");
    return JSON.parse(raw) as LiveIndex;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyLive();
    throw e;
  }
}

async function writeLive(live: LiveIndex): Promise<void> {
  await fs.mkdir(CIV_DIR, { recursive: true });
  await fs.writeFile(LIVE_PATH, JSON.stringify(live, null, 2));
}

export async function writeAge(state: CivState): Promise<void> {
  await fs.mkdir(AGES_DIR, { recursive: true });
  await fs.writeFile(ageFilePath(state.id), JSON.stringify(state, null, 2));
}

export async function loadAge(id: string): Promise<CivState | undefined> {
  try {
    const raw = await fs.readFile(ageFilePath(id), "utf-8");
    return JSON.parse(raw) as CivState;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

export async function listAges(guildId?: string): Promise<CivState[]> {
  try {
    const names = await fs.readdir(AGES_DIR);
    const out: CivState[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(AGES_DIR, name), "utf-8");
      const s = JSON.parse(raw) as CivState;
      if (!guildId || s.guildId === guildId) out.push(s);
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function latestAge(guildId: string): Promise<CivState | undefined> {
  const all = await listAges(guildId);
  return all[0];
}

export async function saveActiveCiv(state: CivState): Promise<void> {
  await withLock(async () => {
    await writeAge(state);
    const live = await readLive();
    live.byGuild[state.guildId] = state.id;
    await writeLive(live);
  });
}

export async function archiveCiv(state: CivState): Promise<void> {
  await withLock(async () => {
    await writeAge(state);
    const live = await readLive();
    if (live.byGuild[state.guildId] === state.id) {
      delete live.byGuild[state.guildId];
      await writeLive(live);
    }
  });
}

export async function loadActiveCivs(): Promise<CivState[]> {
  await migrateLegacy();
  const live = await readLive();
  const out: CivState[] = [];
  for (const id of Object.values(live.byGuild)) {
    const s = await loadAge(id);
    if (s) out.push(s);
  }
  return out;
}

export async function purgeCivGuild(guildId: string): Promise<void> {
  await withLock(async () => {
    const live = await readLive();
    const id = live.byGuild[guildId];
    delete live.byGuild[guildId];
    await writeLive(live);
    const ages = await listAges(guildId);
    for (const s of ages) {
      await fs.unlink(ageFilePath(s.id)).catch(() => undefined);
      await fs.unlink(storyFilePath(s.id)).catch(() => undefined);
    }
    if (id) {
      await fs.unlink(ageFilePath(id)).catch(() => undefined);
    }
  });
}

export async function saveStory(id: string, text: string): Promise<void> {
  await fs.mkdir(AGES_DIR, { recursive: true });
  await fs.writeFile(storyFilePath(id), text);
}

let migrated = false;

async function migrateLegacy(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const raw = await fs.readFile(LEGACY_PATH, "utf-8");
    const file = JSON.parse(raw) as CivLogFile;
    await fs.mkdir(AGES_DIR, { recursive: true });
    const live = await readLive();
    for (const s of Object.values(file.active ?? {})) {
      await writeAge(s);
      live.byGuild[s.guildId] = s.id;
    }
    for (const s of file.history ?? []) {
      await writeAge(s);
    }
    await writeLive(live);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
