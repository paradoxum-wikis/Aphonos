import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  GuildMember,
  User,
  MessageFlags,
} from "discord.js";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import path from "path";

export const data = new SlashCommandBuilder()
  .setName("ship")
  .setDescription("Ship two users together and see their compatibility!")
  .addUserOption((option) =>
    option
      .setName("user1")
      .setDescription("First user to ship")
      .setRequired(false),
  )
  .addUserOption((option) =>
    option
      .setName("user2")
      .setDescription("Second user to ship")
      .setRequired(false),
  );

function createShipName(name1: string, name2: string): string {
  const firstHalf = name1.slice(0, Math.ceil(name1.length / 2));
  const secondHalf = name2.slice(Math.floor(name2.length / 2));
  return firstHalf + secondHalf;
}

function createRealShipName(name1: string, name2: string): string {
  const sortedNames = [name1, name2].sort();
  const firstHalf = sortedNames[0].slice(
    0,
    Math.ceil(sortedNames[0].length / 2),
  );
  const secondHalf = sortedNames[1].slice(
    Math.floor(sortedNames[1].length / 2),
  );
  return firstHalf + secondHalf;
}

function calculateShipPercentage(name1: string, name2: string): number {
  const realShipName = createRealShipName(name1, name2);
  const combinedNames = realShipName.toLowerCase();
  let hash = 0;

  for (let i = 0; i < combinedNames.length; i++) {
    const char = combinedNames.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return Math.abs(hash) % 101;
}

function createProgressBar(percentage: number): string {
  const totalBars = 10;
  const filledBars = Math.round((percentage / 100) * totalBars);
  const emptyBars = totalBars - filledBars;

  return "🟪".repeat(filledBars) + ":black_large_square:".repeat(emptyBars);
}

function getShipRating(percentage: number): string {
  if (percentage === 100) return "Soulmates! 💗";
  if (percentage >= 95) return "Perfect Couple! 😍";
  if (percentage >= 80) return "Pretty Good! 😳";
  if (percentage >= 60) return "Great Match! 😊";
  if (percentage >= 40) return "Maybe Not... 🙂";
  if (percentage >= 20) return "Not Too Great... 😕";
  if (percentage >= 1) return "Terrible Match... 😬";
  if (percentage === 0) return "Would Beat Each Other... 💔";
  return "Invalid Percentage ❌";
}

function getFlavorText(percentage: number): string {
  const flavorTexts = {
    100: "The stars have aligned perfectly!",
    95: "Written in the heavens above!",
    90: "Destiny has spoken loud and clear!",
    85: "Ego approves of this union!",
    80: "Ego has blessed this pairing!",
    75: "A match made in paradise!",
    70: "Perhaps this is fate!",
    65: "Love is in the air!",
    60: "There's potential here...",
    55: "The magic is questionable...",
    50: "Perfectly balanced... as all things should be!",
    45: "The oracles are mixed on this pairing...",
    40: "Proceed with caution...",
    35: "The omens are not favorable...",
    30: "Maybe stick with friendship...",
    25: "The spirits advise distance...",
    20: "Danger ahead, turn back now!",
    15: "Ego stares back disapprovingly...",
    10: "Chaos would ensue from this union!",
    5: "Their alters are about to clash...",
    0: "May Ego have mercy on their souls...",
  };

  const keys = Object.keys(flavorTexts)
    .map(Number)
    .sort((a, b) => b - a);
  for (const key of keys) {
    if (percentage >= key) {
      return flavorTexts[key as keyof typeof flavorTexts];
    }
  }
  return "The divine forces are confused... 🤔";
}

async function createShipImage(
  user1: User,
  user2: User,
  user1Member: GuildMember | null,
  user2Member: GuildMember | null,
  shipName: string,
  percentage: number,
): Promise<Buffer> {
  const canvas = createCanvas(1920, 1080);
  const ctx = canvas.getContext("2d");
  const backgroundFile = percentage >= 60 ? "ship.png" : "ship2.png";

  const possiblePaths = [
    path.join(process.cwd(), "src", backgroundFile),
    path.join(process.cwd(), "dist", backgroundFile),
    path.join(process.cwd(), "altershaper-bot", "dist", backgroundFile),
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

  try {
    if (background) {
      ctx.drawImage(background, 0, 0, 1920, 1080);
    } else {
      ctx.fillStyle = percentage >= 60 ? "#FFB6C1" : "#888888";
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 66px 'URW Gothic', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SHIP", 960, 530);
    }

    const user1AvatarHash = user1Member?.avatar ?? user1.avatar;
    const user1AnimatedAvatar = user1AvatarHash?.startsWith("a_");
    const user1AvatarUrl =
      user1Member?.displayAvatarURL({
        extension: user1AnimatedAvatar ? "gif" : "png",
        size: 512,
      }) ??
      user1.displayAvatarURL({
        extension: user1AnimatedAvatar ? "gif" : "png",
        size: 512,
      });

    const user2AvatarHash = user2Member?.avatar ?? user2.avatar;
    const user2AnimatedAvatar = user2AvatarHash?.startsWith("a_");
    const user2AvatarUrl =
      user2Member?.displayAvatarURL({
        extension: user2AnimatedAvatar ? "gif" : "png",
        size: 512,
      }) ??
      user2.displayAvatarURL({
        extension: user2AnimatedAvatar ? "gif" : "png",
        size: 512,
      });

    const avatar1 = await loadImage(user1AvatarUrl);
    const avatar2 = await loadImage(user2AvatarUrl);

    // avatars
    ctx.drawImage(avatar1, 125, 285, 512, 512);
    ctx.drawImage(avatar2, 1283, 285, 512, 512);

    // ship name
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 66px 'URW Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(shipName, 960, 952);

    return canvas.encode("png");
  } catch (error) {
    console.error("Error creating ship image:", error);

    ctx.fillStyle = "#FFB6C1";
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = "#000";
    ctx.font = "bold 66px 'URW Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SHIP", 960, 530);
    return canvas.encode("png");
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  let user1 = interaction.options.getUser("user1");
  let user2 = interaction.options.getUser("user2");

  if (!user1 || !user2) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content:
          "**You need to specify users when using this command outside of a server!**",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const members = await interaction.guild!.members.fetch();

      // If no user1, randomize but exclude user2
      if (!user1) {
        const availableMembers = user2
          ? members.filter((member) => member.user.id !== user2!.id)
          : members;

        if (availableMembers.size === 0) {
          await interaction.reply({
            content: "**No available members found to ship with!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const randomMember = availableMembers.random();
        user1 = randomMember!.user;
      }

      // opposite of 1st case
      if (!user2) {
        const availableMembers = members.filter(
          (member) => member.user.id !== user1!.id,
        );

        if (availableMembers.size === 0) {
          await interaction.reply({
            content: "**No other members found in this server to ship with!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const randomMember = availableMembers.random();
        user2 = randomMember!.user;
      }
    } catch (error) {
      await interaction.reply({
        content: "**Failed to find random members to ship with!**",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (user1.id === user2.id) {
    await interaction.reply({
      content: "**You can't ship someone with themself!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    let user1Name: string;
    let user2Name: string;
    let user1Member: GuildMember | null = null;
    let user2Member: GuildMember | null = null;

    if (interaction.inGuild()) {
      user1Member = await interaction.guild!.members.fetch(user1.id);
      user2Member = await interaction.guild!.members.fetch(user2.id);
      user1Name = user1Member.displayName;
      user2Name = user2Member.displayName;
    } else {
      user1Name = user1.username;
      user2Name = user2.username;
    }

    const shipName = createShipName(user1Name, user2Name);
    const percentage = calculateShipPercentage(user1Name, user2Name);
    const rating = getShipRating(percentage);
    const progressBar = createProgressBar(percentage);
    const flavorText = getFlavorText(percentage);

    const imageBuffer = await createShipImage(
      user1,
      user2,
      user1Member,
      user2Member,
      shipName,
      percentage,
    );
    const attachment = new AttachmentBuilder(imageBuffer, { name: "ship.png" });

    const embed = new EmbedBuilder()
      .setColor(percentage >= 60 ? "#ff00cd" : "#bf40a2")
      .setTitle("💕 HERE COMES THE SHIP")
      .setDescription(
        `**${user1Name} × ${user2Name}**\n` +
          `**Ship Name:** ${shipName}\n` +
          `${percentage}% ${progressBar} ${rating}`,
      )
      .setImage("attachment://ship.png")
      .setFooter({ text: flavorText })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  } catch (error) {
    console.error("Ship error:", error);
    await interaction.editReply({
      content: "**Failed to create ship!**",
    });
  }
}
