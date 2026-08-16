import {
  createCanvas,
  loadImage,
  CanvasRenderingContext2D,
  CanvasGradient,
  Image,
} from "canvas";

export interface TreeMember {
  name: string;
  avatarUrl: string | null;
  isRoot: boolean;
}

export interface TreeEdges {
  parents: [string, string][];
  spouses: [string, string][];
  siblings: [string, string][];
}

interface Placement {
  x: number;
  y: number;
  row: number;
}

interface RoutePoint {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class FamilyTreeRenderer {
  private static readonly NODE_W = 250;
  private static readonly NODE_H = 96;
  private static readonly AVATAR = 64;
  private static readonly SPOUSE_GAP = 36;
  private static readonly NODE_GAP = 70;
  private static readonly ROW_GAP = 150;
  private static readonly PADDING = 60;
  private static readonly HEADER = 70;
  private static readonly MAX_ROW_W = 1800;

  private static readonly COLORS = {
    spouse: "#FF6B9D",
    parent: "#4FACFE",
    child: "#43E97B",
    sibling: "#A770EF",
  };

  private static readonly LEGEND: [string, string, string | null, boolean][] = [
    ["Spouse", this.COLORS.spouse, null, false],
    ["Parent / Child", this.COLORS.parent, this.COLORS.child, false],
    ["Sibling", this.COLORS.sibling, null, true],
  ];

  public static async generateTree(
    members: Map<string, TreeMember>,
    edges: TreeEdges,
  ): Promise<Buffer> {
    const ids = [...members.keys()];

    // longest path over parent edges
    // SCC condensed so adoption cycles share a row
    const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
    const radj = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const [p, c] of edges.parents) {
      adj.get(p)!.push(c);
      radj.get(c)!.push(p);
    }

    const visited = new Set<string>();
    const post: string[] = [];
    const dfs1 = (v: string) => {
      visited.add(v);
      for (const w of adj.get(v)!) if (!visited.has(w)) dfs1(w);
      post.push(v);
    };
    for (const id of ids) if (!visited.has(id)) dfs1(id);

    const comp = new Map<string, number>();
    const comps: string[][] = [];
    const dfs2 = (v: string, k: number) => {
      comp.set(v, k);
      comps[k].push(v);
      for (const w of radj.get(v)!) if (!comp.has(w)) dfs2(w, k);
    };
    for (let i = post.length - 1; i >= 0; i--) {
      if (!comp.has(post[i])) {
        comps.push([]);
        dfs2(post[i], comps.length - 1);
      }
    }

    const depth = new Map<string, number>(ids.map((id) => [id, 0]));
    for (const list of comps) {
      const base = Math.max(...list.map((v) => depth.get(v)!));
      for (const v of list) depth.set(v, base);
      for (const v of list) {
        for (const c of adj.get(v)!) {
          if (comp.get(c) !== comp.get(v))
            depth.set(c, Math.max(depth.get(c)!, base + 1));
        }
      }
    }

    const uf = new Map<string, string>(ids.map((id) => [id, id]));
    const find = (id: string): string => {
      const p = uf.get(id)!;
      if (p === id) return id;
      const root = find(p);
      uf.set(id, root);
      return root;
    };
    for (const [a, b] of edges.spouses) uf.set(find(a), find(b));

    const units = new Map<string, string[]>();
    for (const id of ids) {
      const root = find(id);
      if (!units.has(root)) units.set(root, []);
      units.get(root)!.push(id);
    }
    for (const list of units.values()) {
      const row = Math.max(...list.map((id) => depth.get(id)!));
      for (const id of list) depth.set(id, row);
    }

    const sortedDepths = [...new Set([...depth.values()])].sort(
      (a, b) => a - b,
    );

    const parentsOf = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const [p, c] of edges.parents) parentsOf.get(c)!.push(p);

    // gens wrap onto extra lines when too wide
    const placements = new Map<string, Placement>();
    const unitWidth = (list: string[]) =>
      list.length * this.NODE_W + (list.length - 1) * this.SPOUSE_GAP;
    const lineIds: string[][] = [];
    const lineW: number[] = [];

