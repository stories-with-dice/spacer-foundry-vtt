/**
 * Drive letters, performance by hull size, damage step-down, and power-plant limits
 * (book p.74-76 and p.86). Pure functions, no Foundry globals.
 */

/** Drive letters in order. I and O are not used (book p.75). */
export const DRIVE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

/** Hull-size columns of the "Engineer Rating By Hull Size" table, in tonnes (book p.75). */
export const HULL_COLUMNS = [100, 200, 400, 600, 800, 1000, 2000, 3000, 4000, 5000];

const _ = null;
/**
 * Performance (jump number, G of thrust, or power output) by letter and hull column.
 * `null` means the letter cannot be installed in that hull ("-" in the book).
 */
export const RATING_TABLE = {
  A: [2, 1, _, _, _, _, _, _, _, _],
  B: [4, 2, _, _, _, _, _, _, _, _],
  C: [6, 3, 1, _, _, _, _, _, _, _],
  D: [_, 4, 2, 1, _, _, _, _, _, _],
  E: [_, 5, 2, 1, _, _, _, _, _, _],
  F: [_, 6, 3, 2, 1, _, _, _, _, _],
  G: [_, _, 3, 2, 1, _, _, _, _, _],
  H: [_, _, 4, 2, 2, 1, _, _, _, _],
  J: [_, _, 4, 3, 2, 1, _, _, _, _],
  K: [_, _, 5, 3, 2, 2, 1, _, _, _],
  L: [_, _, 5, 3, 2, 2, 1, _, _, _],
  M: [_, _, 6, 4, 3, 2, 1, _, _, _],
  N: [_, _, 6, 4, 3, 2, 1, _, _, _],
  P: [_, _, _, 4, 3, 2, 1, _, _, _],
  Q: [_, _, _, 5, 3, 3, 1, 1, _, _],
  R: [_, _, _, 5, 4, 3, 1, 1, _, _],
  S: [_, _, _, 5, 4, 3, 1, 1, _, _],
  T: [_, _, _, 6, 4, 3, 1, 1, _, _],
  U: [_, _, _, 6, 4, 3, 1, 1, _, _],
  V: [_, _, _, 6, 5, 4, 1, 1, 1, _],
  W: [_, _, _, _, 5, 4, 2, 1, 1, _],
  X: [_, _, _, _, 5, 4, 3, 2, 1, _],
  Y: [_, _, _, _, 5, 5, 4, 3, 2, 1],
  Z: [_, _, _, _, 6, 6, 5, 4, 3, 2]
};

/** Index of a drive letter (A = 0), or -1. */
export function letterIndex(letter) {
  return DRIVE_LETTERS.indexOf(String(letter ?? "").trim().toUpperCase());
}

/**
 * Hull column index for a tonnage: the smallest column that holds the hull.
 * Armour beyond 1 layer per 100T makes the ship perform as the next size category,
 * one category per extra layer (book p.77).
 */
export function hullColumn(tonnage, armorLayers = 0) {
  const t = Math.max(1, Number(tonnage) || 0);
  let i = HULL_COLUMNS.findIndex(c => t <= c);
  if (i < 0) i = HULL_COLUMNS.length - 1;
  const extra = Math.max(0, (Number(armorLayers) || 0) - Math.max(1, Math.floor(t / 100)));
  return Math.min(HULL_COLUMNS.length - 1, i + extra);
}

/** Performance of a letter in a hull, or null when the letter cannot be installed there. */
export function drivePerformance(letter, tonnage, armorLayers = 0) {
  const row = RATING_TABLE[String(letter ?? "").toUpperCase()];
  if (!row) return null;
  return row[hullColumn(tonnage, armorLayers)] ?? null;
}

/** The lowest letter that works in this hull (A for 100T, C for 400T, ...). */
export function lowestLetter(tonnage, armorLayers = 0) {
  const col = hullColumn(tonnage, armorLayers);
  return DRIVE_LETTERS.find(l => RATING_TABLE[l][col] !== null) ?? "A";
}

/** Letters that can be installed in this hull, with their performance. */
export function availableLetters(tonnage, armorLayers = 0) {
  const col = hullColumn(tonnage, armorLayers);
  return DRIVE_LETTERS.filter(l => RATING_TABLE[l][col] !== null).map(l => ({ letter: l, performance: RATING_TABLE[l][col] }));
}

/**
 * State of one engineering system after damage (book p.75 and p.86).
 * Each damage point steps the letter down once. The lowest letter that works in this hull is
 * "critical". One more step destroys it. A system built at the lowest letter is destroyed by
 * its first hit and never becomes critical.
 * @param {{rating: string, value?: number, damage?: number, destroyed?: boolean}} sys
 * @param {number} tonnage
 * @param {number} [armorLayers]
 * @returns {{built: string, letter: string|null, performance: number, builtPerformance: number, steps: number, critical: boolean, destroyed: boolean}}
 */
