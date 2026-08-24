import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";

export const V2: MessageFlags.IsComponentsV2 = MessageFlags.IsComponentsV2;
export const V2_EPHEMERAL:
  MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral =
  MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export function hex(c: string | number): number {
  if (typeof c === "number") return c;
  return Number.parseInt(c.startsWith("#") ? c.slice(1) : c, 16);
}

export function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function gallery(
  url: string,
  description?: string,
): MediaGalleryBuilder {
  const item = new MediaGalleryItemBuilder().setURL(url);
  if (description) item.setDescription(description);
  return new MediaGalleryBuilder().addItems(item);
}

export function thumb(url: string): ThumbnailBuilder {
  return new ThumbnailBuilder().setURL(url);
}

export function section(content: string, thumbnailUrl: string): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(text(content))
    .setThumbnailAccessory(thumb(thumbnailUrl));
}

export function container(color: string | number): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(hex(color));
}
