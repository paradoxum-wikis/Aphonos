import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import type { RefereeArcanaId } from "./types.js";
import { COLOR } from "./ui.js";

const ASSET_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export type ArcanaArtId =
  RefereeArcanaId | "star" | "justice" | "judgement" | "world";

export const ARCANA_FULL_NAME: Record<ArcanaArtId, string> = {
  fool: "The Fool",
  empress: "The Empress",
  emperor: "The Emperor",
  wheel: "Wheel of Fortune",
  death: "Death",
  tower: "The Tower",
  star: "The Star",
  justice: "Justice",
  judgement: "Judgement",
  world: "The World",
};

export function arcanaFullName(id: ArcanaArtId): string {
  return ARCANA_FULL_NAME[id];
}

export const ARCANA_EFFECT: Record<ArcanaArtId, string> = {
  fool: "If a combatant dodges a hit that would otherwise kill them, part of that damage bounces to the attacker.",
  empress:
    "Every few turns, the combatant with more HP left gets an ATK buff (later also SPD/DEF).",
  emperor:
    "Every few turns, whoever dealt more damage in that window gets a free extra turn.",
  wheel:
    "Every few turns, combatants swap abilities (later also random stats, and even full rerolls).",
  death:
    "Combatant who dies first revives at 1 HP with a SPD boost, abilities locked. Second death is final.",
  tower:
    "Every 6 turns, a random combatant takes true damage (can't dodge/block). Can silence abilities later.",
  star: "Each block gives the blocker +1 DEF for the rest of the game.",
  justice: "Both combatants have 100% aura for this series.",
  judgement:
    "Every 4 turns, anyone who has dealt zero direct damage that window has current HP cut in half.",
  world:
    "All referee Arcanas + all prior round Arcanas are activated. Both fighters have their HP quadrupled.",
};

export function arcanaFilename(id: ArcanaArtId): string {
  return `arcana-${id}.png`;
}

function resolvePath(id: ArcanaArtId): string {
  const name = arcanaFilename(id);
  const p = path.join(ASSET_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`Missing ${name}`);
  return p;
}

export function arcanaAttachment(id: ArcanaArtId): AttachmentBuilder {
  const name = arcanaFilename(id);
  return new AttachmentBuilder(resolvePath(id), { name });
}

export function arcanaImageUrl(id: ArcanaArtId): string {
  return `attachment://${arcanaFilename(id)}`;
}

export function arcanaCardEmbed(id: ArcanaArtId): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR.neutral)
    .setTitle(arcanaFullName(id))
    .setDescription(ARCANA_EFFECT[id])
    .setThumbnail(arcanaImageUrl(id));
}
