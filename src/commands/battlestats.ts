import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { BattleStatsManager } from "../utils/battleStatsManager.js";
import { container, section, text, V2 } from "../utils/v2.js";

function clampLimit(value: number, max: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(max, value));
}

function lastAt(iso?: string): string {
  if (!iso) return "Never";
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`;
}

function battleMd(
  heading: string,
  wins: number,
  losses: number,
  wr: number,
  ws: number,
  total: number,
  last: string,
): string {
  return `**${heading}**\n🏆 **Wins:** ${wins} · 💀 **Losses:** ${losses} · 📊 **WR:** ${wr}%\n⭐ **WS:** ${ws} · ⚔️ **Total:** ${total}\n📅 **Last:** ${last} · 🎯 **Ratio:** ${wins}W-${losses}L`;
}

export const data = new SlashCommandBuilder()
  .setName("battlestats")
  .setDescription("View deathbattle statistics and leaderboards")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("user")
      .setDescription("View a user's battle statistics")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The warrior whose stats to view (defaults to yourself)",
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription(
            "View normal, ranked, or all stats (defaults to normal)",
          )
          .addChoices(
            { name: "Normal", value: "normal" },
            { name: "Ranked", value: "ranked" },
            { name: "All", value: "all" },
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("leaderboard")
      .setDescription("View the top warriors leaderboard")
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription(
            "View normal or ranked leaderboard (defaults to normal)",
          )
          .addChoices(
            { name: "Normal", value: "normal" },
            { name: "Ranked", value: "ranked" },
          )
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("How many warriors to show (defaults to 10, max 25)")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("View recent battle history for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The warrior whose history to view (defaults to yourself)",
          )
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription(
            "View normal, ranked, or all battles (defaults to all)",
          )
          .addChoices(
            { name: "Normal", value: "normal" },
            { name: "Ranked", value: "ranked" },
            { name: "All", value: "all" },
          )
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("How many battles to show (defaults to 10, max 25)")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case "user": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const mode = interaction.options.getString("mode") || "normal";
        const stats = await BattleStatsManager.getUserStats(targetUser.id);

        if (!stats) {
          await interaction.reply({
            content: `**${targetUser.tag} has not participated in any deathbattles yet!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const header = `## ⚔️ WARRIOR BATTLE RECORD\nBattle statistics for **${targetUser.tag}**`;
        const avatar = targetUser.displayAvatarURL();
        const components: ReturnType<typeof container>[] = [];

        if (mode === "normal" || mode === "all") {
          components.push(
            container("#4B0082").addSectionComponents(
              section(
                `${header}\n\n${battleMd("NORMAL BATTLES", stats.wins, stats.losses, stats.winRate, stats.weightedScore, stats.totalBattles, lastAt(stats.lastCasualBattleAt))}`,
                avatar,
              ),
            ),
          );
        }

        if (mode === "ranked" || mode === "all") {
          const ranked = battleMd(
            "RANKED BATTLES",
            stats.rankedWins,
            stats.rankedLosses,
            stats.rankedWinRate,
            stats.rankedWeightedScore,
            stats.rankedTotalBattles,
            lastAt(stats.lastRankedBattleAt),
          );
          components.push(
            mode === "ranked"
              ? container("#4B0082").addSectionComponents(
                  section(`${header}\n\n${ranked}`, avatar),
                )
              : container("#4B0082").addTextDisplayComponents(text(ranked)),
          );
        }

        await interaction.reply({ components, flags: V2 });
        break;
      }

      case "leaderboard": {
        const mode = interaction.options.getString("mode") || "normal";
        const isRanked = mode === "ranked";
        const limit = clampLimit(
          interaction.options.getInteger("limit") || 10,
          25,
        );

        const leaderboard = await BattleStatsManager.getLeaderboard(
          limit,
          isRanked,
        );

        if (leaderboard.length === 0) {
          await interaction.reply({
            content: `**No warriors have participated in enough ${isRanked ? "ranked " : ""}battles yet! (Minimum ${isRanked ? "5" : "3"} battles required)**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        let leaderboardText = "";
        for (let i = 0; i < leaderboard.length; i++) {
          const warrior = leaderboard[i];
          const medal =
            i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          const wins = isRanked ? warrior.rankedWins : warrior.wins;
          const losses = isRanked ? warrior.rankedLosses : warrior.losses;
          const weightedScore = isRanked
            ? warrior.rankedWeightedScore
            : warrior.weightedScore;
          const winRate = isRanked ? warrior.rankedWinRate : warrior.winRate;

          leaderboardText += `${medal} **${warrior.userTag}** - ${weightedScore.toFixed(2)} WS (${wins}W-${losses}L, ${winRate}% WR)\n`;
        }

        await interaction.reply({
          components: [
            container(
              isRanked ? "#FF6B35" : "#FFD700",
            ).addTextDisplayComponents(
              text(
                `## 🏆 ${isRanked ? "RANKED " : ""}HALL OF CHAMPIONS\n**Top Warriors by ${isRanked ? "Ranked " : ""}Weighted Score**\n*Minimum ${isRanked ? "5" : "3"} battles required*\n*WS = Weighted Score, WR = Win Rate*\n\n${leaderboardText}\n-# Fight your way to the top${isRanked ? " in ranked battles" : ""}!`,
              ),
            ),
          ],
          flags: V2,
        });
        break;
      }

      case "history": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const mode = interaction.options.getString("mode") || "all";
        const limit = clampLimit(
          interaction.options.getInteger("limit") || 10,
          25,
        );

        let rankedFilter: boolean | undefined;
        if (mode === "normal") rankedFilter = false;
        else if (mode === "ranked") rankedFilter = true;
        else rankedFilter = undefined; // all

        const history = await BattleStatsManager.getUserBattleHistory(
          targetUser.id,
          limit,
          rankedFilter,
        );

        if (history.length === 0) {
          await interaction.reply({
            content: `**${targetUser.tag} has no ${mode === "all" ? "" : mode + " "}battle history!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        let historyText = "";
        for (const battle of history) {
          const isWinner = battle.winnerId === targetUser.id;
          const opponent = isWinner ? battle.loserTag : battle.winnerTag;
          const result = isWinner ? "🔥 **WON**" : "💀 **LOST**";
          const date = `<t:${Math.floor(new Date(battle.battleDate).getTime() / 1000)}:d>`;
          const battleType = battle.isRanked ? "🏆" : "⚔️";

          historyText += `${result} vs **${opponent}** ${battleType} (${battle.turns} turns) - ${date}\n`;
        }

        await interaction.reply({
          components: [
            container("#800080").addTextDisplayComponents(
              text(
                `## 📜 ${mode.toUpperCase()} BATTLE CHRONICLES\nRecent ${mode === "all" ? "" : mode + " "}battle history for **${targetUser.tag}**\n\n${mode === "all" ? "🏆 = Ranked | ⚔️ = Normal\n\n" : ""}${historyText}`,
              ),
            ),
          ],
          flags: V2,
        });
        break;
      }
    }
  } catch (error) {
    console.error("Error fetching battle stats:", error);
    await interaction.reply({
      content:
        "**THE DIVINE POWERS HAVE FAILED TO RETRIEVE THE BATTLE RECORDS!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
