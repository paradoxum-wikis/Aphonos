import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
} from "discord.js";
import { container, gallery, text, V2 } from "../utils/v2.js";

const builder = new SlashCommandBuilder()
  .setName("anime")
  .setDescription("Summon a random anime image from the archives")
  .addStringOption((option) =>
    option
      .setName("include")
      .setDescription(
        "Include specific tags (comma-separated, e.g: girl, long_hair)",
      )
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName("exclude")
      .setDescription(
        "Exclude specific tags (comma-separated, e.g: boy, short_hair)",
      )
      .setRequired(false),
  );

const RATING_MODE_ENABLED = process.env.ANIME_RATING_MODE === "true";

if (RATING_MODE_ENABLED) {
  builder.addStringOption((option) =>
    option
      .setName("rating")
      .setDescription("Content rating filter")
      .addChoices(
        { name: "Safe", value: "safe" },
        { name: "Suggestive", value: "suggestive" },
        { name: "Borderline", value: "borderline" },
        { name: "Explicit", value: "explicit" },
      )
      .setRequired(false),
  );
}

export const data = builder;

interface AnimeImageResponse {
  id: number;
  url: string;
  width?: number;
  height?: number;
  artist_id?: number;
  artist_name?: string | null;
  tags: string[];
  source_url?: string | null;
  rating: "safe" | "suggestive" | "borderline" | "explicit";
  color_dominant?: number[];
  color_palette?: number[][];
}

const API_BASE_URL = "https://api.nekosapi.com/v4";
const FETCH_TIMEOUT = 15000; // 15 seconds

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  try {
    const includeParam = interaction.options.getString("include");
    const excludeParam = interaction.options.getString("exclude");
    let rating = interaction.options.getString("rating");

    if (process.env.ANIME_RATING_MODE !== "true") {
      rating = "safe";
    }

    const params = new URLSearchParams();
    params.append("limit", "1");

    if (includeParam) {
      const includeTags = includeParam
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0);
      if (includeTags.length > 0) {
        params.append("tags", includeTags.join(","));
      }
    }

    if (excludeParam) {
      const excludeTags = excludeParam
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0);
      if (excludeTags.length > 0) {
        params.append("without_tags", excludeTags.join(","));
      }
    }

    if (rating) {
      params.append("rating", rating);
    }

    const metadataUrl = `${API_BASE_URL}/images/random?${params.toString()}`;
    console.log(`[ANIME] Fetching metadata from: ${metadataUrl}`);

    const metadataResponse = await fetchT(metadataUrl, FETCH_TIMEOUT);

    if (!metadataResponse.ok) {
      throw new Error(
        `Metadata fetch failed with status: ${metadataResponse.status}`,
      );
    }

    const data = (await metadataResponse.json()) as AnimeImageResponse[];

    if (!data || data.length === 0) {
      throw new Error("No images found");
    }

    const imageData = data[0];
    const imageUrl = imageData.url;

    console.log(`[ANIME] Fetching image from: ${imageUrl}`);
    const imageResponse = await fetchT(imageUrl, FETCH_TIMEOUT);

    if (!imageResponse.ok) {
      throw new Error(
        `Image fetch failed with status: ${imageResponse.status}`,
      );
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType =
      imageResponse.headers.get("content-type") || "image/webp";
    const extension = contentType.split("/")[1] || "webp";
    const filename = `anime_${imageData.id}.${extension}`;
    const attachment = new AttachmentBuilder(imageBuffer, {
      name: filename,
    });

    const details = [`**ID:** ${imageData.id}`];
    if (RATING_MODE_ENABLED) details.push(`**Rating:** ${imageData.rating}`);
    if (imageData.artist_name)
      details.push(`**Artist:** ${imageData.artist_name}`);
    if (imageData.source_url)
      details.push(`**Source:** [Original Artwork](${imageData.source_url})`);
    if (imageData.tags && imageData.tags.length > 0) {
      const displayTags = imageData.tags.slice(0, 20);
      const tagString = displayTags.map((tag) => `\`${tag}\``).join(", ");
      const moreTagsText =
        imageData.tags.length > 20
          ? ` and ${imageData.tags.length - 20} more...`
          : "";
      details.push(
        `**Tags (${imageData.tags.length}):** ${tagString}${moreTagsText}`,
      );
    }

    await interaction.editReply({
      components: [
        container("#ff90c8")
          .addTextDisplayComponents(
            text(
              `## 🎨 ARTWORK SUMMONED\n**An image has been retrieved from the archives!**\n\n${details.join("\n")}\n\n-# Sacred archives of Nekos.`,
            ),
          )
          .addMediaGalleryComponents(gallery(`attachment://${filename}`)),
      ],
      files: [attachment],
      flags: V2,
    });
  } catch (error) {
    console.error("Error fetching image:", error);

    let errorMessage = "**THE ARCHIVES HAVE FAILED TO RESPOND!**";

    if (error instanceof Error) {
      if (error.message.includes("No images found")) {
        errorMessage =
          "**NO IMAGES FOUND MATCHING YOUR CRITERIA!** Try different tags or remove some filters.";
      } else if (error.message.includes("timeout")) {
        errorMessage =
          "**THE ARCHIVES ARE TAKING TOO LONG TO RESPOND!** The image server is slow. Please try again.";
      } else if (error.message.includes("403")) {
        errorMessage =
          "**ACCESS TO THE ARCHIVES IS FORBIDDEN!** The API may be temporarily unavailable.";
      }
    }

    await interaction.editReply({
      content: errorMessage,
    });
  }
}

async function fetchT(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
