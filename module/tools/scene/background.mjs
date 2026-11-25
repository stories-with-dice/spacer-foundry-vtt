/**
 * The background picture of a subsector scene: a seeded starfield with the subsector's hex
 * outlines and hex numbers (0101-0810). Painted on a canvas element in the browser and uploaded
 * to the world folder. Called by module/tools/scene/scene.mjs.
 *
 * The picture depends only on the subsector name and size, so regenerating a subsector with the
 * same name writes the same file again (no stale cached texture, no pile of old files).
 */
import { hexCorners, seedOf, slugify } from "./rules/layout.mjs";
import { hexNumbers } from "./rules/plan.mjs";
import { starfield } from "./rules/starfield.mjs";

/** Font of the baked text (Foundry's interface font). */
const FONT = "Signika, sans-serif";

/** Folder (inside the "data" source) of the uploaded backgrounds of this world. */
export const backgroundFolder = () => `worlds/${game.world.id}/spacer`;

/** The FilePicker class of this Foundry (v13 and v14: foundry.applications.apps.FilePicker). */
const picker = () => foundry.applications.apps.FilePicker.implementation;

/**
 * Paint the background on a canvas element: dark gradient, nebulae, stars, the subsector hexes and
 * their numbers, and the subsector name in the top margin. Returns the canvas.
 */
export function paintBackground({ name, width, height, cols = 8, rows = 10, size }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width * 0.3, height);
  bg.addColorStop(0, "#070a17");
  bg.addColorStop(0.55, "#0b1024");
  bg.addColorStop(1, "#05060d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const sky = starfield(seedOf(`${name}|${width}x${height}`), width, height);
  for (const n of sky.nebulae) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, hexAlpha(n.color, n.alpha));
    g.addColorStop(1, hexAlpha(n.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(n.x - n.r, n.y - n.r, 2 * n.r, 2 * n.r);
  }
  for (const s of sky.stars) {
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    if (s.r > 1.5) {
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
      glow.addColorStop(0, hexAlpha(s.color, 0.35));
      glow.addColorStop(1, hexAlpha(s.color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(s.x - s.r * 5, s.y - s.r * 5, s.r * 10, s.r * 10);
    }
  }
  ctx.globalAlpha = 1;

  // Subsector hexes: a faint fill and outline, so the 8 x 10 area stands out from the margins.
  const o = { cols, rows, ...(size ? { size } : {}) };
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(140, 180, 255, 0.30)";
  ctx.fillStyle = "rgba(90, 130, 220, 0.045)";
  for (let col = 1; col <= cols; col++) {
    for (let row = 1; row <= rows; row++) {
      const pts = hexCorners(col, row, o);
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(190, 210, 255, 0.55)";
  for (const n of hexNumbers(o)) {
    ctx.font = `${n.fontSize}px ${FONT}`;
    ctx.fillText(n.label, n.x, n.y);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(220, 230, 255, 0.85)";
  ctx.font = `600 ${Math.round((size ?? 200) * 0.2)}px ${FONT}`;
  ctx.fillText(name, Math.round((size ?? 200) * 0.25), Math.round((size ?? 200) * 0.28));
  return canvas;
}

/** "#rrggbb" + alpha -> "rgba(r, g, b, a)". */
function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Canvas -> Blob, WebP when the browser can encode it, else PNG. */
async function toBlob(canvas) {
  const as = type => new Promise(resolve => canvas.toBlob(resolve, type, 0.9));
  const webp = await as("image/webp");
  if (webp?.type === "image/webp") return webp;
  return as("image/png");
}

/** Create `worlds/<world>/spacer` when it does not exist. */
async function ensureFolder(path) {
  try { await picker().browse("data", path); }
  catch { await picker().createDirectory("data", path); }
}

/**
 * Paint and upload the background of a subsector scene. `plan` comes from `planScene`. Writes
 * `worlds/<world>/spacer/subsector-<slug>.webp` (or .png) in the "data" source and returns its
 * path. Needs a user who may upload files (the GM).
 */
export async function uploadBackground(plan, { cols = 8, rows = 10 } = {}) {
  if (document.fonts?.load) await document.fonts.load(`16px ${FONT}`).catch(() => null);
  const canvas = paintBackground({ name: plan.name, width: plan.width, height: plan.height, cols, rows, size: plan.grid.size });
  const blob = await toBlob(canvas);
  const ext = blob.type === "image/webp" ? "webp" : "png";
  const folder = backgroundFolder();
  await ensureFolder(folder);
  const file = new File([blob], `subsector-${slugify(plan.name)}.${ext}`, { type: blob.type });
  const res = await picker().upload("data", folder, file, {}, { notify: false });
  if (!res?.path) throw new Error(`Upload of ${file.name} failed`);
  return res.path;
}
