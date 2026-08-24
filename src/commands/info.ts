import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { container, text, V2 } from "../utils/v2.js";

interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

export const data = new SlashCommandBuilder()
  .setName("info")
  .setDescription("Behold the knowledge of Aphonos");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  let commitInfo = "**Unable to retrieve commit data**";

  try {
    const response = await fetch(
      "https://api.github.com/repos/Paradoxum-Wikis/ALTERSHAPER-Bot/commits/main",
    );

    if (response.ok) {
      const data = (await response.json()) as GitHubCommit;
      const commitDate = new Date(data.commit.author.date);
      const commitMessage = data.commit.message.split("\n")[0];
      const commitSha = data.sha.substring(0, 7);

      commitInfo = `**[${commitSha}](${data.html_url})** - ${commitMessage}\n**Date:** ${commitDate.toLocaleDateString()} at ${commitDate.toLocaleTimeString()}`;
    }
  } catch (error) {
    console.error("Error fetching bot info:", error);
  }

  await interaction.reply({
    components: [
      container("#9932CC")
        .addTextDisplayComponents(
          text(
            "## ℹ️ KNOWLEDGE OF APHONOS\n**Behold the divine information of thy sacred enforcer!**",
          ),
        )
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents(
          text(
            "**📚 DOCUMENTATION**\n[Alterpedia Help Page](https://alter-ego.fandom.com/wiki/Help:ALTERSHAPER)",
          ),
        )
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents(
          text(
            "**🔗 SOURCE CODE**\n[GitHub Repository](https://github.com/Paradoxum-Wikis/ALTERSHAPER-Bot)",
          ),
        )
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents(text(`**📝 LATEST UPDATE**\n${commitInfo}`))
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents(
          text(
            `**📊 CURRENT STATUS**\n**Uptime:** <t:${Math.floor((Date.now() - process.uptime() * 1000) / 1000)}:R>\n**Servers:** ${interaction.client.guilds.cache.size}\n**Users in this server:** ${interaction.guild?.memberCount}\n\n-# Aphonos stands eternal, guardian of Alteruism and enforcer of righteous order!`,
          ),
        ),
    ],
    flags: V2,
  });
}
