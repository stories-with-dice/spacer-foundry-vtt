/**
 * Space range bands and movement (book p.84). Pure functions, no Foundry globals.
 * Re-exported by ./space-combat.mjs.
 */

/** Space range bands with the starship combat range DM (book p.84). */
export const SPACE_RANGES = [
  { key: "adjacent", distance: "< 1 km", dm: 1 },
  { key: "close", distance: "1-10 km", dm: 0 },
  { key: "medium", distance: "11-1,000 km", dm: -2 },
  { key: "long", distance: "1,001-10,000 km", dm: -4 },
  { key: "distant", distance: "10,001-50,000 km", dm: -6 },
  { key: "beyond", distance: "50,001+ km", dm: -8 }
];

/**
 * Range DM for a band key or index (book p.84). "Beyond" takes -2 more per extra 10,000 km.
 * Called by attackDM and the ship sheet.
 * @param {string|number} band
 * @param {number} [extra10k]  extra 10,000 km steps beyond 50,000 km
 * @returns {number}
 */
export function rangeDM(band, extra10k = 0) {
  const r = typeof band === "number" ? SPACE_RANGES[band] : SPACE_RANGES.find(b => b.key === band);
  if (!r) return 0;
  return r.dm - (r.key === "beyond" ? 2 * Math.max(0, extra10k) : 0);
}

/**
 * Index of a range band (0 = adjacent). Called by missileDelay and the space combat helper.
 * @param {string|number} band
 * @returns {number} -1 when the key is unknown
 */
export function rangeIndex(band) {
  return typeof band === "number" ? band : SPACE_RANGES.findIndex(b => b.key === band);
}

/**
 * -2 DM per crew position beyond the first that one crew member fills (book p.84).
 * @param {number} positions
 * @returns {number}
 */
export function multiplePositionsDM(positions) {
  return -2 * Math.max(0, (Number(positions) || 1) - 1);
}

/**
 * Space movement (book p.84): moving N range bands takes N rounds using N thrust.
 * @param {number} thrust  thrust left this round
 * @param {number} bands
 * @returns {{possible: boolean, rounds: number, thrust: number}}
 */
export function movementPlan(thrust, bands) {
  const n = Math.abs(Number(bands) || 0);
  return { possible: n === 0 || (Number(thrust) || 0) >= n, rounds: n, thrust: n };
}

/**
 * Move a range band index toward (-) or away (+), clamped. Adjacent ships are dogfighting (p.84).
 * Called by the space combat helper.
 * @param {number} index
 * @param {number} delta
 * @returns {{index: number, key: string, dogfight: boolean}}
 */
export function shiftRange(index, delta) {
  const i = Math.max(0, Math.min(SPACE_RANGES.length - 1, (Number(index) || 0) + delta));
  return { index: i, key: SPACE_RANGES[i].key, dogfight: i === 0 };
}
