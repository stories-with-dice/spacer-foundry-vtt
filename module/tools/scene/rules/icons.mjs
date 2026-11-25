/**
 * Map icons of a subsector scene: the world type icon and the small markers. Pure. All icons come
 * from the required game-icons-net module (CC BY 3.0). We use its `whitetransparent` set: a white
 * picture on a transparent background shows well on the dark starfield, and the note tint
 * (`texture.tint`) colours white directly. Called by module/tools/scene/scene.mjs.
 */

/** Folder of the icons (Foundry data path). */
export const ICON_ROOT = "modules/game-icons-net/whitetransparent";

/** Foundry core icon used when game-icons-net is not active. */
export const FALLBACK_ICON = "icons/svg/circle.svg";

/**
 * World type icons, checked against the pictures (not only the file names). `file` is the
 * game-icons.net name.
 */
export const WORLD_ICONS = Object.freeze({
  asteroid: { file: "asteroid", label: "Asteroid belt (size 0)" },
  industrial: { file: "factory", label: "Industrial (In)" },
  highPop: { file: "modern-city", label: "High population (9+)" },
  insidious: { file: "poison-gas", label: "Corrosive or insidious atmosphere (B-C)" },
  exotic: { file: "gas-mask", label: "Exotic or unusual atmosphere (A, D+)" },
  vacuum: { file: "moon", label: "Vacuum or trace atmosphere (0-1)" },
  water: { file: "waves", label: "Water world (hydrographics A)" },
  desert: { file: "desert", label: "Desert (hydrographics 0)" },
  ice: { file: "frozen-orb", label: "Frozen world" },
  garden: { file: "earth-america", label: "Garden (atmosphere 5-8, hydrographics 4-8)" },
  world: { file: "world", label: "Other world" }
});

/** Marker icons next to a world. Base codes are the starport table's (p.93): M, N, S, P. */
export const MARKER_ICONS = Object.freeze({
  capital: { file: "queen-crown", label: "Subsector capital" },
  gasGiant: { file: "jupiter", label: "Gas giant in the system" },
  M: { file: "shield", label: "Military base" },
  N: { file: "anchor", label: "Naval base" },
  S: { file: "telescope", label: "Scout base" },
  P: { file: "pirate-flag", label: "Pirate base" }
});

/** Note tints by travel zone (p.95): "" green (no tint), "A" amber, "R" red. */
export const ZONE_TINT = Object.freeze({ "": "#ffffff", A: "#ffb020", R: "#ff4040" });

/** Ring colours by travel zone, for the always visible world ring drawings. */
export const ZONE_RING = Object.freeze({ "": "#9fd8ff", A: "#ffb020", R: "#ff4040" });

/** Full path of a game-icons.net icon. */
export const iconPath = file => `${ICON_ROOT}/${file}.svg`;

/**
 * The world type of a world: a key of WORLD_ICONS. Reads `size`, `atmosphere`, `hydrographics`,
 * `population`, `tradeCodes` and `temperature.type` (when known). The first match wins:
 * asteroid (size 0), industrial (In), high population (9+), corrosive or insidious atmosphere
 * (B-C), other exotic atmosphere (A, D+), vacuum (0-1), water world (hydrographics A),
 * desert (hydrographics 0), frozen (temperature Frozen), garden (atmosphere 5-8 with
 * hydrographics 4-8), else a plain world.
 */
export function worldType(w) {
  const a = w.atmosphere ?? 0;
  const h = w.hydrographics ?? 0;
  const codes = w.tradeCodes ?? [];
  if (w.size === 0) return "asteroid";
  if (codes.includes("In")) return "industrial";
  if ((w.population ?? 0) >= 9) return "highPop";
  if (a === 11 || a === 12) return "insidious";
  if (a >= 10) return "exotic";
  if (a <= 1) return "vacuum";
  if (h >= 10) return "water";
  if (h === 0) return "desert";
  if (w.temperature?.type === "Frozen") return "ice";
  if (a >= 5 && a <= 8 && h >= 4 && h <= 8) return "garden";
  return "world";
}

/** Icon path of a world (see `worldType`). */
export const worldIcon = w => iconPath(WORLD_ICONS[worldType(w)].file);

/**
 * The marker list of a world: `[{ kind, file, label }]` for the capital, the gas giant, and each
 * base. Reads `capital`, `gasGiants` (or `system.gasGiants`), and `bases`.
 */
export function worldMarkers(w) {
  const out = [];
  if (w.capital) out.push({ kind: "capital", ...MARKER_ICONS.capital });
  if ((w.gasGiants ?? w.system?.gasGiants ?? 0) > 0) out.push({ kind: "gasGiant", ...MARKER_ICONS.gasGiant });
  for (const b of w.bases ?? []) if (MARKER_ICONS[b]) out.push({ kind: "base", code: b, ...MARKER_ICONS[b] });
  return out;
}
