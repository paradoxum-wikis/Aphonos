import { power } from "./engine.js";
import { kinLine } from "./family.js";
import { ownedBy } from "./state.js";
import { bandFor, type CivState, type KinEdge } from "./types.js";

export function worldDigest(state: CivState, kin: KinEdge[]): string {
  const houses = Object.values(state.factions).map((f) => {
    const land = ownedBy(state, f.id)
      .map((p) => p.name)
      .join(", ");
    const members = f.memberIds
      .map((id) => state.participants[id]?.displayName ?? id)
      .join(", ");
    const neighbors = [
      ...new Set(
        ownedBy(state, f.id).flatMap((p) =>
          p.neighbors
            .map((id) => state.provinces.find((x) => x.id === id))
            .filter((x) => x && x.owner !== f.id)
            .map((x) => (x!.owner ? `${x!.name} (${x!.owner})` : x!.name)),
        ),
      ),
    ].join(", ");
    return `${f.name} [${f.id}] members=${members} capital=${f.capital ?? "none"} land=${land || "none"} food=${f.food} mat=${f.material} faith=${f.faith} arms=${f.arms} pop=${f.pop} unrest=${f.unrest} power=${power(state, f).toFixed(1)} neighbors=${neighbors || "-"}`;
  });
  const people = Object.values(state.participants)
    .map(
      (p) =>
        `${p.displayName} id:${p.userId} faction=${p.factionId ?? "none"}${p.dead ? " GHOST" : ""}${p.bond === "slave" ? " SLAVE" : ""}`,
    )
    .join("; ");
  const unaff = Object.values(state.participants)
    .filter((p) => !p.factionId)
    .map((p) => `${p.displayName} [${p.userId}]`)
    .join("; ");
  const names = (id: string) => state.participants[id]?.displayName ?? id;
  return [
    `tick ${state.tick} ${bandFor(state.tick)}`,
    houses.join("\n") || "(no factions)",
    `people: ${people || "none"}`,
    `unaffiliated: ${unaff || "none"}`,
    `kin: ${kin.map((k) => kinLine(k, names)).join("; ") || "none"}`,
    `recent: ${state.lastLines.join(" / ") || "none"}`,
  ].join("\n");
}

export function bookSig(state: CivState): string {
  const land = state.provinces
    .map((p) => `${p.id}:${p.owner ?? ""}:${p.development}`)
    .join(",");
  const people = Object.values(state.participants)
    .map(
      (p) =>
        `${p.userId}:${p.factionId ?? ""}:${p.dead ? 1 : 0}:${p.bond ?? ""}`,
    )
    .join(",");
  const facs = Object.keys(state.factions).sort().join(",");
  return `${state.phase}|${facs}|${land}|${people}`;
}

export function recapLines(state: CivState): string[] {
  return Object.values(state.factions).map((f) => {
    const members = f.memberIds
      .map((id) => state.participants[id]?.displayName ?? id)
      .join(", ");
    if (state.phase === "factions") {
      return `**${f.name}** - ${members || "empty"}`;
    }
    const land = ownedBy(state, f.id).length;
    return `**${f.name}** - ${members} · ${land} land · pop ${f.pop} · food ${f.food} · arms ${f.arms} · faith ${f.faith}`;
  });
}

export function deadLine(state: CivState): string {
  const dead = Object.values(state.participants).filter((p) => p.dead);
  if (!dead.length) return "";
  return `Ghosts: ${dead.map((p) => p.displayName).join(", ")}`;
}

export function playerRoll(state: CivState): string[] {
  const best = (
    key: "farmed" | "gathered" | "killed" | "enslaved",
    label: string,
  ): string | undefined => {
    let win: { name: string; n: number } | undefined;
    for (const p of Object.values(state.participants)) {
      const n = p[key] ?? 0;
      if (n > (win?.n ?? 0)) win = { name: p.displayName, n };
    }
    return win ? `${win.name} ${label} (${win.n})` : undefined;
  };
  return [
    best("farmed", "farmed the most"),
    best("gathered", "gathered the most"),
    best("killed", "killed the most"),
    best("enslaved", "enslaved the most"),
  ].filter((s): s is string => !!s);
}
