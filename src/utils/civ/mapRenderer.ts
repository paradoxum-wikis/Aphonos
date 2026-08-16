import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { PROVINCE_IDS } from "./map.js";
import { bandFor, type CivState, type Province, type Terrain } from "./types.js";

const TERRAIN: Record<Terrain, { color: string; label: string }> = {
  plain: { color: "#9CCC65", label: "Plain" },
  waste: { color: "#8D6E63", label: "Waste" },
  coast: { color: "#29B6F6", label: "Coast" },
  high: { color: "#EF5350", label: "Highland" },
  grove: { color: "#66BB6A", label: "Grove" },
};

const COLS = 4;
const ROWS = 4;
const TILE_W = 280;
const TILE_H = 150;
const GAP = 18;
const PAD = 40;
const HEADER = 48;
const LEGEND_H = 44;

const FONT = "'URW Gothic', sans-serif";

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTile(
  ctx: SKRSContext2D,
  state: CivState,
  p: Province & { x: number; y: number },
): void {
  const t = TERRAIN[p.terrain];
  const owner = p.owner ? state.factions[p.owner] : undefined;
  const capital = !!owner && owner.capital === p.id;

  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + TILE_H);
  g.addColorStop(0, "#22262D");
  g.addColorStop(1, "#14171D");
  ctx.fillStyle = g;
  roundRect(ctx, p.x, p.y, TILE_W, TILE_H, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = capital
    ? "#FFFFFF"
    : owner
      ? `${t.color}99`
      : "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = capital ? 3 : 2;
  roundRect(ctx, p.x, p.y, TILE_W, TILE_H, 12);
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(`${capital ? "★ " : ""}${p.name}`, p.x + 16, p.y + 28);

  ctx.fillStyle = "#9AA3AF";
  ctx.font = `15px ${FONT}`;
  ctx.fillText(owner ? owner.name : "unclaimed", p.x + 16, p.y + 62);

  ctx.font = `14px ${FONT}`;
  if (p.development !== "empty") {
    ctx.fillStyle = "#C9D1D9";
    ctx.fillText(p.development, p.x + 16, p.y + 94);
  } else {
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillText(t.label, p.x + 16, p.y + 94);
  }
}

export async function renderCivMap(state: CivState): Promise<Buffer> {
  const width = PAD * 2 + COLS * TILE_W + (COLS - 1) * GAP;
  const height = HEADER + PAD * 2 + ROWS * TILE_H + (ROWS - 1) * GAP + LEGEND_H;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0B0E13");
  bg.addColorStop(1, "#1A1D24");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 60) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += 60) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#9AA3AF";
  ctx.font = `16px ${FONT}`;
  ctx.fillText(
    `tick ${state.tick} · ${bandFor(state.tick)} · ${Object.keys(state.factions).length} factions`,
    PAD,
    26,
  );

  const legend = Object.values(TERRAIN);
  const swatch = 14;
  const gap = 22;
  const legendW =
    legend.reduce(
      (s, t) => s + swatch + 6 + ctx.measureText(t.label).width + gap,
      0,
    ) - gap;
  let lx = (width - legendW) / 2;
  const ly = height - LEGEND_H / 2;
  ctx.font = `14px ${FONT}`;
  for (const t of legend) {
    ctx.fillStyle = t.color;
    roundRect(ctx, lx, ly - swatch / 2, swatch, swatch, 3);
    ctx.fill();
    ctx.fillStyle = "#9AA3AF";
    ctx.fillText(t.label, lx + swatch + 6, ly);
    lx += swatch + 6 + ctx.measureText(t.label).width + gap;
  }

  const startX = PAD;
  const startY = HEADER + PAD;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = PROVINCE_IDS[r * COLS + c];
      const p = state.provinces.find((q) => q.id === id);
      if (!p) continue;
      drawTile(ctx, state, {
        ...p,
        x: startX + c * (TILE_W + GAP),
        y: startY + r * (TILE_H + GAP),
      });
    }
  }

  return canvas.encode("png");
}
