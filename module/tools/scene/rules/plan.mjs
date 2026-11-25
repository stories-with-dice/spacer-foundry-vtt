/**
 * The plan of a subsector scene: where every world, marker, route and red dwarf goes, in scene
 * pixels. Pure. module/tools/scene/scene.mjs turns the plan into Note and Drawing documents.
 */
import { GRID, LAYOUT, hexCenter, hexSlots, parseHex, parseUwp, sceneSize } from "./layout.mjs";
import { ZONE_RING, ZONE_TINT, WORLD_ICONS, iconPath, worldMarkers, worldType } from "./icons.mjs";
import { selectRoutes, trimSegment } from "./routes.mjs";

/**
 * Normalize one world of a subsector: the overview summary (`{ name, hex, uwp, zone, capital }`)
 * merged with the full world data (flags.spacer.world) when known. Missing UWP codes are parsed
 * from `uwp`. Returns the world with `col`, `row`, and the UWP codes as numbers.
 */
export function normalizeWorld(summary, full = null) {
  const w = { ...(full ?? {}), ...summary };
  const codes = parseUwp(w.uwp) ?? {};
  for (const [k, v] of Object.entries(codes)) if (typeof w[k] !== "number" && typeof w[k] !== "string") w[k] = v;
  const { col, row } = parseHex(w.hex);
  return { ...w, col: w.col ?? col, row: w.row ?? row, zone: w.zone ?? "", bases: w.bases ?? [], tradeCodes: w.tradeCodes ?? [] };
}

/** The note label of a world: name, UWP, and trade codes on three lines. */
export function worldLabel(w) {
  return [w.name, w.uwp, (w.tradeCodes ?? []).join(" ")].filter(Boolean).join("\n");
}

/**
 * Plan a subsector scene. `s` is a subsector (`{ name, cols, rows, hexes, worlds }`, the generator
 * result or the overview summary); its worlds must be normalized (see `normalizeWorld`). Returns
 * `{ name, width, height, grid, worlds, routes, redDwarfs }`:
 * - worlds: `{ name, hex, x, y, type, icon, tint, ring, label, starport, markers }`, pixel points;
 * - routes: `{ from, to, points: [x1, y1, x2, y2] }`;
 * - redDwarfs: `{ hex, x, y }` for the uninhabited star systems (p.88).
 */
export function planScene(s, { size } = {}) {
  const o = { cols: s.cols ?? 8, rows: s.rows ?? 10, ...(size ? { size } : {}) };
  const { width, height } = sceneSize(o);
  const slots = hexSlots(o);
  const at = (c, slot) => ({ x: c.x + slot.dx, y: c.y + slot.dy });
  const worlds = s.worlds.map(w => {
    const c = hexCenter(w.col, w.row, o);
    const type = worldType(w);
    const markers = worldMarkers(w);
    const placed = [];
    let base = 0;
    for (const m of markers) {
      const slot = m.kind === "capital" ? slots.capital : m.kind === "gasGiant" ? slots.gasGiant : slots.bases[base++];
      if (!slot) continue;
      placed.push({ ...m, icon: iconPath(m.file), ...at(c, slot), iconSize: slot.iconSize });
    }
    return {
      name: w.name, hex: w.hex, center: c, ...at(c, slots.icon), iconSize: slots.icon.iconSize, fontSize: slots.icon.fontSize,
      type, typeLabel: WORLD_ICONS[type].label, icon: iconPath(WORLD_ICONS[type].file),
      tint: ZONE_TINT[w.zone] ?? ZONE_TINT[""], zone: w.zone,
      ring: { ...at(c, slots.ring), radius: slots.ring.radius, color: ZONE_RING[w.zone] ?? ZONE_RING[""] },
      label: worldLabel(w),
      starport: { letter: w.starport ?? String(w.uwp ?? "?")[0], ...at(c, slots.starport), fontSize: slots.starport.fontSize, box: slots.starport.box },
      markers: placed
    };
  });
  const byName = Object.fromEntries(worlds.map(w => [w.name, w]));
  const routes = selectRoutes(s.worlds).map(r => {
    const a = byName[r.from].ring, b = byName[r.to].ring;
    return { ...r, points: trimSegment(a, b, a.radius + 4) };
  }).filter(r => r.points);
  const redDwarfs = (s.hexes ?? []).filter(h => h.kind === "uninhabited").map(h => ({ hex: h.hex, ...at(hexCenter(h.col, h.row, o), slots.ring) }));
  return { name: s.name, width, height, grid: { ...GRID, size: o.size ?? LAYOUT.size }, worlds, routes, redDwarfs };
}

/** Every hex label of a subsector, "0101" to "0810", with its center. For the background. */
export function hexNumbers({ cols = 8, rows = 10, size } = {}) {
  const o = { cols, rows, ...(size ? { size } : {}) };
  const slot = hexSlots(o).number;
  const out = [];
  for (let col = 1; col <= cols; col++) {
    for (let row = 1; row <= rows; row++) {
      const c = hexCenter(col, row, o);
      out.push({ col, row, label: `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`, x: c.x + slot.dx, y: c.y + slot.dy, fontSize: slot.fontSize });
    }
  }
  return out;
}
