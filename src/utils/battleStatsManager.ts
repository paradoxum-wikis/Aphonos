import fs from "fs/promises";
import path from "path";

let isWriting = false;

async function withFileLock<T>(task: () => Promise<T>): Promise<T> {
  while (isWriting) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  try {
    isWriting = true;
    return await task();
  } finally {
    isWriting = false;
  }
}

export interface BattleStats {
  userId: string;
  userTag: string;
  // Normal
  wins: number;
  losses: number;
  totalBattles: number;
  winRate: number;
  scoredWins: number; // casual arcana battles are excluded
  scoredTotalBattles: number;
  weightedScore: number;
  lastCasualBattleAt?: string;
  // Ranked
  rankedWins: number;
  rankedLosses: number;
  rankedTotalBattles: number;
  rankedWinRate: number;
  rankedWeightedScore: number;
  lastRankedBattleAt?: string;
}

export interface BattleRecord {
  battleId: string;
  winnerId: string;
  winnerTag: string;
  loserId: string;
  loserTag: string;
  battleDate: string;
  turns: number;
  winnerHpRemaining: number;
  winnerMaxHp: number;
  isRanked: boolean;
  guildId: string;
  arcana?: string;
}

function blankStats(userId: string, userTag: string): BattleStats {
  return {
    userId,
    userTag,
    wins: 0,
    losses: 0,
    totalBattles: 0,
    winRate: 0,
    scoredWins: 0,
    scoredTotalBattles: 0,
    weightedScore: 0,
    rankedWins: 0,
    rankedLosses: 0,
    rankedTotalBattles: 0,
    rankedWinRate: 0,
    rankedWeightedScore: 0,
  };
}

export class BattleStatsManager {
  private static readonly STATS_FILE = path.join(
    process.cwd(),
    "data",
    "battle_stats.json",
  );

  private static readonly RECORDS_FILE = path.join(
    process.cwd(),
    "data",
    "battle_records.json",
  );

