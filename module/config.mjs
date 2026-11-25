/** Core constants shared by every part of the system. Keep this file free of Foundry globals. */

export const SYSTEM_ID = "spacer";

/** Characteristic keys in UPP order. PSI is separate (most characters have none). */
export const CHARACTERISTICS = ["str", "dex", "end", "int", "edu", "soc"];
export const PHYSICAL = ["str", "dex", "end"];

/** Task rolls: 2D + DMs >= 8 succeeds (book p.14). */
export const TASK_TARGET = 8;
/** Untrained skill DM (book p.28 and p.42). */
export const UNTRAINED_DM = -3;
/** Unarmoured difficulty to hit (book p.43). */
export const UNARMORED_DIFFICULTY = 8;

/** Characteristic DM by score (book p.16). */
export function characteristicDM(score) {
  const s = Number(score) || 0;
  if (s <= 0) return -3;
  if (s <= 2) return -2;
  if (s <= 5) return -1;
  if (s <= 8) return 0;
  if (s <= 11) return 1;
  if (s <= 14) return 2;
  return 3;
}

/** Traveller-style extended hex digit (0-9, A-Z without I and O). */
const HEX = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function toHex(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return HEX[v] ?? "?";
}
export function fromHex(ch) {
  const i = HEX.indexOf(String(ch).toUpperCase());
  return i < 0 ? 0 : i;
}

/**
 * Convert book dice notation to a Foundry roll formula.
 * "2D" -> "2d6", "1D+3" -> "1d6+3", "D3" / "1D3" -> "1d3", "2D3" -> "2d3", "D66" -> "1d6*10+1d6".
 */
export function bookDice(formula) {
  if (formula === null || formula === undefined) return "0";
  let f = String(formula).trim().replace(/\s+/g, "").replace(/[–—]/g, "-");
  if (!f || f.toLowerCase() === "x") return "0";
  f = f.replace(/(\d*)D66/gi, () => "(1d6*10+1d6)");
  f = f.replace(/(\d*)D(\d+)?/gi, (_m, n, faces) => `${n || 1}d${faces || 6}`);
  return f;
}

/** Equipment weight parser: "100g" -> 0.1, "2kg" -> 2, "0.5T" -> 500, "x" -> 0. Returns kilograms. */
export function parseWeightKg(text) {
  if (typeof text === "number") return text;
  const m = String(text ?? "").trim().match(/^([\d.,]+)\s*(g|kg|t)?$/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "kg").toLowerCase();
  return unit === "g" ? n / 1000 : unit === "t" ? n * 1000 : n;
}

/** Cost parser: "150cr" -> 150, "10Kcr" -> 10000, "30Mcr" -> 30000000, "x" -> 0. Returns credits. */
export function parseCredits(text) {
  if (typeof text === "number") return text;
  const m = String(text ?? "").trim().match(/^([\d.,]+)\s*(k|m)?cr/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  const mult = (m[2] ?? "").toLowerCase();
  return mult === "k" ? n * 1000 : mult === "m" ? n * 1_000_000 : n;
}

/** Folder of the game-icons.net icons (the required "game-icons-net" module). */
export const GAME_ICONS = "modules/game-icons-net/blackbackground";

/** Default icon per item type, for items created without a specific icon. */
export const ITEM_ICONS = {
  skill: `${GAME_ICONS}/skills.svg`,
  weapon: `${GAME_ICONS}/pistol-gun.svg`,
  armor: `${GAME_ICONS}/kevlar-vest.svg`,
  gear: `${GAME_ICONS}/knapsack.svg`,
  psionic: `${GAME_ICONS}/psychic-waves.svg`,
  drug: `${GAME_ICONS}/pill.svg`,
  shipWeapon: `${GAME_ICONS}/turret.svg`
};

export const SPACER = {
  characteristics: CHARACTERISTICS,
  physical: PHYSICAL,
  taskTarget: TASK_TARGET,
  untrainedDM: UNTRAINED_DM,
  unarmoredDifficulty: UNARMORED_DIFFICULTY,
  characteristicDM,
  toHex,
  fromHex,
  bookDice,
  parseWeightKg,
  parseCredits,
  /** Weapon range bands, shortest first (book p.43). */
  rangeBands: ["close", "short", "medium", "long", "veryLong", "distant"],
  /** Encumbrance multipliers of STR in kg (book p.41). */
  encumbrance: { minimal: 2, encumbered: 3, overEncumbered: 4 },
  psionicDisciplines: ["telepathy", "clairvoyance", "telekinesis", "awareness", "teleportation", "special"],
  vehicleCategories: ["landcraft", "aircraft", "gravcraft", "watercraft"],
  vehicleLocations: ["interior", "drive", "handling", "hull", "weapon"],
  shipSystems: ["jDrive", "mDrive", "power"],
  itemIcons: ITEM_ICONS
};
