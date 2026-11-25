/**
 * Mounted weapons: attack DMs, weapon kinds, beams, and missiles (book p.76, p.84-86).
 * Pure functions, no Foundry globals. Re-exported by ./space-combat.mjs.
 */
import { rangeDM, rangeIndex, multiplePositionsDM } from "./ranges.mjs";

const weaponText = w => `${w?.name ?? ""} ${w?.mount ?? ""}`.toLowerCase();

/**
 * Pulse and beam weapons take +2 DM (book p.84). Reads the name, mount, and traits.
 * @param {{name?: string, mount?: string, traits?: string[]}} weapon
 * @returns {boolean}
 */
export function isEnergyWeapon(weapon) {
  return /pulse|beam|laser/.test(`${weaponText(weapon)} ${(weapon?.traits ?? []).join(" ")}`.toLowerCase());
}

/**
 * A missile rack (book p.76). Reads the name and mount.
 * @param {{name?: string, mount?: string}} weapon
 * @returns {boolean}
 */
export function isMissile(weapon) {
  return /missile/.test(weaponText(weapon));
}

/**
 * A beam laser (book p.76): damage grows with the rounds it holds contact.
 * @param {{name?: string, mount?: string}} weapon
 * @returns {boolean}
 */
export function isBeam(weapon) {
  return /beam/.test(weaponText(weapon));
}

/** Called shot to a chosen location: -2 DM (book p.86). */
export const CALLED_SHOT_DM = -2;

/**
 * Total DM for a gunner's attack roll (book p.84-86). Called by fireWeapon for ship weapons.
 * @param {object} o
 * @param {string|number} o.range   space range band
 * @param {boolean} [o.energy]      pulse or beam weapon (+2)
 * @param {boolean} [o.called]      called shot (-2)
 * @param {number} [o.evade]        effect of the target pilot's evade roll (subtracted)
 * @param {number} [o.jamming]      sensor jamming penalty (subtracted)
 * @param {number} [o.sandcaster]   sandcaster penalty: 4 vs beams (subtracted)
 * @param {number} [o.positions]    crew positions the gunner fills (-2 per extra position)
 * @param {number} [o.other]
 * @returns {{total: number, parts: Record<string, number>}}
 */
export function attackDM({ range = "close", energy = false, called = false, evade = 0, jamming = 0, sandcaster = 0, positions = 1, other = 0 } = {}) {
  const parts = {
    range: rangeDM(range),
    energy: energy ? 2 : 0,
    called: called ? CALLED_SHOT_DM : 0,
    evade: -Math.max(0, evade),
    jamming: -Math.max(0, jamming),
    sandcaster: -Math.max(0, sandcaster),
    positions: multiplePositionsDM(positions),
    other: Number(other) || 0
  };
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

/**
 * Beam overheat (book p.76): roll 1D + Gunner; overheats on a result <= rounds in use.
 * @param {number} d6
 * @param {number} gunnerRank
 * @param {number} roundsInUse
 * @returns {boolean}
 */
export function beamOverheats(d6, gunnerRank, roundsInUse) {
  return d6 + (Number(gunnerRank) || 0) <= Math.max(1, roundsInUse);
}

/* Missiles ------------------------------------------------------------------ */

/** A missile rack fires 1-4 missiles in one attack; each deals 1 damage (book p.76). */
export const MISSILES_PER_SALVO = { min: 1, max: 4 };
export const MISSILE_DAMAGE = 1;

/** The defending pilot's Pilot roll to avoid missiles needs 8+ (book p.84, "All actions require an 8+"). */
export const MISSILE_EVADE_TARGET = 8;

/**
 * Sandcasters against missiles (book p.76: "-2DM to missiles").
 * BOOK: missiles do not roll to hit (p.84: they hit automatically unless the target evades), so the
 * -2 has no roll to apply to; we add it as +2 to the defending pilot's evade roll instead.
 */
export const SANDCASTER_MISSILE_DM = 2;

/**
 * Rounds before missiles impact: the range band distance (book p.76, p.84). Adjacent = 0.
 * @param {string|number} band
 * @returns {number}
 */
export function missileDelay(band) {
  return Math.max(0, rangeIndex(band));
}

/**
 * Missiles to fire: the requested count, 1-4, and no more than the rack holds (book p.76).
 * @param {number} requested
 * @param {number} loaded  missiles in the rack
 * @returns {number} 0 when the rack is empty
 */
export function missileSalvo(requested, loaded) {
  const n = Math.max(0, Number(loaded) || 0);
  if (!n) return 0;
  const want = Math.max(MISSILES_PER_SALVO.min, Math.min(MISSILES_PER_SALVO.max, Number(requested) || 1));
  return Math.min(want, n);
}

/**
 * DM on the defending pilot's evade roll against missiles (book p.84 step 4: "may add any
 * unused thrust from this round"; p.76 sandcasters, see SANDCASTER_MISSILE_DM).
 * @param {{thrust?: number, sandcaster?: boolean}} [o]
 * @returns {number}
 */
export function missileEvadeDM({ thrust = 0, sandcaster = false } = {}) {
  return Math.max(0, Number(thrust) || 0) + (sandcaster ? SANDCASTER_MISSILE_DM : 0);
}

/**
 * Resolve a missile salvo at impact (book p.84-85). Missiles are homing: they hit unless the
 * target's pilot evades (Pilot 8+) or the sensor operator jams them (8+, p.85). There is no
 * Gunner roll. Called by the craft weapons glue (missileImpact) and the node tests.
 * @param {object} o
 * @param {number} o.shots                  missiles in the salvo
 * @param {number} [o.damagePerMissile=1]
 * @param {number|null} [o.evadeTotal]      total of the defender's evade roll, null when it did not evade
 * @param {boolean} [o.jammed]              the defender's sensor operator jammed the missiles
 * @returns {{hit: boolean, evaded: boolean, jammed: boolean, damage: number}}
 */
export function resolveMissiles({ shots, damagePerMissile = MISSILE_DAMAGE, evadeTotal = null, jammed = false } = {}) {
  const evaded = evadeTotal !== null && evadeTotal !== undefined && evadeTotal >= MISSILE_EVADE_TARGET;
  const hit = !evaded && !jammed && shots > 0;
  return { hit, evaded, jammed: !!jammed, damage: hit ? shots * Math.max(0, Number(damagePerMissile) || 0) : 0 };
}
