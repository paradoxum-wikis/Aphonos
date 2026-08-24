import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  GuildMember,
  MessageFlags,
  User,
} from "discord.js";
import { container, section, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("avatar")
  .setDescription("Behold the visage of a soul")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The soul whose visage thou seekest to view")
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName("global")
      .setDescription("Force global avatar/banner")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const rawTargetUser = interaction.options.getUser("user") || interaction.user;
  const forceGlobal = interaction.options.getBoolean("global") ?? false;

  try {
    const targetUser: User = await rawTargetUser.fetch(true);
    const targetMember = forceGlobal
      ? null
      : (() => {
          const interactionMember =
            interaction.member instanceof GuildMember
              ? interaction.member
              : null;
          const optionMember = interaction.options.getMember("user");
          return optionMember instanceof GuildMember
            ? optionMember
            : interactionMember;
        })();

    const freshTargetMember = targetMember
      ? await targetMember.fetch(true)
      : null;

    const avatarHash = freshTargetMember?.avatar ?? targetUser.avatar;
    const isAnimatedAvatar = avatarHash?.startsWith("a_");
    const avatarURL =
      freshTargetMember?.displayAvatarURL({
        size: 4096,
        extension: isAnimatedAvatar ? "gif" : "png",
      }) ??
      targetUser.displayAvatarURL({
        size: 4096,
        extension: isAnimatedAvatar ? "gif" : "png",
      });

    const bannerHash = freshTargetMember?.banner ?? targetUser.banner;
    const isAnimatedBanner = bannerHash?.startsWith("a_");
    const bannerURL =
      freshTargetMember?.displayBannerURL({
        size: 4096,
        extension: isAnimatedBanner ? "gif" : "png",
      }) ||
      targetUser.bannerURL({
        size: 4096,
        extension: isAnimatedBanner ? "gif" : "png",
      });

    const c = container(targetUser.hexAccentColor || "#B2BEB5").addSectionComponents(
      section(
        `## ${targetUser.tag}\n[Avatar](${avatarURL})`,
        avatarURL,
      ),
    );
    if (bannerURL) {
      c.addSectionComponents(
        section(`**Banner**\n[Open](${bannerURL})`, bannerURL),
      );
    } else if (targetUser.hexAccentColor) {
      c.addTextDisplayComponents(
        text(`Banner color: ${targetUser.hexAccentColor}`),
      );
    }

    await interaction.reply({
      components: [c],
      flags: V2,
    });
  } catch (error) {
    console.error("Error displaying avatar/banner:", error);
    await interaction.reply({
      content:
        "**Failed to retrieve user's visage! The soul may be elusive or one's divine profile hidden.**",
      flags: MessageFlags.Ephemeral,
    });
  }
}
