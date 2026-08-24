import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { RussianStatsManager } from "../utils/russianStatsManager.js";
import type {
  RussianStats,
  RussianRecord,
} from "../utils/russianStatsManager.js";
import { container, section, text, V2 } from "../utils/v2.js";

function formatRelativeTimestamp(iso?: string): string {
  if (!iso) return "Never";
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) return "Never";
  return `<t:${ts}:R>`;
}

function formatShortDate(iso: string): string {
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) return "Unknown date";
  return `<t:${ts}:d>`;
}

function clampLimit(value: number, max: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(max, value));
}

function renderUserStats(
  targetUserTag: string,
  targetAvatarUrl: string,
  stats: RussianStats,
) {
  return container("#000000").addSectionComponents(
    section(
      `## 🔫 RUSSIAN ROULETTE RECORD\nStatistics for **${targetUserTag}**\n\n**OVERVIEW**\n🏆 **Wins:** ${stats.wins} · 💀 **Losses:** ${stats.losses} · 📈 **WR:** ${stats.winRate}%\n🎯 **Games:** ${stats.totalGames} · 🗓️ **Last Game:** ${formatRelativeTimestamp(stats.lastGameAt)} · ⚖️ **Ratio:** ${stats.wins}W-${stats.losses}L\n\n**FATE METRICS**\n🩸 **Suicide:** ${stats.shotSelfDeaths} · 🎯 **Shot by Opponent:** ${stats.shotByOpponentDeaths}\n⏱️ **Avg Turns:** ${stats.avgTurns} · 🔢 **Avg Chamber:** ${stats.avgChamber}\n🏆 **Last Win:** ${formatRelativeTimestamp(stats.lastWinAt)} · 💀 **Last Loss:** ${formatRelativeTimestamp(stats.lastLossAt)}`,
      targetAvatarUrl,
    ),
  );
}

function renderLeaderboard(entries: RussianStats[], minGames: number) {
  let leaderboardText = "";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const medal =
      i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;

    leaderboardText += `${medal} **${entry.userTag}** - ${entry.winRate}% WR (${entry.wins}W-${entry.losses}L, ${entry.totalGames} games)\n`;
  }

  return container("#FF0000").addTextDisplayComponents(
    text(
      `## 🏆 RUSSIAN ROULETTE LEADERBOARD\n**Top Players by Win Rate**\n*Minimum ${minGames} games required*\n\n${leaderboardText}`,
    ),
  );
}

function renderHistory(
  targetUserTag: string,
  targetAvatarUrl: string,
  history: RussianRecord[],
  targetUserId: string,
) {
  let historyText = "";
  for (const game of history) {
    const isWinner = game.winnerId === targetUserId;
    const opponent = isWinner ? game.loserTag : game.winnerTag;

    const result = isWinner ? "🔥 **WON**" : "💀 **LOST**";
    const date = formatShortDate(game.gameDate);

    const cause = !isWinner
      ? game.causeOfDeath === "shot_self"
        ? " (self-inflicted)"
        : " (shot)"
      : "";

    historyText += `${result} vs **${opponent}** (Chamber ${game.chamber}/6, ${game.turns} turns)${cause} - ${date}\n`;
  }

  return container("#800000").addSectionComponents(
    section(
      `## 📜 RUSSIAN ROULETTE CHRONICLES\nRecent games for **${targetUserTag}**\n\n${historyText}`,
      targetAvatarUrl,
    ),
  );
}

export const data = new SlashCommandBuilder()
  .setName("russianstats")
  .setDescription("View Russian Roulette statistics and leaderboards")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("user")
      .setDescription("View a user's Russian Roulette statistics")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The user whose statistics to view (defaults to yourself)",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("leaderboard")
      .setDescription("View the top Russian Roulette leaderboard")
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("How many users to show (defaults to 10, max 25)")
          .setMinValue(1)
          .setMaxValue(25)
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("history")
      .setDescription("View recent Russian Roulette game history for a user")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription(
            "The user whose history to view (defaults to yourself)",
          )
          .setRequired(false),
      )
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("How many games to show (defaults to 10, max 25)")
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

        const stats = await RussianStatsManager.getUserStats(targetUser.id);

        if (!stats) {
          await interaction.reply({
            content: `**${targetUser.tag} has not participated in any Russian Roulette games yet!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          components: [
            renderUserStats(
              targetUser.tag,
              targetUser.displayAvatarURL(),
              stats,
            ),
          ],
          flags: V2,
        });
        return;
      }

      case "leaderboard": {
        const limit = clampLimit(
          interaction.options.getInteger("limit") || 10,
          25,
        );
        const minGames = 3;

        const leaderboard = await RussianStatsManager.getLeaderboard(
          limit,
          minGames,
        );

        if (leaderboard.length === 0) {
          await interaction.reply({
            content: `**No users have played enough Russian Roulette yet! (Minimum ${minGames} games required)**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          components: [renderLeaderboard(leaderboard, minGames)],
          flags: V2,
        });
        return;
      }

      case "history": {
        const targetUser =
          interaction.options.getUser("user") || interaction.user;
        const limit = clampLimit(
          interaction.options.getInteger("limit") || 10,
          25,
        );

        const history = await RussianStatsManager.getUserGameHistory(
          targetUser.id,
          limit,
        );

        if (history.length === 0) {
          await interaction.reply({
            content: `**${targetUser.tag} has no Russian Roulette history!**`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          components: [
            renderHistory(
              targetUser.tag,
              targetUser.displayAvatarURL(),
              history,
              targetUser.id,
            ),
          ],
          flags: V2,
        });
        return;
      }
    }
  } catch (error) {
    console.error("Error fetching Russian Roulette statistics:", error);
    await interaction.reply({
      content: "**FAILED TO RETRIEVE RUSSIAN ROULETTE RECORDS!**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
