import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { LinkLogger } from "../utils/linkLogger.js";
import { TOP_CONTRIBUTORS_ROLE_ID } from "../utils/roleConstants.js";
import { TopContributorsManager } from "../utils/topContributors.js";
import { FandomRoleManager } from "../utils/fandomRoleManager.js";
import { container, text, V2, V2_EPHEMERAL } from "../utils/v2.js";

interface FandomUserQueryUser {
  userid: number;
  name: string;
  missing?: string;
  groups?: string[];
  editcount?: number;
  registration?: string;
  gender?: string;
}

interface FandomUserQueryResponse {
  batchcomplete: string;
  query?: {
    users: FandomUserQueryUser[];
  };
}

interface FandomUserProfileData {
  id: number;
  username: string;
  discordHandle?: string;
}

interface FandomUserProfileResponse {
  userData?: FandomUserProfileData;
}

export const data = new SlashCommandBuilder()
  .setName("link")
  .setDescription(
    "Link thy Discord soul with thy Fandom account (case-sensitive)",
  )
  .addStringOption((option) =>
    option
      .setName("fandomusername")
      .setDescription("Thy username on Fandom")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const fandomUsernameInput = interaction.options.getString(
    "fandomusername",
    true,
  );
  const member = interaction.member as GuildMember;

  if (!interaction.guild) {
    await interaction.reply({
      content:
        "**THIS SACRED RITE CAN ONLY BE PERFORMED WITHIN THE SACRED HALLS!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const userQueryUrl = `https://alter-ego.fandom.com/api.php?action=query&format=json&list=users&ususers=${encodeURIComponent(fandomUsernameInput)}&usprop=groups%7Cgender%7Cregistration%7Ceditcount`;
    const userQueryResponse = await fetch(userQueryUrl);

    if (!userQueryResponse.ok) {
      throw new Error(
        `MediaWiki API responded with status: ${userQueryResponse.status}`,
      );
    }
    const userQueryData =
      (await userQueryResponse.json()) as FandomUserQueryResponse;

    if (
      !userQueryData.query ||
      !userQueryData.query.users ||
      userQueryData.query.users.length === 0
    ) {
      await interaction.reply({
        content: `**THE ORACLES FIND NO ALTER NAMED "${fandomUsernameInput}"! CHECK THY SPELLING, MORTAL!**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const fandomUser = userQueryData.query.users[0];
    if (fandomUser.missing !== undefined) {
      await interaction.reply({
        content: `**THE ORACLES FIND NO ALTER NAMED "${fandomUsernameInput}"! CHECK THY SPELLING, MORTAL!**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const fandomUserId = fandomUser.userid;
    const canonicalFandomUsername = fandomUser.name;
    const fandomGroups = fandomUser.groups || [];

    const existingLink = await LinkLogger.getLinkByDiscordId(
      interaction.user.id,
    );
    if (existingLink) {
      if (existingLink.fandomUserId !== fandomUserId) {
        await interaction.reply({
          content: `**THY SOUL AND PRESENCE IS ALREADY BOUND TO A DIFFERENT FANDOM ALTER (${existingLink.fandomUsername})!**`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.reply({
        content: `**THY SOUL IS ALREADY LINKED TO "${canonicalFandomUsername}"! USE \`/checklink\` TO SYNC ROLES.**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const fandomAccountAlreadyLinked =
      await LinkLogger.getLinkByFandomId(fandomUserId);
    if (fandomAccountAlreadyLinked) {
      await interaction.reply({
        content: `**THE ALTER "${canonicalFandomUsername}" IS ALREADY BOUND TO ANOTHER DISCORD PRESENCE!**`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userProfileUrl = `https://alter-ego.fandom.com/wikia.php?controller=UserProfile&method=getUserData&format=json&userId=${fandomUserId}`;
    const userProfileResponse = await fetch(userProfileUrl);

    if (!userProfileResponse.ok) {
      throw new Error(
        `Fandom API responded with status: ${userProfileResponse.status}`,
      );
    }
    const userProfileData =
      (await userProfileResponse.json()) as FandomUserProfileResponse;

    if (!userProfileData.userData || !userProfileData.userData.discordHandle) {
      const verifyUrl = `https://alter-ego.fandom.com/wiki/Special:VerifyUser/${encodeURIComponent(canonicalFandomUsername)}?user=${encodeURIComponent(interaction.user.username)}&c=wb&ch=verify-me&useskin=fandomdesktop`;

      await interaction.reply({
        components: [
          container("#FFA500").addTextDisplayComponents(
            text(
              `## ❓ HOW TO LINK YOUR FANDOM ACCOUNT\n**The alter "${canonicalFandomUsername}" hath not revealed one's Discord handle on the profile!**\n\nTo link your Discord, follow these steps:\n\n1. Open the verification page: [Special:VerifyUser](${verifyUrl})\n2. Follow the instructions on that page to add/confirm your Discord handle.\n3. Once complete, return here and run \`/link\` again.\n\nIf the page warns about a username mismatch, ensure you are logged into the correct Fandom account.\n\n-# If you have set your Discord and still see this, double-check for typos or try again in a few minutes.`,
            ),
          ),
        ],
        flags: V2_EPHEMERAL,
      });
      return;
    }

    const fandomDiscordHandle = userProfileData.userData.discordHandle;
    const discordUserIdentifierToCompare = interaction.user.username;

    if (
      fandomDiscordHandle.toLowerCase() !==
      discordUserIdentifierToCompare.toLowerCase()
    ) {
      const verifyUrl = `https://alter-ego.fandom.com/wiki/Special:VerifyUser/${encodeURIComponent(canonicalFandomUsername)}?user=${encodeURIComponent(interaction.user.username)}&c=wb&ch=verify-me&useskin=fandomdesktop`;

      await interaction.reply({
        components: [
          container("#FFA500").addTextDisplayComponents(
            text(
              `## ❓ DISCORD HANDLE MISMATCH\n**A mismatch in the Dirac sea!**\n\nThe Discord handle on Fandom ("${fandomDiscordHandle}") doth not align with thy current Discord username ("${interaction.user.username}").\n\nTo fix this, re-run verification using the Special page:\n\n1. Open: [Special:VerifyUser](${verifyUrl})\n2. Follow the instructions to set/confirm your Discord handle.\n3. Return here and run \`/link\` again.\n\nMake sure you are logged into the correct Fandom account for "${canonicalFandomUsername}".\n\n-# If you have set your Discord and still see this, double-check for typos or try again in a few minutes.`,
            ),
          ),
        ],
        flags: V2_EPHEMERAL,
      });
      return;
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_link")
        .setLabel("🖋️ Confirm Linking")
        .setStyle(ButtonStyle.Primary),
    );

    const reply = await interaction.reply({
      components: [
        container("#FF6B35")
          .addTextDisplayComponents(
            text(
              `## ⚠️ LINKING CONFIRMATION\n**THOU ART ABOUT TO LINK THY DISCORD SOUL WITH THE FANDOM ALTER: ${canonicalFandomUsername}**\n\n**🔒 PERMANENT ACTION**\n**THIS LINKING IS ETERNAL AND CANNOT BE UNDONE WITHOUT ALTERMINISTRATOR INTERVENTION!**\n**📜 CONFIRMATION REQUIRED**\nMake certain this is thy true will. Shouldst thou wish to proceed, click the button below to commence the linking ritual. The oracles shall commune with the Dirac sea and bind thee to thine alter.\n\n-# This confirmation will expire in 60 seconds.`,
            ),
          )
          .addActionRowComponents(row),
      ],
      flags: V2_EPHEMERAL,
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    let confirmed = false;

    // In case I want to move this to non ephemeral later
    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({
          content: "You cannot confirm another's linking ritual.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      confirmed = true;
      collector.stop();

      const { grantedRoleNames, failedRoleNames } =
        await FandomRoleManager.manageFandomRoles(
          member,
          fandomGroups,
          interaction.guild,
        );
      await LinkLogger.addLink(
        interaction.user.id,
        interaction.user.tag,
        canonicalFandomUsername,
        fandomUserId,
      );

      const topContributorResult =
        await TopContributorsManager.manageTopContributorRole(
          member,
          canonicalFandomUsername,
        );

      let body = `## 🔗 ALTER AND SOUL INTERTWINED!\n**PRAISE BE! Thy Discord presence, ${interaction.user.tag}, is now divinely linked with thy Fandom alter: ${canonicalFandomUsername}!**`;

      let allGrantedRoles = [...grantedRoleNames];
      if (topContributorResult.roleGranted) {
        const topRole = interaction.guild?.roles.cache.get(
          TOP_CONTRIBUTORS_ROLE_ID,
        );
        if (topRole) allGrantedRoles.push(topRole.name);
      }

      const roleMentions = FandomRoleManager.createRoleMentions(
        allGrantedRoles,
        interaction.guild,
      );

      if (roleMentions) {
        body += `\n\n**ROLES BESTOWED**\n${roleMentions}`;
      } else {
        body += `\n\n**ROLES STATUS**\nNo specific Fandom staff roles were applicable at this time.`;
      }

      if (topContributorResult.rank) {
        body += `\n**TOP CONTRIBUTOR STATUS**\n**🏆 CONGRATULATIONS! Rank #${topContributorResult.rank}** in current week's top contributors!`;
      }

      if (failedRoleNames.length > 0) {
        body += `\n**ROLE GRANTING ISSUES**\nFailed to grant: ${failedRoleNames.map((rName) => `\`${rName}\``).join(", ")}.`;
      }

      await i.update({
        components: [
          container(
            failedRoleNames.length > 0 ? "#FFA500" : "#00FF00",
          ).addTextDisplayComponents(text(body)),
        ],
        flags: V2,
      });
    });

    collector.on("end", async () => {
      if (!confirmed) {
        await interaction.editReply({
          components: [
            container("#FF0000").addTextDisplayComponents(
              text(
                `## ⏰ LINKING RITUAL EXPIRED\n**THE LINKING CONFIRMATION HAS EXPIRED. NO CHANGES WERE MADE.**\n\n**TO RETRY**\nRun the \`/link\` command again to restart the linking process.`,
              ),
            ),
          ],
          flags: V2,
        });
      }
    });
  } catch (error) {
    console.error("Error during Fandom account linking:", error);
    await interaction.reply({
      content:
        "**A DISTURBANCE IN THE SCARED HALLS! The linking ritual failed. The oracles are perplexed. Try again later, or consult the high scribes.**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
