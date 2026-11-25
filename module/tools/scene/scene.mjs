/**
 * Subsector scenes: turn a generated subsector (p.88-95) into a Foundry Scene with a hex grid
 * (1 hex = 1 parsec), a starfield background, one Map Note per world linked to its journal entry,
 * small marker notes (capital, bases, gas giant), and Drawings for the always visible parts
 * (world rings, labels, starport letters, courier routes, red dwarfs).
 * Foundry glue around rules/plan.mjs. Called by game.spacer.tools.createSubsectorScene, the
 * subsector chat card, the overview journal header, and the Toolkit.
 */
import { localizer } from "../../shared/foundry.mjs";
import { ensureFolder } from "../context.mjs";
import { normalizeWorld, planScene } from "./rules/plan.mjs";
import { FALLBACK_ICON } from "./rules/icons.mjs";
import { uploadBackground } from "./background.mjs";

const L = localizer("SPACER.Tools.Scene");

/** Name of the scene folder (AGENTS.md: "Spacer: <Kind>"). */
export const SCENE_FOLDER = "Spacer: Subsectors";

/** Colours of the drawings. */
const STYLE = {
  label: "#e6ecff", starport: "#cfe0ff", route: "#62b8ff", redDwarf: "#ff5a3c", ringFill: "#030614",
  capital: "#ffd54a", base: "#d8e6ff", gasGiant: "#f0c08a"
};

/** The structured subsector of an overview journal (flags.spacer.subsector), or null. */
export const subsectorOf = doc => doc?.flags?.spacer?.subsector ?? null;

/** Overview journals of generated subsectors, newest last. */
export const subsectorJournals = () => game.journal.filter(j => subsectorOf(j)).sort((a, b) => (a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0));

/**
 * Resolve the input of `createSubsectorScene`: an overview JournalEntry, its id or UUID, the
 * result of `generateSubsector` (`{ subsector, overview }`), or subsector data (the generator
 * result or the overview flag). Returns `{ subsector, overview }` (overview may be null).
 */
async function resolveInput(input) {
  if (typeof input === "string") input = game.journal.get(input) ?? await fromUuid(input);
  if (input?.overview?.documentName === "JournalEntry") return { subsector: input.subsector ?? subsectorOf(input.overview), overview: input.overview };
  if (input?.documentName === "JournalEntry") return { subsector: subsectorOf(input), overview: input };
  if (input?.worlds) {
    const overview = subsectorJournals().filter(j => subsectorOf(j).name === input.name).at(-1) ?? null;
    return { subsector: input, overview };
  }
  return { subsector: null, overview: null };
}

/**
 * The world journals of a subsector by world name: entries with flags.spacer.world.subsector
 * equal to the subsector name, preferring the overview's folder.
 */
function worldJournalsOf(s, overview) {
  const all = game.journal.filter(j => j.flags?.spacer?.world?.subsector === s.name);
  const folderId = overview?.folder?.id ?? null;
  const out = {};
  for (const j of all.sort((a, b) => Number((b.folder?.id ?? null) === folderId) - Number((a.folder?.id ?? null) === folderId))) {
    const w = j.flags.spacer.world;
    out[`${w.name}|${w.hex}`] ??= j;
  }
  return out;
}

/** Icon path, or the core fallback when game-icons-net is not active. */
const icon = path => (game.modules.get("game-icons-net")?.active ? path : FALLBACK_ICON);