    for (const d of sortedDepths) {
      const rowUnits = [...units.values()].filter(
        (list) => depth.get(list[0]) === d,
      );
      const anchorOf = new Map<string, number | null>();
      for (const list of rowUnits) {
        for (const id of list) {
          const xs = (parentsOf.get(id) ?? [])
            .map((p) => placements.get(p))
            .filter((pl): pl is Placement => pl !== undefined)
            .map((pl) => pl.x + this.NODE_W / 2);
          anchorOf.set(
            id,
            xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
          );
        }
      }
      const unitAnchor = (list: string[]) => {
        const xs = list
          .map((id) => anchorOf.get(id))
          .filter((x): x is number => x !== null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
      };
      rowUnits.sort((a, b) => unitAnchor(a) - unitAnchor(b));
      for (const list of rowUnits)
        list.sort((a, b) => (anchorOf.get(a) ?? 0) - (anchorOf.get(b) ?? 0));

      const maxContent = this.MAX_ROW_W - 2 * this.PADDING;
      const genLines: string[][][] = [];
      let cur: string[][] = [];
      let curW = 0;
      for (const list of rowUnits) {
        const w = unitWidth(list);
        if (cur.length && curW + this.NODE_GAP + w > maxContent) {
          genLines.push(cur);
          cur = [];
          curW = 0;
        }
        cur.push(list);
        curW += (cur.length > 1 ? this.NODE_GAP : 0) + w;
      }
      if (cur.length) genLines.push(cur);

      for (const genLine of genLines) {
        const linePlacements: string[] = [];
        let cursor = 0;
        for (const list of genLine) {
          for (const id of list) {
            placements.set(id, {
              x: cursor,
              y: this.HEADER + lineIds.length * (this.NODE_H + this.ROW_GAP),
              row: lineIds.length,
            });
            linePlacements.push(id);
            cursor += this.NODE_W + this.SPOUSE_GAP;
          }
          cursor += this.NODE_GAP - this.SPOUSE_GAP;
        }
        lineIds.push(linePlacements);
        lineW.push(cursor - this.NODE_GAP);
      }
    }

    const scratch = createCanvas(10, 10).getContext("2d");
    const width =
      Math.max(Math.max(...lineW), this.legendWidth(scratch)) +
      2 * this.PADDING;
    for (const [li, ids2] of lineIds.entries()) {
      const dx = this.PADDING + (width - 2 * this.PADDING - lineW[li]) / 2;
      for (const id of ids2) placements.get(id)!.x += dx;
    }

    const height =
      this.HEADER +
      lineIds.length * this.NODE_H +
      (lineIds.length - 1) * this.ROW_GAP +
      this.PADDING;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.lineJoin = "round";
    this.drawBackground(ctx, width, height);

    const MARGIN = 8;
    const rects = new Map<string, Rect>(
      [...placements].map(([id, p]) => [
        id,
        {
          x: p.x - MARGIN,
          y: p.y - MARGIN,
          w: this.NODE_W + 2 * MARGIN,
          h: this.NODE_H + 2 * MARGIN,
        },
      ]),
    );
    const obstaclesFor = (a: string, b: string): Rect[] =>
      [...rects].filter(([id]) => id !== a && id !== b).map(([, r]) => r);

    for (const [a, b] of edges.siblings)
      this.drawSiblingEdge(
        ctx,
        placements.get(a)!,
        placements.get(b)!,
        obstaclesFor(a, b),
      );
    for (const [a, b] of edges.spouses)
      this.drawSpouseEdge(
        ctx,
        placements.get(a)!,
        placements.get(b)!,
        obstaclesFor(a, b),
      );
    for (const [p, c] of edges.parents)
      this.drawParentEdge(
        ctx,
        placements.get(p)!,
        placements.get(c)!,
        obstaclesFor(p, c),
      );

    this.drawLegend(ctx);

    const avatars = new Map<string, Image | null>();
    await Promise.all(
      ids.map(async (id) => {
        const url = members.get(id)!.avatarUrl;
        avatars.set(id, url ? await loadImage(url).catch(() => null) : null);
      }),
    );
    for (const [id, pl] of placements) {
      this.drawCard(ctx, members.get(id)!, avatars.get(id)!, pl);
    }

    return canvas.toBuffer("image/png");
  }