export function systemState(sys, tonnage, armorLayers = 0) {
  const built = String(sys?.rating ?? "A").toUpperCase();
  const damage = Math.max(0, Number(sys?.damage) || 0);
  const col = hullColumn(tonnage, armorLayers);
  const bi = letterIndex(built);
  const tablePerf = bi >= 0 ? RATING_TABLE[built][col] : null;
  const builtPerformance = tablePerf ?? Math.max(0, Number(sys?.value) || 0);
  const lowest = letterIndex(lowestLetter(tonnage, armorLayers));
  let idx = bi >= 0 ? bi - damage : -1;
  let destroyed = !!sys?.destroyed;
  let performance;
  if (tablePerf === null || bi < 0) {
    // Letter not in the table for this hull: fall back to the stored value, -1 per step.
    performance = Math.max(0, builtPerformance - damage);
    if (damage > 0 && performance <= 0) destroyed = true;
  } else {
    if (idx < lowest) destroyed = true;
    performance = destroyed ? 0 : RATING_TABLE[DRIVE_LETTERS[idx]][col] ?? 0;
  }
  if (destroyed) { performance = 0; idx = -1; }
  const critical = !destroyed && damage > 0 && (bi >= 0 && tablePerf !== null ? idx === lowest : performance === 1);
  return {
    built, letter: destroyed ? null : (idx >= 0 ? DRIVE_LETTERS[idx] : built),
    performance, builtPerformance, steps: damage, critical, destroyed
  };
}

/**
 * Effective performance of the three engineering systems. A power plant with a lower letter than
 * a drive limits the drive to the plant's letter (book p.86). A destroyed plant stops both drives.
 * @param {{jDrive, mDrive, power}} ship  system fields as in ShipData
 * @param {number} tonnage
 * @param {number} [armorLayers]
 */
export function engineering(ship, tonnage, armorLayers = 0) {
  const j = systemState(ship.jDrive, tonnage, armorLayers);
  const m = systemState(ship.mDrive, tonnage, armorLayers);
  const p = systemState(ship.power, tonnage, armorLayers);
  const limit = (d) => {
    if (d.destroyed || p.destroyed) return { ...d, effectiveLetter: null, effective: 0, limited: !d.destroyed };
    const di = letterIndex(d.letter), pi = letterIndex(p.letter);
    if (di < 0 || pi < 0 || di <= pi) return { ...d, effectiveLetter: d.letter, effective: d.performance, limited: false };
    const perf = drivePerformance(p.letter, tonnage, armorLayers) ?? p.performance;
    return { ...d, effectiveLetter: p.letter, effective: Math.min(d.performance, perf), limited: true };
  };
  return { jDrive: limit(j), mDrive: limit(m), power: { ...p, effectiveLetter: p.letter, effective: p.performance, limited: false } };
}

/** Hull points: 1 plus 1 per 100T (book p.86). */
export function hullPoints(tonnage) {
  return 1 + Math.floor((Number(tonnage) || 0) / 100);
}

/** Internal hits: 1 per 100T, minimum 1 (book p.87). */
export function internalPoints(tonnage) {
  return Math.max(1, Math.floor((Number(tonnage) || 0) / 100));
}

/** Hardpoints: 1 per 100T; up to twice that with extra hardpoints (book p.76). */
export function baseHardpoints(tonnage) {
  return Math.floor((Number(tonnage) || 0) / 100);
}

/** Fuel tank hits: each hit is a 10T leak (book p.86). */
export function fuelHitsMax(fuelMax) {
  return Math.ceil((Number(fuelMax) || 0) / 10);
}

/** Fuel for a jump of `parsecs`: 10T per jump number (book p.76, "POW rating x 10"). */
export function jumpFuel(parsecs) {
  return 10 * Math.max(0, Number(parsecs) || 0);
}

/** M-Drive fuel for one week: equal to the thrust rating in tonnes (book p.76). */
export function mDriveFuelPerWeek(thrust) {
  return Math.max(0, Number(thrust) || 0);
}

/** Operational systems: 1T per 100T per month (book p.76). */
export function operationsFuelPerMonth(tonnage) {
  return Math.max(1, Math.ceil((Number(tonnage) || 0) / 100));
}

/** Recommended fuel space: one maximum jump, one month of M-Drive, one month of operations (book p.76). */
export function recommendedFuel(tonnage, jump, thrust) {
  return jumpFuel(jump) + 4 * mDriveFuelPerWeek(thrust) + operationsFuelPerMonth(tonnage);
}

/** Minimum fuel space: 10% of the hull (book p.76). */
export function minimumFuel(tonnage) {
  return Math.ceil((Number(tonnage) || 0) * 0.1);
}
