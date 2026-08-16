import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  GuildMember,
  User,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import path from "path";
import { RussianStatsManager } from "../utils/russianStatsManager.js";
import { LockManager } from "../utils/lockManager.js";

export const data = new SlashCommandBuilder()
  .setName("russian")
  .setDescription("Play a game of Russian Roulette with another user")
  .addUserOption((option) =>
    option
      .setName("target")
      .setDescription("The user you want to play with")
      .setRequired(true),
  );

async function handleConsentPhase(
  interaction: ChatInputCommandInteraction,
  inviter: User,
  target: User,
): Promise<boolean> {
  const consentEmbed = new EmbedBuilder()
    .setColor("#FF0000")
    .setTitle("🔫 RUSSIAN ROULETTE CHALLENGE")
    .setDescription(
      `**${inviter} has challenged ${target} to Russian Roulette!**\n\n` +
        `The stakes are high. One bullet, six chambers.\n` +
        `Both players must accept to start the game.\n` +
        `You have **15 seconds** to respond.`,
    )
    .setFooter({
      text: "Do you feel lucky?",
    });

  const acceptButton = new ButtonBuilder()
    .setCustomId("accept_game")
    .setLabel("✅ Accept Challenge")
    .setStyle(ButtonStyle.Danger);

  const declineButton = new ButtonBuilder()
    .setCustomId("decline_game")
    .setLabel("❌ Decline")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    acceptButton,
    declineButton,
  );

  await interaction.reply({
    embeds: [consentEmbed],
    components: [row],
  });

  const acceptedUsers = new Set<string>();

  try {
    const collector = interaction.channel!.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 15000,
    });

    return new Promise((resolve) => {
      collector.on("collect", async (buttonInteraction) => {
        const userId = buttonInteraction.user.id;

        if (userId !== inviter.id && userId !== target.id) {
          await buttonInteraction.reply({
            content: "**Only the challenged players may respond!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (buttonInteraction.customId === "accept_game") {
          if (acceptedUsers.has(userId)) {
            await buttonInteraction.reply({
              content: "**You have already accepted!**",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          acceptedUsers.add(userId);
          await buttonInteraction.reply({
            content: `**You have accepted the challenge!**`,
            flags: MessageFlags.Ephemeral,
          });
        } else if (buttonInteraction.customId === "decline_game") {
          await buttonInteraction.reply({
            content: `**You have declined the challenge!**`,
            flags: MessageFlags.Ephemeral,
          });
          collector.stop("declined");
          resolve(false);
          return;
        }

        if (acceptedUsers.has(inviter.id) && acceptedUsers.has(target.id)) {
          collector.stop("accepted");
          resolve(true);
        }
      });

      collector.on("end", (collected, reason) => {
        if (reason === "time") {
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error("Error in consent phase:", error);
    return false;
  }
}

async function createRussianImage(
  targetUser: User,
  targetName: string,
  targetMember: GuildMember | null,
  currentTurnUser: User,
  currentTurnMember: GuildMember | null,
  filter: "none" | "bw" | "red" = "none",
): Promise<Buffer> {
  const canvas = createCanvas(1920, 1080);
  const ctx = canvas.getContext("2d");

  const possiblePaths = [
    path.join(process.cwd(), "src", "russian.png"),
    path.join(process.cwd(), "dist", "russian.png"),
    path.join(process.cwd(), "altershaper-bot", "dist", "russian.png"),
  ];

  let background: Image | null = null;

  for (const imagePath of possiblePaths) {
    try {
      background = await loadImage(imagePath);
      break;
    } catch (error) {
      continue;
    }
  }

  if (background) {
    ctx.drawImage(background, 0, 0, 1920, 1080);
  } else {
    // if image missing
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 100px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RUSSIAN ROULETTE", 960, 540);
  }

  try {
    const targetAvatarHash = targetMember?.avatar ?? targetUser.avatar;
    const targetAnimatedAvatar = targetAvatarHash?.startsWith("a_");
    const targetAvatarUrl =
      targetMember?.displayAvatarURL({
        extension: targetAnimatedAvatar ? "gif" : "png",
        size: 512,
      }) ??
      targetUser.displayAvatarURL({
        extension: targetAnimatedAvatar ? "gif" : "png",
        size: 512,
      });

    const avatar = await loadImage(targetAvatarUrl);
    const avatarSize = 512;
    const x = 960 - avatarSize / 2 + 1;
    const y = 540 - avatarSize / 2 + 1;

    ctx.drawImage(avatar, x, y, avatarSize, avatarSize);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 60px 'URW Gothic', sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(targetName, 960, y + avatarSize + 155);

    const turnAvatarHash = currentTurnMember?.avatar ?? currentTurnUser.avatar;
    const turnAnimatedAvatar = turnAvatarHash?.startsWith("a_");
    const turnAvatarUrl =
      currentTurnMember?.displayAvatarURL({
        extension: turnAnimatedAvatar ? "gif" : "png",
        size: 256,
      }) ??
      currentTurnUser.displayAvatarURL({
        extension: turnAnimatedAvatar ? "gif" : "png",
        size: 256,
      });

    const turnAvatar = await loadImage(turnAvatarUrl);
    const turnAvatarSize = 216;
    const turnX = 90;
    const turnY = 1080 - turnAvatarSize - 90;

    ctx.drawImage(turnAvatar, turnX, turnY, turnAvatarSize, turnAvatarSize);

    if (filter !== "none") {
      const imageData = ctx.getImageData(0, 0, 1920, 1080);
      const data = imageData.data;

      if (filter === "bw") {
        for (let i = 0; i < data.length; i += 4) {
          const gray = Math.round(
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
          );
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
      } else if (filter === "red") {
        ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
        ctx.fillRect(0, 0, 1920, 1080);
      }
    }
  } catch (error) {
    console.error("Error drawing avatar:", error);
  }

  return canvas.encode("png");
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const targetUser = interaction.options.getUser("target", true);
  const inviterUser = interaction.user;

  if (targetUser.id === inviterUser.id) {
    await interaction.reply({
      content: "**You cannot play Russian Roulette with yourself!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (targetUser.bot) {
    await interaction.reply({
      content: "**You cannot play Russian Roulette with a bot!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (LockManager.isLocked(interaction.guildId!, "russian")) {
    await interaction.reply({
      content:
        "**A game of Russian Roulette is already in progress in this server!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    LockManager.isUserBusy(inviterUser.id) ||
    LockManager.isUserBusy(targetUser.id)
  ) {
    await interaction.reply({
      content: "**One of the players is already in a game!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lockAcquired = LockManager.acquireLock(
    interaction.guildId!,
    "russian",
    [inviterUser.id, targetUser.id],
  );

  if (!lockAcquired) {
    await interaction.reply({
      content: "**Failed to start game. The arena might be busy.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const consentGiven = await handleConsentPhase(
    interaction,
    inviterUser,
    targetUser,
  );

  if (!consentGiven) {
    LockManager.releaseLock(interaction.guildId!, "russian");
    await interaction.editReply({
      content: "**Game cancelled! One or both players did not accept.**",
      embeds: [],
      components: [],
    });
    return;
  }

  let currentTurnUser = inviterUser;
  let opponentUser = targetUser;
  let inviterMember: GuildMember | null = null;
  let targetMember: GuildMember | null = null;

  if (interaction.inGuild()) {
    inviterMember = await interaction.guild!.members.fetch(inviterUser.id);
    targetMember = await interaction.guild!.members.fetch(targetUser.id);
  }

  let bulletSlot = Math.floor(Math.random() * 6);
  let currentSlot = 0;
  let gameOver = false;
  let turnTimer: NodeJS.Timeout;
  let turns = 0;
  let isBonusTurn = false;

  const shootFlavorTexts = [
    "{user} pulls the trigger... *Click*. Nothing happens.",
    "{user} aims at {target} with a shaky hand... *Click*.",
    "{user} smiles and fires at {target}... but the chamber is empty.",
    "{user} closes their eyes and shoots... *Click*. Safe for now.",
    "{user} tries to end it all for {target}... but fate has other plans. *Click*.",
    "{user} fires at {target}... but it's not their turn to die. *Click*.",
    "{user} tries their luck against {target}... *Click*. Fortune favors {target} this time.",
    "Pointing the gun at {target}, {user} pulls the trigger... *Click*. Nothing happens.",
    "{user}'s heart beats faster as they aim at {target}... *Click*. {target} lives.",
    "Betting it all on this chamber, {user} fires the gun... *Click*. It's not this one.",
  ];

  const shootSelfFlavorTexts = [
    "{user} puts the gun to their head... *Click*. They survive.",
    "{user} takes a deep breath and pulls the trigger on themself... *Click*.",
    "{user} laughs maniacally and shoots themself... but it's empty.",
    "{user} tests their luck against the reaper... *Click*. And wins.",
    "{user} sweats nervously as they fire at their own temple... *Click*.",
    "{user} challenges death itself... *Click*. And lives to tell the tale..",
    "{user} wanted a taste of adrenaline. *Click*. Luckily, nothing happens.",
    "With a gun to their head, {user} fires. *Click*. Nothing happens.",
    "Perfunctorily aiming at their head... *Click*. No bullet for {user} .",
    "{user} trembles as they point the gun at themself... *Click* They live.",
  ];

  const skipFlavorTexts = [
    "{user} decides not to tempt fate and passes the gun.",
    "{user} slides the revolver across the table to {target}.",
    "{user} refuses to fire and hands the weapon over.",
    "{user} stares at {target} and gives them the gun.",
    "{user} chooses to skip their turn. Cowardice or strategy?",
    "{user} shrugs and lets {target} take the risk instead.",
    "{user} can't bring themself to pull the trigger and passes.",
    "{user} takes a deep breath and passes the gun to {target}.",
    "Fate tempts, but {user} chooses to pass.",
    "Perhaps today is not the day for {user} to face their fears, they passes.",
  ];

  const shootDeathFlavorTexts = [
    "**BANG!** {user} shot {target}! {user} is now free from this nightmare.",
    "**BANG!** {user} pulls the trigger and {target} drops! {user} walks away victorious.",
    "**BANG!** A loud shot rings out as {user} eliminates {target}. The game is over.",
    "**BANG!** {user} fires the fatal shot at {target}. Survival is the only prize.",
    "**BANG!** {target} falls as {user} lowers the smoking gun. It is done.",
    "**BANG!** {target} is no longer in the same world as {user}. {user} leaves unharmed.",
    "**BANG!** {user}'s torment has concluded, farewell, {target}.",
    "**BANG!** {target}'s fate is sealed as {user} fires the killing shot.",
    "**BANG!** {target}'s story ends here, {user} is victorious.",
    "**BANG!** In the end, {target}'s eyes dilates as their consciousness fades away.",
  ];

  const shootSelfDeathFlavorTexts = [
    "**BANG!** {user} shot themself! {target} watches in horror as they win by default.",
    "**BANG!** {user} took the easy way out. {target} survives the game.",
    "**BANG!** {user}'s luck ran out. {target} is the last one standing.",
    "**BANG!** {user} pulls the trigger on themself and falls. {target} is free.",
    "**BANG!** Silence follows the shot. {user} is gone. {target} remains.",
    "**BANG!** {user} ends their own game. {target} breathes a sigh of relief.",
    "**BANG!** {user} did not awaken a Persona, instead they are dead.",
    "**BANG!** A tragic end for {user} as {target} gains their freedom, {user} is no more.",
    "**BANG!** The wall behind {user} is painted in red, {target} wins.",
    "**BANG!** {target} breathes a sigh of relief as {user} has shot themself.",
  ];

  function getFlavorText(template: string[], user: User, target: User): string {
    const text = template[Math.floor(Math.random() * template.length)];
    return text
      .replace(/{user}/g, user.toString())
      .replace(/{target}/g, target.toString());
  }

  const updateGame = async (
    message: string,
    filter: "none" | "bw" | "red" = "none",
    disableButtons = false,
    disableShootSelf = false,
    imageTarget?: User,
  ) => {
    const target = imageTarget || opponentUser;
    const targetImageMember =
      target.id === inviterUser.id ? inviterMember : targetMember;
    const currentTurnImageMember =
      currentTurnUser.id === inviterUser.id ? inviterMember : targetMember;
    const imageBuffer = await createRussianImage(
      target,
      target.username,
      targetImageMember,
      currentTurnUser,
      currentTurnImageMember,
      filter,
    );
    const attachment = new AttachmentBuilder(imageBuffer, {
      name: "russian.png",
    });

    const embed = new EmbedBuilder()
      .setColor(filter === "red" ? "#FF0000" : "#000000")
      .setTitle("🔫 RUSSIAN ROULETTE")
      .setDescription(
        `**Turn:** ${currentTurnUser}\n` +
          `**Opponent:** ${opponentUser}\n` +
          `**Chamber:** ${currentSlot + 1}/6\n\n` +
          `${message}`,
      )
      .setImage("attachment://russian.png");

    const shootButton = new ButtonBuilder()
      .setCustomId("shoot")
      .setLabel("💥 Shoot")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disableButtons);

    const shootSelfButton = new ButtonBuilder()
      .setCustomId("shoot_self")
      .setLabel("🎲 Shoot Yourself")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableButtons || disableShootSelf);

    const skipButton = new ButtonBuilder()
      .setCustomId("skip")
      .setLabel("⏭️ Pass")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disableButtons);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      shootButton,
      shootSelfButton,
      skipButton,
    );

    await interaction.editReply({
      content: null,
      embeds: [embed],
      files: [attachment],
      components: [row],
    });
  };

  const startTurnTimer = () => {
    if (turnTimer) clearTimeout(turnTimer);
    turnTimer = setTimeout(async () => {
      const message = `**⏰ Time's up!** ${currentTurnUser} took too long. The gun passes to ${opponentUser}.`;
      [currentTurnUser, opponentUser] = [opponentUser, currentTurnUser];
      isBonusTurn = false;
      await updateGame(message, "none", false);
      startTurnTimer();
    }, 30000);
  };

  await updateGame("The cylinder spins... Make your move.");
  startTurnTimer();

  const collector = interaction.channel!.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes timeout
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== currentTurnUser.id) {
      await i.reply({
        content: "**It's not your turn!**",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    clearTimeout(turnTimer);
    await i.deferUpdate();

    turns++;
    const action = i.customId;
    let message = "";
    let filter: "none" | "bw" | "red" = "none";

    if (action === "shoot") {
      if (currentSlot === bulletSlot) {
        gameOver = true;
        message = getFlavorText(
          shootDeathFlavorTexts,
          currentTurnUser,
          opponentUser,
        );
        filter = "bw";
      } else {
        message = getFlavorText(
          shootFlavorTexts,
          currentTurnUser,
          opponentUser,
        );
        currentSlot++;
        [currentTurnUser, opponentUser] = [opponentUser, currentTurnUser];
        isBonusTurn = false;
      }
    } else if (action === "shoot_self") {
      if (currentSlot === bulletSlot) {
        gameOver = true;
        message = getFlavorText(
          shootSelfDeathFlavorTexts,
          currentTurnUser,
          opponentUser,
        );
        filter = "red";
      } else {
        message = getFlavorText(
          shootSelfFlavorTexts,
          currentTurnUser,
          opponentUser,
        );
        currentSlot++;
        isBonusTurn = true;
        message += `\n\n**🍀 ${currentTurnUser} gains a bonus turn for surviving a self-shot! However, they cannot do it again consecutively.**`;
      }
    } else if (action === "skip") {
      message = getFlavorText(skipFlavorTexts, currentTurnUser, opponentUser);
      [currentTurnUser, opponentUser] = [opponentUser, currentTurnUser];
      isBonusTurn = false;
    }

    if (gameOver) {
      const victim = action === "shoot_self" ? currentTurnUser : opponentUser;
      const winner = action === "shoot_self" ? opponentUser : currentTurnUser;
      const cause = action === "shoot_self" ? "shot_self" : "shot";

      await RussianStatsManager.recordGame(
        winner.id,
        winner.tag,
        victim.id,
        victim.tag,
        turns,
        currentSlot + 1,
        cause,
        interaction.guildId || undefined,
      );

      await updateGame(message, filter, true);
      collector.stop("game_over");
    } else {
      await updateGame(message, "none", false, isBonusTurn);
      startTurnTimer();
    }
  });

  collector.on("end", (collected, reason) => {
    LockManager.releaseLock(interaction.guildId!, "russian");
    if (turnTimer) clearTimeout(turnTimer);
    if (reason === "time") {
      interaction.editReply({
        content: "**Game timed out!**",
        components: [],
      });
    }
  });
}
