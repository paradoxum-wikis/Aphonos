import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  GuildMember,
} from "discord.js";
import { TopContributorsManager } from "../utils/topContributors.js";
import { RolePermissions } from "../utils/rolePermissions.js";
import { WikiRoleSyncManager } from "../utils/wikiRoleSync.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("syncroles")
  .setDescription(
    "Synchronize the top 5 contributors roles and syncs all roles to the wiki",
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "**THIS SACRED RITE CAN ONLY BE PERFORMED WITHIN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    !RolePermissions.hasCommandPermission(
      interaction.member as GuildMember,
      "syncroles",
    )
  ) {
    await interaction.reply({
      content: RolePermissions.getPermissionErrorMessage("syncroles"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await interaction.deferReply();

    console.log(
      "[SYNCROLES] Wiki roles sync requested by",
      interaction.user.tag,
    );

    const result = await TopContributorsManager.syncAllTopContributorRoles(
      interaction.guild,
    );
    const wikiSyncResult = await WikiRoleSyncManager.syncRolesToWiki(
      interaction.guild,
    );

    let body = `## 🏆 WIKI ROLES SYNC COMPLETE\n**The rankings have been synchronized with the reverent roles!**\n\n**📊 SYNCING STATISTICS**\n**Linked Users Processed:** ${result.processed}\n**Roles Granted:** ${result.rolesGranted}\n**Roles Removed:** ${result.rolesRemoved}\n**Errors Encountered:** ${result.errors.length}\n**📚 WIKI SYNC STATUS**\n${wikiSyncResult.message}`;

    if (result.errors.length > 0) {
      const errorSample = result.errors.slice(0, 3).join("\n");
      const additionalErrors =
        result.errors.length > 3
          ? `\n... and ${result.errors.length - 3} more errors`
          : "";
      body += `\n**⚠️ ERRORS ENCOUNTERED**\n\`\`\`${errorSample}${additionalErrors}\`\`\``;
    }

    await interaction.editReply({
      components: [
        container(
          result.errors.length > 0 || !wikiSyncResult.success
            ? "#FFA500"
            : "#00FF00",
        ).addTextDisplayComponents(text(body)),
      ],
      flags: V2,
    });
  } catch (error) {
    console.error("Error during manual top contributor sync:", error);
    await interaction.editReply({
      content:
        "**A DISTURBANCE IN THE SACRED HALLS! The synchronization ritual failed. The oracles are perplexed. Try again later, or consult the high scribes.**",
    });
  }
}