  private static drawBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#000000");
    gradient.addColorStop(0.5, "#1A1A1A");
    gradient.addColorStop(1, "#2D2D2D");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
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
  }

  private static legendWidth(ctx: CanvasRenderingContext2D): number {
    ctx.font = "20px 'URW Gothic', sans-serif";
    return (
      this.LEGEND.reduce(
        (s, [label]) => s + 94 + ctx.measureText(label).width,
        0,
      ) - 48
    );
  }

  private static drawLegend(ctx: CanvasRenderingContext2D): void {
    ctx.font = "20px 'URW Gothic', sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    let x = this.PADDING;
    for (const [label, color, color2, dashed] of this.LEGEND) {
      if (color2) {
        const gradient = ctx.createLinearGradient(x, 0, x + 36, 0);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color2);
        ctx.strokeStyle = gradient;
      } else {
        ctx.strokeStyle = color;
      }
      ctx.setLineDash(dashed ? [8, 7] : []);
      ctx.beginPath();
      ctx.moveTo(x, 35);
      ctx.lineTo(x + 36, 35);
      ctx.stroke();
      ctx.fillText(label, x + 46, 36);
      x += 46 + ctx.measureText(label).width + 48;
    }
    ctx.setLineDash([]);
  }

  private static borderAnchor(
    p: Placement,
    tx: number,
    ty: number,
  ): { x: number; y: number } {
    const cx = p.x + this.NODE_W / 2;
    const cy = p.y + this.NODE_H / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const t = Math.min(
      dx !== 0 ? this.NODE_W / 2 / Math.abs(dx) : Infinity,
      dy !== 0 ? this.NODE_H / 2 / Math.abs(dy) : Infinity,
    );
    return { x: cx + dx * t, y: cy + dy * t };
  }

  private static crossRowControls(
    a: RoutePoint,
    b: RoutePoint,
  ): [RoutePoint, RoutePoint, RoutePoint, RoutePoint] {
    const sx = b.x >= a.x ? 1 : -1;
    const hx = Math.max(60, Math.abs(b.x - a.x) / 2);
    return [a, { x: a.x + sx * hx, y: a.y }, { x: b.x - sx * hx, y: b.y }, b];
  }

  private static drawSiblingEdge(
    ctx: CanvasRenderingContext2D,
    pa: Placement,
    pb: Placement,
    obs: Rect[],
  ): void {
    ctx.strokeStyle = this.COLORS.sibling;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 7]);
    if (pa.row === pb.row) {
      const dir = pb.x > pa.x ? 1 : -1;
      const x1 = pa.x + this.NODE_W / 2 + dir * 18;
      const x2 = pb.x + this.NODE_W / 2 - dir * 18;
      const y = pa.y + this.NODE_H;
      const sag = y + 46;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.bezierCurveTo(x1, sag, x2, sag, x2, y);
    } else {
      const a = this.borderAnchor(
        pa,
        pb.x + this.NODE_W / 2,
        pb.y + this.NODE_H / 2,
      );
      const b = this.borderAnchor(
        pb,
        pa.x + this.NODE_W / 2,
        pa.y + this.NODE_H / 2,
      );
      const c = this.crossRowControls(a, b);
      if (this.curveBlocked(this.cubicSamples(c), obs)) {
        this.strokePolyline(ctx, this.routeAround(obs, a, b));
      } else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, b.x, b.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private static drawSpouseEdge(
    ctx: CanvasRenderingContext2D,
    pa: Placement,
    pb: Placement,
    obs: Rect[],
  ): void {
    const a = this.borderAnchor(
      pa,
      pb.x + this.NODE_W / 2,
      pb.y + this.NODE_H / 2,
    );
    const b = this.borderAnchor(
      pb,
      pa.x + this.NODE_W / 2,
      pa.y + this.NODE_H / 2,
    );
    ctx.strokeStyle = this.COLORS.spouse;
    ctx.lineWidth = 3.5;
    // marriage chains can leave spouses non-adjacent inside their unit
    let pts: RoutePoint[] = [a, b];
    if (this.polylineBlocked(pts, obs)) pts = this.routeAround(obs, a, b);
    this.strokePolyline(ctx, pts);
    const mid = this.polylineMidpoint(pts);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private static parentGradient(
    ctx: CanvasRenderingContext2D,
    from: RoutePoint,
    to: RoutePoint,
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    gradient.addColorStop(0, this.COLORS.parent);
    gradient.addColorStop(1, this.COLORS.child);
    return gradient;
  }

  private static drawParentEdge(
    ctx: CanvasRenderingContext2D,
    pp: Placement,
    pc: Placement,
    obs: Rect[],
  ): void {
    ctx.lineWidth = 3;
    if (pc.row > pp.row) {
      const x1 = pp.x + this.NODE_W / 2;
      const x2 = pc.x + this.NODE_W / 2;
      const channel = pc.y - this.ROW_GAP / 2;
      let pts: RoutePoint[] = [
        { x: x1, y: pp.y + this.NODE_H },
        { x: x1, y: channel },
        { x: x2, y: channel },
        { x: x2, y: pc.y },
      ];
      if (this.polylineBlocked(pts, obs))
        pts = this.routeAround(obs, pts[0], pts[3]);
      ctx.strokeStyle = this.parentGradient(ctx, pts[0], pts[pts.length - 1]);
      this.strokePolyline(ctx, pts);
    } else {
      const a = this.borderAnchor(
        pp,
        pc.x + this.NODE_W / 2,
        pc.y + this.NODE_H / 2,
      );
      const b = this.borderAnchor(
        pc,
        pp.x + this.NODE_W / 2,
        pp.y + this.NODE_H / 2,
      );
      const ctrl = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 80 };
      if (this.curveBlocked(this.quadSamples(a, ctrl, b), obs)) {
        const route = this.routeAround(obs, a, b);
        ctx.strokeStyle = this.parentGradient(
          ctx,
          route[0],
          route[route.length - 1],
        );
        this.strokePolyline(ctx, route);
      } else {
        ctx.strokeStyle = this.parentGradient(ctx, a, b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, b.x, b.y);
        ctx.stroke();
      }
    }
  }

  private static strokePolyline(
    ctx: CanvasRenderingContext2D,
    pts: RoutePoint[],
  ): void {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  private static polylineBlocked(pts: RoutePoint[], obs: Rect[]): boolean {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1];
      const q = pts[i];
      for (const o of obs) {
        if (p.y === q.y) {
          const lo = Math.min(p.x, q.x);
          const hi = Math.max(p.x, q.x);
          if (p.y > o.y && p.y < o.y + o.h && lo < o.x + o.w && hi > o.x)
            return true;
        } else {
          const lo = Math.min(p.y, q.y);
          const hi = Math.max(p.y, q.y);
          if (p.x > o.x && p.x < o.x + o.w && lo < o.y + o.h && hi > o.y)
            return true;
        }
      }
    }
    return false;
  }

  private static curveBlocked(samples: RoutePoint[], obs: Rect[]): boolean {
    for (const p of samples)
      for (const o of obs)
        if (p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h)
          return true;
    return false;
  }

  private static quadSamples(
    a: RoutePoint,
    c: RoutePoint,
    b: RoutePoint,
  ): RoutePoint[] {
    const pts: RoutePoint[] = [];
    for (let t = 0; t <= 1.0001; t += 1 / 24) {
      const u = 1 - t;
      pts.push({
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      });
    }
    return pts;
  }

  private static cubicSamples(
    c: [RoutePoint, RoutePoint, RoutePoint, RoutePoint],
  ): RoutePoint[] {
    const [p0, p1, p2, p3] = c;
    const pts: RoutePoint[] = [];
    for (let t = 0; t <= 1.0001; t += 1 / 24) {
      const u = 1 - t;
      pts.push({
        x:
          u * u * u * p0.x +
          3 * u * u * t * p1.x +
          3 * u * t * t * p2.x +
          t * t * t * p3.x,
        y:
          u * u * u * p0.y +
          3 * u * u * t * p1.y +
          3 * u * t * t * p2.y +
          t * t * t * p3.y,
      });
    }
    return pts;
  }

  private static polylineMidpoint(pts: RoutePoint[]): RoutePoint {
    const lens: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l =
        Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
      lens.push(l);
      total += l;
    }
    let rem = total / 2;
    for (let i = 0; i < lens.length; i++) {
      if (rem <= lens[i]) {
        const t = lens[i] === 0 ? 0 : rem / lens[i];
        return {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
        };
      }
      rem -= lens[i];
    }
    return pts[pts.length - 1];
  }

  // A* over the card-boundary grid
  // its outer frame is always free
  private static routeAround(
    obs: Rect[],
    from: RoutePoint,
    to: RoutePoint,
  ): RoutePoint[] {
    const xs = [
      ...new Set([...obs.flatMap((o) => [o.x, o.x + o.w]), from.x, to.x]),
    ].sort((a, b) => a - b);
    const ys = [
      ...new Set([...obs.flatMap((o) => [o.y, o.y + o.h]), from.y, to.y]),
    ].sort((a, b) => a - b);
    const ny = ys.length;

    const clear = (i1: number, j1: number, i2: number, j2: number) => {
      const x1 = xs[i1];
      const y1 = ys[j1];
      const x2 = xs[i2];
      const y2 = ys[j2];
      for (const o of obs) {
        if (y1 === y2) {
          const lo = Math.min(x1, x2);
          const hi = Math.max(x1, x2);
          if (y1 > o.y && y1 < o.y + o.h && lo < o.x + o.w && hi > o.x)
            return false;
        } else {
          const lo = Math.min(y1, y2);
          const hi = Math.max(y1, y2);
          if (x1 > o.x && x1 < o.x + o.w && lo < o.y + o.h && hi > o.y)
            return false;
        }
      }
      return true;
    };

    const key = (i: number, j: number) => i * ny + j;
    const si = xs.indexOf(from.x);
    const sj = ys.indexOf(from.y);
    const goal = key(xs.indexOf(to.x), ys.indexOf(to.y));
    const TURN = 60;
    const best = new Map<number, number>([[key(si, sj), 0]]);
    const prev = new Map<number, number>();
    const dirOf = new Map<number, number>();
    const closed = new Set<number>();

    const heap: [number, number][] = [];
    const push = (f: number, k: number) => {
      heap.push([f, k]);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = (): [number, number] => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };

    push(Math.abs(xs[si] - to.x) + Math.abs(ys[sj] - to.y), key(si, sj));

    const dirs: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 1],
      [0, -1, 1],
    ];
    while (heap.length) {
      const [, k] = pop();
      if (closed.has(k)) continue;
      closed.add(k);
      if (k === goal) break;
      const i = Math.floor(k / ny);
      const j = k % ny;
      const g = best.get(k)!;
      for (const [di, dj, dir] of dirs) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || ni >= xs.length || nj < 0 || nj >= ny) continue;
        if (!clear(i, j, ni, nj)) continue;
        const nk = key(ni, nj);
        if (closed.has(nk)) continue;
        const len = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
        const ng =
          g +
          len +
          (dirOf.get(k) !== undefined && dirOf.get(k) !== dir ? TURN : 0);
        if (ng < (best.get(nk) ?? Infinity)) {
          best.set(nk, ng);
          prev.set(nk, k);
          dirOf.set(nk, dir);
          push(ng + Math.abs(xs[ni] - to.x) + Math.abs(ys[nj] - to.y), nk);
        }
      }
    }

    if (!closed.has(goal)) throw new Error("unroutable edge");

    const raw: RoutePoint[] = [];
    for (let k: number | undefined = goal; k !== undefined; k = prev.get(k)) {
      raw.push({ x: xs[Math.floor(k / ny)], y: ys[k % ny] });
    }
    raw.reverse();

    const out: RoutePoint[] = [];
    for (const p of raw) {
      const n = out.length;
      if (
        n >= 2 &&
        ((out[n - 1].x === out[n - 2].x && p.x === out[n - 1].x) ||
          (out[n - 1].y === out[n - 2].y && p.y === out[n - 1].y))
      ) {
        out[n - 1] = p;
      } else {
        out.push(p);
      }
    }
    return out;
  }

  private static drawCard(
    ctx: CanvasRenderingContext2D,
    member: TreeMember,
    avatar: Image | null,
    p: Placement,
  ): void {
    const { x, y } = p;
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    const gradient = ctx.createLinearGradient(
      x,
      y,
      x + this.NODE_W,
      y + this.NODE_H,
    );
    if (member.isRoot) {
      gradient.addColorStop(0, "#414650");
      gradient.addColorStop(1, "#262A31");
    } else {
      gradient.addColorStop(0, "#22262D");
      gradient.addColorStop(1, "#171A20");
    }
    ctx.fillStyle = gradient;
    this.roundRect(ctx, x, y, this.NODE_W, this.NODE_H, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = member.isRoot ? "#FFFFFF" : "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = member.isRoot ? 3 : 2;
    ctx.stroke();

    const ax = x + 14;
    const ay = y + (this.NODE_H - this.AVATAR) / 2;
    const midX = ax + this.AVATAR / 2;
    const midY = ay + this.AVATAR / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(midX, midY, this.AVATAR / 2, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
      ctx.drawImage(avatar, ax, ay, this.AVATAR, this.AVATAR);
    } else {
      ctx.fillStyle = "#888888";
      ctx.fillRect(ax, ay, this.AVATAR, this.AVATAR);
    }
    ctx.restore();
    ctx.strokeStyle = member.isRoot ? "#FFFFFF" : "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(midX, midY, this.AVATAR / 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = "bold 22px 'URW Gothic', sans-serif";
    ctx.textBaseline = "middle";
    let name = member.name;
    const maxW = this.NODE_W - this.AVATAR - 40;
    while (ctx.measureText(name).width > maxW && name.length > 1) {
      name = name.slice(0, -1);
    }
    if (name !== member.name) name += "...";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(name, x + this.AVATAR + 28, y + this.NODE_H / 2);
  }

  private static roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
