import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { container, text, V2 } from "../utils/v2.js";

interface mwResponse {
  query: {
    pages: Record<
      string,
      {
        revisions: {
          slots: {
            main: {
              "*": string;
            };
          };
        }[];
      }
    >;
  };
}

function cleanWikitext(text: string): string {
  text = text.replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2");
  text = text.replace(/'''([^']+)'''/g, "$1");
  text = text.replace(/''([^']+)''/g, "$1");
  return text;
}

export const data = new SlashCommandBuilder()
  .setName("trivia")
  .setDescription("Get a random trivia fact from a wiki")
  .addStringOption((option) =>
    option
      .setName("game")
      .setDescription("The game to fetch trivia for")
      .setRequired(false)
      .addChoices(
        { name: "ALTER EGO", value: "ae" },
        { name: "Tower Defense Simulator", value: "tds" },
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const game = interaction.options.getString("game") || "alterego";
  let url = "";
  let title = "";
  let footer = "";
  let color = "";

  if (game === "tds") {
    url =
      "https://tds.fandom.com/api.php?action=query&titles=Template:DYKBoxContent&prop=revisions&rvslots=main&rvprop=content&format=json";
    title = "📚 Did you know that in Tower Defense Simulator:";
    footer =
      "Verily, I have drawn forth this knowledge from the annals of TDS Wiki.";
    color = "#33577A";
  } else {
    url =
      "https://alter-ego.fandom.com/api.php?action=query&titles=ALTERPEDIA/DYK&prop=revisions&rvslots=main&rvprop=content&format=json";
    title = "📚 Did you know that in ALTER EGO:";
    footer =
      "Verily, I have drawn forth this knowledge from the annals of ALTERPEDIA.";
    color = "#e61f24";
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to fetch trivia");
    }
    const json = (await response.json()) as mwResponse;
    const pages = json.query.pages;
    const pageId = Object.keys(pages)[0];
    const pageText = pages[pageId].revisions[0].slots.main["*"];
    const options = Array.from(
      pageText.matchAll(/<option>(.*?)<\/option>/gs),
      (m) => m[1].trim(),
    );
    if (options.length === 0) {
      throw new Error("No trivia options found");
    }
    const trivia = options[Math.floor(Math.random() * options.length)];
    const cleanedTrivia = cleanWikitext(trivia);
    await interaction.reply({
      components: [
        container(color).addTextDisplayComponents(
          text(`## ${title}\n${cleanedTrivia}\n\n-# ${footer}`),
        ),
      ],
      flags: V2,
    });
  } catch (error) {
    console.error("Error fetching trivia:", error);
    await interaction.reply({
      content:
        "The fetching of trivia hath failed. Prithee, attempt once more anon.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
