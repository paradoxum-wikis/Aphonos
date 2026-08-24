import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from "discord.js";
import { container, text, V2 } from "../utils/v2.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Display sacred instruments available to the faithful");

interface CommandInfo {
  name: string;
  value: string;
  category: string;
}

const commands: CommandInfo[] = [
  // Admin
  {
    name: "/ban @user [-reason]",
    value: "Eternal banishment for heretical defiance",
    category: "admin",
  },
  {
    name: "/interchat >subcommand",
    value: "Create a chatroom across servers",
    category: "admin",
  },
  {
    name: "/removesin -entryid",
    value: "Absolve a soul and undo its punishment",
    category: "admin",
  },
  {
    name: "/removelink @user",
    value: "Sever the link between a Discord soul and a Fandom alter",
    category: "admin",
  },
  {
    name: "/webhook >subcommand",
    value: "Create webhook for the server",
    category: "admin",
  },
  {
    name: "/reactionrole >subcommand",
    value: "Manage reaction role rules (add/remove/list)",
    category: "admin",
  },
  // Moderator
  {
    name: "/kick @user [-reason]",
    value: "Cast out those who defy sacred alteruism",
    category: "moderator",
  },
  {
    name: "/timeout @user -minutes [-reason]",
    value: "Impose silence upon the wayward",
    category: "moderator",
  },
  {
    name: "/clear -amount",
    value: "Purge up to 100 messages from the sacred halls",
    category: "moderator",
  },
  {
    name: "/warn @user [-reason]",
    value: "Issue divine warning to the straying",
    category: "moderator",
  },
  {
    name: "/archives [-actionid]",
    value: "View the seraphic archives of purged messages",
    category: "moderator",
  },
  {
    name: "/slowmode -seconds [-reason]",
    value: "Impose restraint upon the flow of messages",
    category: "moderator",
  },
  // Basic - Page 1
  {
    name: "/aura [@user]",
    value:
      "Calculate thy aura and view fighter profile based on one's display name",
    category: "basic1",
  },
  {
    name: "/avatar [@user] [-global]",
    value: "Behold the divine visage of a soul",
    category: "basic1",
  },
  {
    name: "/anime [-include] [-exclude] [-rating]",
    value: "Summon a random anime image from the cultured realms",
    category: "basic1",
  },
  {
    name: "/battle [@fighter1] [@fighter2] [-ranked]",
    value:
      "Witness an epic clash between two souls in divine combat (ranked requires consent)",
    category: "basic1",
  },
  {
    name: "/battlestats >subcommand [@user] [-mode] [-limit]",
    value: "View deathbattle statistics and leaderboards",
    category: "basic1",
  },
  {
    name: "/tourney",
    value: "Aphonos Playoffs...",
    category: "basic1",
  },
  {
    name: "/civilization",
    value: "A game of civilization.",
    category: "basic1",
  },
  {
    name: "/russian @target",
    value: "Play a game of Russian Roulette with another user",
    category: "basic3",
  },
  {
    name: "/russianstats >subcommand [@user] [-limit]",
    value: "View Russian Roulette statistics and leaderboard",
    category: "basic3",
  },
  {
    name: "/furry [@user]",
    value: "Check whether a user is a furry",
    category: "basic2",
  },
  {
    name: "/oracle -question",
    value: "Consult the oracles for divine wisdom (8ball)",
    category: "basic3",
  },
  {
    name: "/ship [@user1] [@user2]",
    value: "Ship two users together and see their compatibility",
    category: "basic3",
  },
  // Basic - Page 2
  {
    name: "/info",
    value: "Behold the knowledge of Aphonos",
    category: "basic2",
  },
  {
    name: "/asset -id",
    value: "Generate a download link for a Roblox asset by ID",
    category: "basic1",
  },
  {
    name: "/link [-fandomusername]",
    value: "Link thy Discord soul with thy Fandom account",
    category: "basic2",
  },
  {
    name: "/checklink [@user]",
    value: "Check if a user is linked to Fandom and sync roles",
    category: "basic2",
  },
  {
    name: "/sins [@user]",
    value: "Behold the records of the damned",
    category: "basic3",
  },
  {
    name: "/syncroles",
    value: "Synchronize the top 5 contributors roles with the rankings",
    category: "basic3",
  },
  {
    name: "/trivia [-game]",
    value: "Fetch a random trivia fact from a wiki",
    category: "basic3",
  },
  {
    name: "/family >subcommand",
    value: "Manage and view family relationships and trees",
    category: "basic2",
  },
  {
    name: "/help",
    value: "Display these instruments",
    category: "basic2",
  },
];

const categories = [
  {
    name: "🥀 ALTERMINISTRATOR",
    commands: commands.filter((cmd) => cmd.category === "admin"),
  },
  {
    name: "⚖️ MODERATOR",
    commands: commands.filter((cmd) => cmd.category === "moderator"),
  },
  {
    name: "📚 BASIC 1",
    commands: commands.filter((cmd) => cmd.category === "basic1"),
  },
  {
    name: "📚 BASIC 2",
    commands: commands.filter((cmd) => cmd.category === "basic2"),
  },
  {
    name: "📚 BASIC 3",
    commands: commands.filter((cmd) => cmd.category === "basic3"),
  },
];

function createPage(categoryIndex: number) {
  const category = categories[categoryIndex];
  const list = category.commands
    .map((cmd) => `**${cmd.name}**\n${cmd.value}`)
    .join("\n\n");

  return container("#00CED1").addTextDisplayComponents(
    text(
      `## 📜 DIVINE INSTRUMENTS OF APHONOS\n### ${category.name}\n${list}\n-# Page ${categoryIndex + 1} of ${categories.length}`,
    ),
  );
}

function createButtons(
  currentPage: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  const buttonLabels = ["⏮️ Admin", "◀️ Previous", "Next ▶️", "Basic 3 ⏭️"];

  if (currentPage === totalPages - 1) {
    buttonLabels[3] = "Admin ⏭️";
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("first")
      .setLabel(buttonLabels[0])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("previous")
      .setLabel(buttonLabels[1])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel(buttonLabels[2])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages - 1),
    new ButtonBuilder()
      .setCustomId("last")
      .setLabel(buttonLabels[3])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages - 1),
  );
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const totalPages = categories.length;
  let currentPage = 0;

  const response = await interaction.reply({
    components: [
      createPage(currentPage).addActionRowComponents(
        createButtons(currentPage, totalPages),
      ),
    ],
    flags: V2,
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300000, // 5 minutes
  });

  collector.on("collect", async (buttonInteraction) => {
    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: "**Thou cannot control another's commandments!**",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    switch (buttonInteraction.customId) {
      case "first":
        currentPage = 0;
        break;
      case "previous":
        currentPage = Math.max(0, currentPage - 1);
        break;
      case "next":
        currentPage = Math.min(totalPages - 1, currentPage + 1);
        break;
      case "last":
        currentPage = totalPages - 1;
        break;
    }

    await buttonInteraction.update({
      components: [
        createPage(currentPage).addActionRowComponents(
          createButtons(currentPage, totalPages),
        ),
      ],
      flags: V2,
    });
  });

  collector.on("end", async () => {
    const disabledButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("first")
        .setLabel("⏮️ Admin")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("previous")
        .setLabel("◀️ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("Next ▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("last")
        .setLabel("Basic 3 ⏭️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    response
      .edit({
        components: [
          createPage(currentPage).addActionRowComponents(disabledButtons),
        ],
        flags: V2,
      })
      .catch(() => {});
  });
}
