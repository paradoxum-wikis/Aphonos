import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { container, text, V2 } from "../utils/v2.js";

function buildFormData(assetId: string): { body: string; boundary: string } {
  const boundary =
    "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="assetId"`,
    "",
    assetId,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return { body, boundary };
}

async function getRobloxAssetDownloadLink(assetId: string): Promise<string> {
  const response = await fetch("https://services.toru.ca/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BOT-AUTH": process.env.SERVICE7!,
    },
    body: JSON.stringify({ assetId }),
  });
  if (!response.ok) {
    throw new Error(`API responded with status ${response.status}`);
  }
  const result = (await response.json()) as { file?: string; error?: unknown };
  if (result.error || !result.file) {
    throw new Error("API Error: " + JSON.stringify(result));
  }
  return result.file;
}

export const data = new SlashCommandBuilder()
  .setName("asset")
  .setDescription("Fetch a Roblox asset download link by ID")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("Roblox asset ID (e.g: 77983090842836)")
      .setRequired(true),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const assetId = interaction.options.getString("id", true).trim();

  if (!/^\d+$/.test(assetId)) {
    await interaction.reply({
      content: "❌ Please provide a valid numeric asset ID.",
    });
    return;
  }

  await interaction.deferReply();

  try {
    const downloadUrl = await getRobloxAssetDownloadLink(assetId);

    await interaction.editReply({
      components: [
        container("#D99E82").addTextDisplayComponents(
          text(
            `## 📦 ASSET RETRIEVED\nAsset **${assetId}** is ready.\n[Click here to download the file](${downloadUrl}).\n\n-# API is experimental, it may break at any time.`,
          ),
        ),
      ],
      flags: V2,
    });
  } catch (error) {
    console.error("Failed to fetch Roblox asset:", error);
    await interaction.editReply({
      content:
        "❌ I couldn't retrieve that asset. Please try again later or verify the ID.",
    });
  }
}