/** Note and Drawing data of a plan. `entries` maps world names to JournalEntry ids. */
function sceneDocuments(plan, entries) {
  const BOTTOM = CONST.TEXT_ANCHOR_POINTS.BOTTOM;
  const SOLID = CONST.DRAWING_FILL_TYPES.SOLID;
  const NONE = CONST.DRAWING_FILL_TYPES.NONE;
  const font = CONFIG.defaultFontFamily || "Signika";
  const notes = [];
  const drawings = [];
  const text = (t, x, y, w, h, fontSize, color, sort, flags) => ({
    shape: { type: "r", width: w, height: h }, x: Math.round(x - w / 2), y: Math.round(y - h / 2), sort,
    text: t, fontSize, fontFamily: font, textColor: color, textAlpha: 1,
    fillType: NONE, strokeWidth: 0, strokeAlpha: 0, locked: true, flags: { spacer: flags }
  });
  const circle = (x, y, r, { stroke, width = 3, alpha = 0.85, fill, fillAlpha = 0.6, sort, flags }) => ({
    shape: { type: "e", width: 2 * r, height: 2 * r }, x: x - r, y: y - r, sort,
    strokeWidth: width, strokeColor: stroke, strokeAlpha: alpha,
    fillType: fill ? SOLID : NONE, fillColor: fill ?? "#000000", fillAlpha, locked: true, flags: { spacer: flags }
  });

  for (const r of plan.routes) {
    const [x1, y1, x2, y2] = r.points;
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    drawings.push({
      shape: { type: "p", width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), points: [x1 - x, y1 - y, x2 - x, y2 - y] },
      x, y, sort: 0, strokeWidth: 5, strokeColor: STYLE.route, strokeAlpha: 0.5, fillType: NONE, bezierFactor: 0, locked: true,
      flags: { spacer: { subsectorPart: "route", from: r.from, to: r.to } }
    });
  }
  for (const d of plan.redDwarfs) {
    drawings.push(circle(d.x, d.y, 9, { stroke: STYLE.redDwarf, width: 2, alpha: 0.9, fill: STYLE.redDwarf, fillAlpha: 0.75, sort: 1, flags: { subsectorPart: "redDwarf", hex: d.hex } }));
  }
  for (const w of plan.worlds) {
    const entryId = entries[w.name] ?? null;
    const part = kind => ({ subsectorPart: kind, world: w.name, hex: w.hex });
    drawings.push(circle(w.ring.x, w.ring.y, w.ring.radius, { stroke: w.ring.color, fill: STYLE.ringFill, fillAlpha: 0.55, sort: 1, flags: part("ring") }));
    const lines = w.label.split("\n").length;
    const lh = Math.round(w.fontSize * 1.3);
    drawings.push(text(w.label, w.center.x, w.y + w.iconSize / 2 + 6 + (lines * lh) / 2, 170, lines * lh + 4, w.fontSize, STYLE.label, 2, part("label")));
    drawings.push(text(w.starport.letter, w.starport.x, w.starport.y, w.starport.box, w.starport.box, w.starport.fontSize, STYLE.starport, 2, part("starport")));
    notes.push({
      entryId, x: w.x, y: w.y, iconSize: w.iconSize, texture: { src: icon(w.icon), tint: w.tint },
      text: w.label, fontSize: w.fontSize, fontFamily: font, textAnchor: BOTTOM, textColor: STYLE.label, global: true,
      flags: { spacer: { ...part("world"), type: w.type } }
    });
    for (const m of w.markers) {
      const tint = m.kind === "capital" ? STYLE.capital : m.kind === "gasGiant" ? STYLE.gasGiant : STYLE.base;
      notes.push({
        entryId, x: m.x, y: m.y, iconSize: m.iconSize, texture: { src: icon(m.icon), tint },
        text: `${w.name}: ${m.label}`, fontSize: 14, fontFamily: font, textAnchor: BOTTOM, textColor: STYLE.label, global: true,
        flags: { spacer: { ...part("marker"), marker: m.kind, code: m.code ?? null } }
      });
    }
  }
  return { notes, drawings };
}

/**
 * Create (or replace) the scene of a subsector. `input`: an overview JournalEntry, its id or UUID,
 * the result of `generateSubsector`, or subsector data. Reads the world journals of the
 * subsector (flags.spacer.world) for bases, trade codes, and gas giants. Uploads the background to
 * `worlds/<world>/spacer/`, deletes older scenes of the same subsector (flags.spacer.subsector.name),
 * creates the scene in the folder "Spacer: Subsectors" with flags.spacer.subsector, and views it.
 * GM only. Returns the Scene.
 */
export async function createSubsectorScene(input, { view = true, notify = true } = {}) {
  if (!game.user.isGM) throw new Error(L("NotGM"));
  const { subsector: s, overview } = await resolveInput(input);
  if (!s?.worlds) throw new Error(L("NoSubsector"));
  const journals = worldJournalsOf(s, overview);
  const worlds = s.worlds.map(w => {
    const j = journals[`${w.name}|${w.hex}`];
    return normalizeWorld(w, j?.flags.spacer.world ?? (w.details ? w : null));
  });
  const plan = planScene({ ...s, worlds });
  const entries = Object.fromEntries(worlds.map(w => [w.name, journals[`${w.name}|${w.hex}`]?.id]).filter(([, id]) => id));

  let background = null;
  try { background = await uploadBackground(plan, { cols: s.cols ?? 8, rows: s.rows ?? 10 }); }
  catch (err) { console.warn("Spacer | subsector background", err); ui.notifications.warn(L("NoUpload")); }

  const old = game.scenes.filter(sc => subsectorOf(sc)?.name === s.name);
  if (old.length) await Scene.deleteDocuments(old.map(sc => sc.id));

  const folder = await ensureFolder(SCENE_FOLDER, "Scene");
  const { notes, drawings } = sceneDocuments(plan, entries);
  const summary = overview ? subsectorOf(overview) : { ...s, worlds: s.worlds.map(w => ({ name: w.name, hex: w.hex, uwp: w.uwp, line: w.line, zone: w.zone, capital: !!w.capital })) };
  const scene = await Scene.create({
    name: L("Name", { name: s.name }),
    folder: folder.id,
    width: plan.width, height: plan.height, padding: 0,
    background: background ? { src: background } : undefined,
    backgroundColor: "#05060d",
    grid: { ...plan.grid, color: "#8fb4ff", alpha: 0.12, thickness: 1, style: "solidLines" },
    tokenVision: false,
    journal: overview?.id ?? null,
    initial: { x: Math.round(plan.width / 2), y: Math.round(plan.height / 2), scale: 0.4 },
    notes, drawings,
    flags: { spacer: { subsector: summary, overview: overview?.uuid ?? null } }
  });
  if (view) await scene.view();
  if (notify) ui.notifications.info(L("Created", { name: scene.name, worlds: plan.worlds.length, routes: plan.routes.length }));
  return scene;
}

/**
 * Show the notes layer on a subsector scene, so the world icons are visible: Foundry hides map
 * notes unless the notes layer is active or the "display notes" toggle is on. Called from the
 * canvasReady hook (register.mjs).
 */
export function showSubsectorNotes() {
  if (!subsectorOf(canvas.scene) || !canvas.notes) return;
  if (game.settings.get("core", "notesDisplayToggle")) return;
  canvas.notes.activate();
}
