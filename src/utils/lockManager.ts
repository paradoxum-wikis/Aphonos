export type GameType = "battle" | "russian" | "tourney" | "civilization";

interface GameLock {
  guildId: string;
  gameType: GameType;
  userIds: Set<string>;
  startTime: number;
}

const activeLocks = new Map<string, Map<GameType, GameLock>>();

export class LockManager {
  private static readonly TIMEOUT = 1000 * 60 * 5; // 5 minutes (not used for tourney / civilization)

  // Checks if a specific game type is active in a server
  public static isLocked(guildId: string, gameType: GameType): boolean {
    this.cleanupOldLocks();
    const guildLocks = activeLocks.get(guildId);
    return guildLocks ? guildLocks.has(gameType) : false;
  }

  // Checks if a user is in ANY game across any server
  public static isUserBusy(userId: string): boolean {
    this.cleanupOldLocks();
    for (const guildLocks of activeLocks.values()) {
      for (const lock of guildLocks.values()) {
        if (lock.userIds.has(userId)) {
          return true;
        }
      }
    }
    return false;
  }

  // Acquires a lock for a specific game type in a server
  public static acquireLock(
    guildId: string,
    gameType: GameType,
    userIds: string[],
  ): boolean {
    if (gameType === "battle" && this.isLocked(guildId, "tourney")) {
      return false;
    }

    // Check if this specific game type is already running in this guild
    if (this.isLocked(guildId, gameType)) {
      return false;
    }

    // Check if any user is already busy in ANY game
    for (const id of userIds) {
      if (this.isUserBusy(id)) {
        return false;
      }
    }

    if (!activeLocks.has(guildId)) {
      activeLocks.set(guildId, new Map());
    }

    const guildLocks = activeLocks.get(guildId)!;
    guildLocks.set(gameType, {
      guildId,
      gameType,
      userIds: new Set(userIds),
      startTime: Date.now(),
    });

    return true;
  }

  // Releases the lock for a specific game type in a server
  public static releaseLock(guildId: string, gameType: GameType): void {
    const guildLocks = activeLocks.get(guildId);
    if (guildLocks) {
      guildLocks.delete(gameType);
      if (guildLocks.size === 0) {
        activeLocks.delete(guildId);
      }
    }
  }

  private static cleanupOldLocks(): void {
    const now = Date.now();

    for (const [guildId, guildLocks] of activeLocks.entries()) {
      for (const [gameType, lock] of guildLocks.entries()) {
        if (gameType === "tourney" || gameType === "civilization") continue;
        if (now - lock.startTime > this.TIMEOUT) {
          console.log(
            `[LOCKMANAGER] Cleaning up timed out ${gameType} in guild ${guildId}`,
          );
          guildLocks.delete(gameType);
        }
      }
      if (guildLocks.size === 0) {
        activeLocks.delete(guildId);
      }
    }
  }

  public static getAllLocks(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const [guildId, guildLocks] of activeLocks.entries()) {
      const allUsers = new Set<string>();
      for (const lock of guildLocks.values()) {
        for (const uid of lock.userIds) {
          allUsers.add(uid);
        }
      }
      result.set(guildId, allUsers);
    }
    return result;
  }
}
