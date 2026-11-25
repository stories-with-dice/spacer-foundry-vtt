/**
 * Geometry of a subsector scene: the hex grid, the hex centers, and where each marker of a world
 * goes inside its hex. Pure (no Foundry globals). Used by module/tools/scene/scene.mjs and
 * module/tools/scene/background.mjs.
 *
 * The book's subsector map (p.88, blank map p.127) is 8 columns x 10 rows of flat-topped hexes,
 * numbered "CCRR" from 0101 (top left) to 0810. Even columns sit half a hex lower than odd
 * columns (rules/subsector.mjs `hexDistance` uses the same layout).
 *
 * Foundry draws a column-based hex grid from the canvas origin. In `HEXEVENQ` (type 5) the
 * even grid columns (0, 2, ...) sit half a hex lower. We keep one margin column on the left, so
 * book column 1 is grid column 1 (high) and book column 2 is grid column 2 (low), as in the book.
 * The scene has no padding, so the scene rectangle starts at the canvas origin.
 */

/** Foundry `CONST.GRID_TYPES.HEXEVENQ`: column-based hexes, even columns offset down. */
export const GRID_TYPE_HEXEVENQ = 5;

/** Default layout: grid size (hex height in pixels), margins in hexes. */
export const LAYOUT = Object.freeze({ size: 200, marginCols: 1, marginRows: 1, cols: 8, rows: 10 });

/** Grid configuration of the scene: 1 hex = 1 parsec (p.88). */
export const GRID = Object.freeze({ type: GRID_TYPE_HEXEVENQ, distance: 1, units: "pc" });

/** Hex width (corner to corner) of a flat-topped hex of grid size `size` (its height). */
export const hexWidth = size => (2 * size) / Math.sqrt(3);

/** Merge layout options with the defaults. */
const opts = (o = {}) => ({ ...LAYOUT, ...o });

/**
 * Scene width and height in pixels for a subsector of `cols` x `rows` hexes plus the margins.
 * Returns `{ width, height }`. Called by `createSubsectorScene` and the background painter.
 */
export function sceneSize(o = {}) {
  const { size, cols, rows, marginCols, marginRows } = opts(o);
  const gridCols = cols + 2 * marginCols;
  return {
    width: Math.ceil(hexWidth(size) * (0.75 * (gridCols - 1) + 1)),
    height: Math.ceil(size * (rows + 2 * marginRows))
  };
}

/**
 * Pixel center of the hex at book column `col` and row `row` (1-based): the same point Foundry's
 * `grid.getCenterPoint({ i, j })` gives for `i = row - 1 + marginRows`, `j = col - 1 + marginCols`.
 * Returns `{ x, y }`, rounded to whole pixels.
 */
export function hexCenter(col, row, o = {}) {
  const { size, marginCols, marginRows } = opts(o);
  const j = col - 1 + marginCols;
  const i = row - 1 + marginRows;
  // HEXEVENQ: grid columns with an even index are shifted down half a hex.
  const shift = j % 2 === 0 ? 0.5 : 0;
  return { x: Math.round(hexWidth(size) * (0.75 * j + 0.5)), y: Math.round((i + shift) * size) };
}

/** Grid offset `{ i, j }` of a book hex (for Foundry's grid API). */
export function hexOffset(col, row, o = {}) {
  const { marginCols, marginRows } = opts(o);
  return { i: row - 1 + marginRows, j: col - 1 + marginCols };
}

/** The six corners `[[x, y], ...]` of the hex at book `col`, `row`, clockwise from the right corner. */
export function hexCorners(col, row, o = {}) {
  const { size } = opts(o);
  const { x, y } = hexCenter(col, row, o);
  const r = hexWidth(size) / 2;
  const h = size / 2;
  return [[x + r, y], [x + r / 2, y + h], [x - r / 2, y + h], [x - r, y], [x - r / 2, y - h], [x + r / 2, y - h]];
}

/** Parse "CCRR" into `{ col, row }`. */
export function parseHex(hex) {
  const s = String(hex ?? "");
  return { col: Number(s.slice(0, 2)), row: Number(s.slice(2, 4)) };
}

/**
 * Where the parts of a world go inside its hex, as offsets from the hex center scaled by the grid
 * size (tuned for 200 px). Keys: `number` (hex number, baked into the background), `icon` (the
 * world note; its label goes below), `capital` (crown above the icon), `starport` (letter, left),
 * `gasGiant` (left, below the letter), `bases` (right column, top to bottom). Sizes in pixels.
 */
export function hexSlots(o = {}) {
  const { size } = opts(o);
  const k = size / 200;
  const p = (x, y) => ({ dx: Math.round(x * k), dy: Math.round(y * k) });
  return {
    number: { ...p(0, -84), fontSize: Math.round(15 * k) },
    icon: { ...p(0, -16), iconSize: Math.max(32, Math.round(56 * k)), fontSize: Math.max(8, Math.round(15 * k)) },
    ring: { ...p(0, -16), radius: Math.round(34 * k) },
    capital: { ...p(0, -64), iconSize: 32 },
    starport: { ...p(-62, -50), fontSize: Math.max(8, Math.round(24 * k)), box: Math.round(34 * k) },
    gasGiant: { ...p(-62, -14), iconSize: 32 },
    bases: [p(62, -50), p(62, -16), p(62, 18)].map(b => ({ ...b, iconSize: 32 }))
  };
}

/**
 * Parse a UWP "BA6A743-9" into numbers: `{ starport, size, atmosphere, hydrographics, population,
 * government, law, tl }`. Returns null for a bad string. Used when only the overview summary
 * (flags.spacer.subsector) is known.
 */
export function parseUwp(uwp) {
  const m = /^([A-EX])([0-9A-Z])([0-9A-Z])([0-9A-Z])([0-9A-Z])([0-9A-Z])([0-9A-Z])-([0-9A-Z])$/i.exec(String(uwp ?? "").trim());
  if (!m) return null;
  const n = c => parseInt(c, 36);
  return {
    starport: m[1].toUpperCase(), size: n(m[2]), atmosphere: n(m[3]), hydrographics: n(m[4]),
    population: n(m[5]), government: n(m[6]), law: n(m[7]), tl: n(m[8])
  };
}

/** A file-name slug: "Tharsis Subsector" -> "tharsis-subsector". */
export function slugify(name) {
  return String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "subsector";
}

/** A 32-bit seed from a string (FNV-1a), for the seeded starfield. */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
