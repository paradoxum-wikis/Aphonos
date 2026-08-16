import { FamilyManager } from "../familyManager.js";
import type { KinEdge } from "./types.js";

export async function liveKin(userIds: string[]): Promise<KinEdge[]> {
  const inAge = new Set(userIds);
  const seen = new Set<string>();
  const edges: KinEdge[] = [];

  for (const id of userIds) {
    const rels = await FamilyManager.getUserRelationships(id);
    for (const rel of rels) {
      const other =
        rel.userId === id ? rel.relatedUserId : rel.userId;
      if (!inAge.has(other)) continue;

      if (rel.relationshipType === "parent") {
        const key = `parent:${rel.userId}>${rel.relatedUserId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          a: rel.userId,
          b: rel.relatedUserId,
          type: "parent",
        });
        continue;
      }
      if (rel.relationshipType === "child") continue;

      const [x, y] = [rel.userId, rel.relatedUserId].sort();
      const key = `${rel.relationshipType}:${x}|${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: x, b: y, type: rel.relationshipType });
    }
  }
  return edges;
}

export function kinLine(edge: KinEdge, nameOf: (id: string) => string): string {
  const a = nameOf(edge.a);
  const b = nameOf(edge.b);
  if (edge.type === "spouse") return `${a} married to ${b}`;
  if (edge.type === "parent") return `${a} parent of ${b}`;
  return `${a} sibling of ${b}`;
}
