import type { Message, MessageCreateOptions } from "discord.js";
import { container, text, V2 } from "../v2.js";
import type { SeriesState } from "./types.js";
import { CONFERENCE } from "./types.js";

export type MessagePoster = (payload: MessageCreateOptions) => Promise<Message>;

export const COLOR = {
  exo: CONFERENCE.exo.color,
  twoX: CONFERENCE.two_x.color,
  finals: 0xffd700,
  neutral: 0xab06fa,
} as const;

export function seriesEmbedColor(series: SeriesState): number {
  if (series.round === "final") return COLOR.finals;
  if (
    series.conference === "two_x" ||
    (series.subgroup && series.subgroup >= 3)
  )
    return COLOR.twoX;
  return COLOR.exo;
}

export function isCollectorTimeout(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { code?: string }).code === "InteractionCollectorError"
  );
}

export function timeoutPayload(resumeHint: string) {
  return {
    flags: V2,
    components: [
      container(COLOR.neutral).addTextDisplayComponents(
        text(`## Aphonos Playoffs\nThis step timed out.\n${resumeHint}`),
      ),
    ],
  };
}