  private static async ensureDataDirectory(): Promise<void> {
    const dataDir = path.dirname(this.STATS_FILE);
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }
  }

  private static async readStats(): Promise<BattleStats[]> {
    try {
      await this.ensureDataDirectory();
      const data = await fs.readFile(this.STATS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      console.error("Error reading battle stats file:", error);
      return [];
    }
  }

  private static async writeStats(stats: BattleStats[]): Promise<void> {
    await this.ensureDataDirectory();
    await fs.writeFile(this.STATS_FILE, JSON.stringify(stats, null, 2));
  }

  private static async readRecords(): Promise<BattleRecord[]> {
    try {
      await this.ensureDataDirectory();
      const data = await fs.readFile(this.RECORDS_FILE, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      console.error("Error reading battle records file:", error);
      return [];
    }
  }

  private static async writeRecords(records: BattleRecord[]): Promise<void> {
    await this.ensureDataDirectory();
    await fs.writeFile(this.RECORDS_FILE, JSON.stringify(records, null, 2));
  }

  private static calculateWinRate(wins: number, totalBattles: number): number {
    return totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;
  }

  private static calculateWeightedScore(
    wins: number,
    totalBattles: number,
  ): number {
    if (totalBattles === 0) return 0;

    const winRate = wins / totalBattles;
    const gamesFactor = 1 - Math.exp(-0.12 * totalBattles);
    const weightedScore = winRate * gamesFactor;

    return Math.round(weightedScore * 100000) / 1000;
  }

  public static async recordBattle(
    winnerId: string,
    winnerTag: string,
    loserId: string,
    loserTag: string,
    turns: number,
    winnerHpRemaining: number,
    winnerMaxHp: number,
    isRanked: boolean = false,
    guildId?: string,
    arcana?: string,
  ): Promise<void> {
    await withFileLock(async () => {
      const stats = await this.readStats();
      const records = await this.readRecords();
      const battleDate = new Date().toISOString();
      const battleId = `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const battleRecord: BattleRecord = {
        battleId,
        winnerId,
        winnerTag,
        loserId,
        loserTag,
        battleDate,
        turns,
        winnerHpRemaining,
        winnerMaxHp,
        isRanked,
        guildId: guildId || "1362084781134708907",
        arcana,
      };
      records.push(battleRecord);

      // winner stat update
      let winnerStats = stats.find((s) => s.userId === winnerId);
      if (!winnerStats) {
        winnerStats = blankStats(winnerId, winnerTag);
        stats.push(winnerStats);
      }

      if (isRanked) {
        winnerStats.rankedWins++;
        winnerStats.rankedTotalBattles++;
        winnerStats.rankedWinRate = this.calculateWinRate(
          winnerStats.rankedWins,
          winnerStats.rankedTotalBattles,
        );
        winnerStats.rankedWeightedScore = this.calculateWeightedScore(
          winnerStats.rankedWins,
          winnerStats.rankedTotalBattles,
        );
        winnerStats.lastRankedBattleAt = battleDate;
      } else {
        winnerStats.wins++;
        winnerStats.totalBattles++;
        winnerStats.winRate = this.calculateWinRate(
          winnerStats.wins,
          winnerStats.totalBattles,
        );
        if (!arcana) {
          winnerStats.scoredWins++;
          winnerStats.scoredTotalBattles++;
        }
        winnerStats.weightedScore = this.calculateWeightedScore(
          winnerStats.scoredWins,
          winnerStats.scoredTotalBattles,
        );
        winnerStats.lastCasualBattleAt = battleDate;
      }

      winnerStats.userTag = winnerTag;

      // loser stats update
      let loserStats = stats.find((s) => s.userId === loserId);
      if (!loserStats) {
        loserStats = blankStats(loserId, loserTag);
        stats.push(loserStats);
      }

      if (isRanked) {
        loserStats.rankedLosses++;
        loserStats.rankedTotalBattles++;
        loserStats.rankedWinRate = this.calculateWinRate(
          loserStats.rankedWins,
          loserStats.rankedTotalBattles,
        );
        loserStats.rankedWeightedScore = this.calculateWeightedScore(
          loserStats.rankedWins,
          loserStats.rankedTotalBattles,
        );
        loserStats.lastRankedBattleAt = battleDate;
      } else {
        loserStats.losses++;
        loserStats.totalBattles++;
        loserStats.winRate = this.calculateWinRate(
          loserStats.wins,
          loserStats.totalBattles,
        );
        if (!arcana) {
          loserStats.scoredTotalBattles++;
        }
        loserStats.weightedScore = this.calculateWeightedScore(
          loserStats.scoredWins,
          loserStats.scoredTotalBattles,
        );
        loserStats.lastCasualBattleAt = battleDate;
      }

      loserStats.userTag = loserTag;

      await this.writeStats(stats);
      await this.writeRecords(records);
    });
  }

  public static async getUserStats(
    userId: string,
  ): Promise<BattleStats | null> {
    const stats = await this.readStats();
    return stats.find((s) => s.userId === userId) || null;
  }

  public static async getLeaderboard(
    limit: number = 10,
    ranked: boolean = false,
  ): Promise<BattleStats[]> {
    const stats = await this.readStats();
    const minBattles = ranked ? 5 : 3;

    return stats
      .filter((s) =>
        ranked
          ? s.rankedTotalBattles >= minBattles
          : s.totalBattles >= minBattles,
      )
      .sort((a, b) => {
        const aWeightedScore = ranked ? a.rankedWeightedScore : a.weightedScore;
        const bWeightedScore = ranked ? b.rankedWeightedScore : b.weightedScore;
        const aWins = ranked ? a.rankedWins : a.wins;
        const bWins = ranked ? b.rankedWins : b.wins;

        // sort by weighted score
        if (bWeightedScore !== aWeightedScore) {
          return bWeightedScore - aWeightedScore;
        }
        // tiebreaker by total wins
        return bWins - aWins;
      })
      .slice(0, limit);
  }

  public static async getUserBattleHistory(
    userId: string,
    limit: number = 10,
    ranked?: boolean,
  ): Promise<BattleRecord[]> {
    const records = await this.readRecords();
    return records
      .filter((r) => {
        const userMatches = r.winnerId === userId || r.loserId === userId;
        if (ranked !== undefined) {
          return userMatches && r.isRanked === ranked;
        }
        return userMatches;
      })
      .sort(
        (a, b) =>
          new Date(b.battleDate).getTime() - new Date(a.battleDate).getTime(),
      )
      .slice(0, limit);
  }

  public static async getAllStats(): Promise<BattleStats[]> {
    return await this.readStats();
  }
}
