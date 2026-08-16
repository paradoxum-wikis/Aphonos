import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export interface FamilyRelationship {
  userId: string;
  relationshipType: "spouse" | "parent" | "child" | "sibling";
  relatedUserId: string;
  establishedAt: string;
  guildId: string;
}

export interface FamilyData {
  relationships: FamilyRelationship[];
}

export interface FamilyGraph {
  memberIds: string[];
  parents: [string, string][];
  spouses: [string, string][];
  siblings: [string, string][];
}

export class FamilyManager {
  private static readonly DATA_DIR = "data";
  private static readonly FAMILY_FILE = `${this.DATA_DIR}/family.json`;

  private static async ensureDataDir(): Promise<void> {
    if (!existsSync(this.DATA_DIR)) {
      await mkdir(this.DATA_DIR, { recursive: true });
    }
  }

  private static async loadData(): Promise<FamilyData> {
    await this.ensureDataDir();

    if (!existsSync(this.FAMILY_FILE)) {
      return { relationships: [] };
    }

    const data = await readFile(this.FAMILY_FILE, "utf-8");
    return JSON.parse(data);
  }

  private static async saveData(data: FamilyData): Promise<void> {
    await this.ensureDataDir();
    await writeFile(this.FAMILY_FILE, JSON.stringify(data, null, 2));
  }

  public static async getUserRelationships(
    userId: string,
  ): Promise<FamilyRelationship[]> {
    const data = await this.loadData();
    return data.relationships.filter(
      (rel) => rel.userId === userId || rel.relatedUserId === userId,
    );
  }

  public static async getRelationship(
    userId: string,
    relatedUserId: string,
    type: FamilyRelationship["relationshipType"],
  ): Promise<FamilyRelationship | null> {
    const data = await this.loadData();
    return (
      data.relationships.find(
        (rel) =>
          rel.userId === userId &&
          rel.relatedUserId === relatedUserId &&
          rel.relationshipType === type,
      ) || null
    );
  }

  public static async hasRelationship(
    userId: string,
    relatedUserId: string,
  ): Promise<boolean> {
    const data = await this.loadData();
    return data.relationships.some(
      (rel) =>
        (rel.userId === userId && rel.relatedUserId === relatedUserId) ||
        (rel.userId === relatedUserId && rel.relatedUserId === userId),
    );
  }

  public static async getSpouses(userId: string): Promise<string[]> {
    const data = await this.loadData();
    const spouses = new Set<string>();

    for (const rel of data.relationships) {
      if (rel.relationshipType === "spouse") {
        if (rel.userId === userId) {
          spouses.add(rel.relatedUserId);
        } else if (rel.relatedUserId === userId) {
          spouses.add(rel.userId);
        }
      }
    }

    return Array.from(spouses);
  }

  public static async getChildren(userId: string): Promise<string[]> {
    const data = await this.loadData();
    return data.relationships
      .filter(
        (rel) => rel.relationshipType === "parent" && rel.userId === userId,
      )
      .map((rel) => rel.relatedUserId);
  }

  public static async getParents(userId: string): Promise<string[]> {
    const data = await this.loadData();
    return data.relationships
      .filter(
        (rel) =>
          rel.relationshipType === "parent" && rel.relatedUserId === userId,
      )
      .map((rel) => rel.userId);
  }

  public static async getSiblings(userId: string): Promise<string[]> {
    const data = await this.loadData();
    const siblings = new Set<string>();

    for (const rel of data.relationships) {
      if (rel.relationshipType === "sibling") {
        if (rel.userId === userId) {
          siblings.add(rel.relatedUserId);
        } else if (rel.relatedUserId === userId) {
          siblings.add(rel.userId);
        }
      }
    }

    return Array.from(siblings);
  }

  public static async getFamilyGraph(userId: string): Promise<FamilyGraph> {
    const { relationships } = await this.loadData();

    const adjacency = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!adjacency.has(a)) adjacency.set(a, new Set([b]));
      else adjacency.get(a)!.add(b);
      if (!adjacency.has(b)) adjacency.set(b, new Set([a]));
      else adjacency.get(b)!.add(a);
    };
    for (const rel of relationships) link(rel.userId, rel.relatedUserId);

    const memberIds = [userId];
    const seen = new Set(memberIds);
    for (let i = 0; i < memberIds.length; i++) {
      for (const other of adjacency.get(memberIds[i]) ?? []) {
        if (!seen.has(other)) {
          seen.add(other);
          memberIds.push(other);
        }
      }
    }

    const parents = new Set<string>();
    const spouses = new Set<string>();
    const siblings = new Set<string>();
    for (const rel of relationships) {
      if (!seen.has(rel.userId) || !seen.has(rel.relatedUserId)) continue;
      if (rel.relationshipType === "parent") {
        parents.add(`${rel.userId}>${rel.relatedUserId}`);
      } else if (rel.relationshipType === "child") {
        parents.add(`${rel.relatedUserId}>${rel.userId}`);
      } else {
        const key = [rel.userId, rel.relatedUserId].sort().join("|");
        (rel.relationshipType === "spouse" ? spouses : siblings).add(key);
      }
    }

    return {
      memberIds,
      parents: [...parents].map((k) => k.split(">") as [string, string]),
      spouses: [...spouses].map((k) => k.split("|") as [string, string]),
      siblings: [...siblings].map((k) => k.split("|") as [string, string]),
    };
  }

  public static async addRelationship(
    userId: string,
    relatedUserId: string,
    type: FamilyRelationship["relationshipType"],
    guildId: string,
  ): Promise<void> {
    const data = await this.loadData();
    const now = new Date().toISOString();

    const hasExact = (
      a: string,
      b: string,
      t: FamilyRelationship["relationshipType"],
      g: string,
    ) =>
      data.relationships.some(
        (rel) =>
          rel.userId === a &&
          rel.relatedUserId === b &&
          rel.relationshipType === t &&
          rel.guildId === g,
      );

    const addExact = (
      a: string,
      b: string,
      t: FamilyRelationship["relationshipType"],
    ) => {
      if (hasExact(a, b, t, guildId)) return;

      data.relationships.push({
        userId: a,
        relatedUserId: b,
        relationshipType: t,
        establishedAt: now,
        guildId,
      });
    };

    addExact(userId, relatedUserId, type);

    if (type === "spouse" || type === "sibling") {
      addExact(relatedUserId, userId, type);
    }

    if (type === "parent") {
      addExact(relatedUserId, userId, "child");
    }

    await this.saveData(data);
  }

  public static async removeRelationship(
    userId: string,
    relatedUserId: string,
    type: FamilyRelationship["relationshipType"],
  ): Promise<void> {
    const data = await this.loadData();

    data.relationships = data.relationships.filter(
      (rel) =>
        !(
          ((rel.userId === userId && rel.relatedUserId === relatedUserId) ||
            (rel.userId === relatedUserId && rel.relatedUserId === userId)) &&
          rel.relationshipType === type
        ),
    );

    if (type === "parent") {
      data.relationships = data.relationships.filter(
        (rel) =>
          !(
            ((rel.userId === userId && rel.relatedUserId === relatedUserId) ||
              (rel.userId === relatedUserId && rel.relatedUserId === userId)) &&
            rel.relationshipType === "child"
          ),
      );
    }

    await this.saveData(data);
  }

  public static async removeAllRelationships(userId: string): Promise<void> {
    const data = await this.loadData();
    data.relationships = data.relationships.filter(
      (rel) => rel.userId !== userId && rel.relatedUserId !== userId,
    );
    await this.saveData(data);
  }
}
