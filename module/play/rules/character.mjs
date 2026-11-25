/**
 * Pure character rules: encumbrance, healing, PSI, drugs, falling, training.
 * No Foundry globals: tested with node:test.
 */

/**
 * Encumbrance level (p.41): carry up to 2x STR kg freely, 3x encumbered, 4x over-encumbered.
 * Worn armour counts at its worn weight (the caller passes the total in kg).
 * @returns {{level: string, minimal: number, encumbered: number, overEncumbered: number, moveMult: number, enduranceMult: number, canSprint: boolean, canMelee: boolean}}
 */
export function encumbrance(carriedKg, str) {
  const s = Math.max(0, Number(str) || 0);
  const kg = Math.max(0, Number(carriedKg) || 0);
  const level = kg <= s * 2 ? "minimal" : kg <= s * 3 ? "encumbered" : kg <= s * 4 ? "overEncumbered" : "overloaded";
  const moveMult = { minimal: 1, encumbered: 0.5, overEncumbered: 0.25, overloaded: 0 }[level];
  const heavy = level === "overEncumbered" || level === "overloaded";
  return {
    level, minimal: s * 2, encumbered: s * 3, overEncumbered: s * 4, moveMult,
    enduranceMult: level === "encumbered" ? 0.5 : heavy ? 0 : 1,
    canSprint: !heavy, canMelee: !heavy
  };
}

const PHYS = ["str", "dex", "end"];

/**
 * Natural healing (p.106): 1 point of STR, DEX, and END per day of rest, never above the maximum,
 * and only while END is above 0. Medical care doubles the rate.
 * @param {{str: {value: number, max: number}, dex: {...}, end: {...}}} chars
 * @returns {{after: {str: number, dex: number, end: number}, healed: number, blocked: boolean}}
 */
export function naturalHealing(chars, days = 1, { medical = false } = {}) {
  const after = Object.fromEntries(PHYS.map(k => [k, chars[k].value]));
  if (chars.end.value <= 0) return { after, healed: 0, blocked: true };
  const per = (medical ? 2 : 1) * Math.max(0, Math.floor(days));
  let healed = 0;
  for (const k of PHYS) {
    const v = Math.min(chars[k].max, chars[k].value + per);
    healed += Math.max(0, v - chars[k].value);
    after[k] = Math.max(v, chars[k].value);
  }
  return { after, healed, blocked: false };
}

/**
 * Heal a number of points: END first (up to max), then the lower of STR and DEX.
 * @returns {{str: number, dex: number, end: number}}
 */
export function healPoints(chars, amount) {
  const after = Object.fromEntries(PHYS.map(k => [k, chars[k].value]));
  let left = Math.max(0, Math.floor(amount));
  const room = k => Math.max(0, chars[k].max - after[k]);
  const e = Math.min(room("end"), left); after.end += e; left -= e;
  while (left > 0 && (room("str") || room("dex"))) {
    const k = room("str") && (!room("dex") || after.str <= after.dex) ? "str" : "dex";
    after[k] += 1; left -= 1;
  }
  return after;
}

/** Highest PSI possible (p.114): 15, and never above STR + DEX + END + INT. */
export function psiCap({ str = 0, dex = 0, end = 0, int = 0 } = {}) {
  return Math.min(15, Math.max(0, str + dex + end + int));
}

/** PSI recovery (p.114): 1 point per hour of rest, up to the maximum. */
export function recoverPsi(value, max, hours = 1) {
  return Math.max(value, Math.min(max, value + Math.max(0, Math.floor(hours))));
}

/** Psionic range bands (p.115). */
export const PSI_RANGE_BANDS = ["close", "short", "medium", "long", "veryLong", "distant", "far", "regional",
  "continental", "planetary", "orbit", "interspace", "interplanetary"];

/** Extra PSI cost by range band and discipline (p.115). null = out of reach. */
const PSI_RANGE_COST = {
  telepathy:     [0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 9],
  clairvoyance:  [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 7, 8],
  telekinesis:   [0, 1, 2, 4, 9, null, null, null, null, null, null, null, null],
  teleportation: [1, 2, 3, 3, 4, 4, 5, 5, 6, 7, null, null, null],
  special:       [0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, null, null]
};

/** Extra PSI to project a talent to a range band (p.115). Awareness acts on the user: 0. */
export function psiRangeCost(discipline, band = "close") {
  const row = PSI_RANGE_COST[discipline];
  if (!row) return 0;
  const i = PSI_RANGE_BANDS.indexOf(band);
  return i < 0 ? 0 : row[i];
}

/** Base PSI cost of a talent from its text: "1+" -> 1, "3" -> 3, "0+" -> 0, "" -> 0. */
export function parsePsiCost(text) {
  const m = String(text ?? "").match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Target number from a text like "8+" or "10"; `fallback` when there is none. */
export function parseTarget(text, fallback = 8) {
  const m = String(text ?? "").match(/\d+/);
  return m ? Number(m[0]) : fallback;
}

/**
 * Automated drug effects (p.120-121), matched on the drug name.
 * @returns {{key: string, psi?: number, str?: number, end?: number, healDays?: number}|null}
 */
export function drugEffect(name) {
  const n = String(name ?? "").toLowerCase();
  if (/psi.*double/.test(n)) return { key: "psiDouble", psi: 6 };
  if (/psi.*boost/.test(n)) return { key: "psiBoost", psi: 3 };
  if (/psi.*special/.test(n)) return { key: "psiSpecial" };
  if (/combat/.test(n)) return { key: "combat", str: 2, end: 2 };
  if (/slow/.test(n) && /medical/.test(n)) return { key: "medicalSlow", healDays: 30 };
  if (/antidote/.test(n)) return { key: "antidote" };
  if (/slow/.test(n)) return { key: "slow" };
  if (/fast/.test(n)) return { key: "fast" };
  if (/anagathic/.test(n)) return { key: "anagathic" };
  if (/truth/.test(n)) return { key: "truth" };
  if (/medical/.test(n)) return { key: "medical" };
  return null;
}

/**
 * Falling damage per gravity (p.107), as book dice for `metres` fallen.
 * @param {number} sizeCode  planet size 0-15 (A=10)
 */
export function fallDamage(sizeCode, metres) {
  const m = Math.max(0, Math.floor(metres));
  const s = Number(sizeCode) || 0;
  if (s <= 3) return String(Math.floor(m / 2));
  if (s <= 6) return Math.floor(m / 2) ? `${Math.floor(m / 2)}D3` : "0";
  if (s <= 9) return m ? `${m}D` : "0";
  if (s <= 11) return m ? `${2 * m}D` : "0";
  return Math.floor(m / 2) ? `${3 * Math.floor(m / 2)}D` : "0";
}

/**
 * Skill training (p.122) to reach `rank`.
 * @returns {{weeks: number, target: number, cost: number}}
 */
export function trainingFor(rank, { instructor = false } = {}) {
  const r = Math.min(5, Math.max(0, rank));
  const self = [8, 8, 10, 10, 12, 12][r];
  return instructor
    ? { weeks: 4 * (r + 1), target: self - 2, cost: 5000 * (r + 1) }
    : { weeks: 8 + 4 * r, target: self, cost: 2500 * (r + 1) };
}
