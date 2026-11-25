/**
 * Vehicles and vehicular combat (book p.46-49). Pure functions, no Foundry globals.
 * Re-exports ./vehicle-damage.mjs so `game.spacer.craft.rules.vehicles` keeps one namespace.
 */
export * from "./vehicle-damage.mjs";

/** Maximum km/h by speed band (book p.46). */
export const SPEED_BAND_KMH = [0, 20, 50, 100, 200, 300, 500, 800, 1200, 3000, 6000];

/**
 * Top km/h of a speed band (book p.46). Called by deriveVehicle.
 * @param {number} band
 * @returns {number}
 */
export function speedKmh(band) {
  const b = Math.max(0, Math.min(SPEED_BAND_KMH.length - 1, Math.floor(Number(band) || 0)));
  return SPEED_BAND_KMH[b];
}

/**
 * Cruising speed: one band below top speed, only for speed band 3+ (book p.46).
 * @param {number} top  top speed band
 * @returns {number|null}
 */
export function cruiseBand(top) {
  return top >= 3 ? top - 1 : null;
}

/**
 * Top-speed operation DM (book p.46): at top speed, -1 DM per step of speed above the operator's
 * Drive rank. At cruising speed or below there is no penalty.
 * Example: Drive 2, speed band 4: speed 3 = 0, speed 4 = -2.
 * BOOK: the book does not say what an untrained operator (rank -3) gets. The roll already takes
 * the untrained -3 once, so we floor the rank at 0 here: speed 4 untrained = -4, not -7.
 * Called by vehicleSpeedDM (craft/vehicle-actions.mjs).
 * @param {number} speed      current speed band
 * @param {number} top        effective top speed band
 * @param {number} driveRank  operator's Drive/Pilot rank (-3 untrained)
 * @returns {number} a DM <= 0
 */
export function topSpeedDM(speed, top, driveRank) {
  const s = Number(speed) || 0;
  if (s <= 0 || s < top) return 0;
  return -Math.max(0, s - Math.max(0, Number(driveRank) || 0));
}

/**
 * Attack DM from the speed band difference between attacker and defender (book p.49).
 * @param {number} attackerSpeed
 * @param {number} defenderSpeed
 * @returns {number}
 */
export function speedAttackDM(attackerSpeed, defenderSpeed) {
  return -Math.abs((Number(attackerSpeed) || 0) - (Number(defenderSpeed) || 0));
}

/**
 * Cargo instead of occupants: 50kg per occupant slot (book p.46).
 * @param {number} slots
 * @returns {number} kg
 */
export function cargoForOccupants(slots) {
  return 50 * Math.max(0, Number(slots) || 0);
}

/**
 * Operating skill for a vehicle by its traits (book p.48). Called by operatorRank.
 * @param {string[]} [traits]
 * @param {string} [category]
 * @returns {{skill: string, specialty: string}}
 */
export function vehicleSkill(traits = [], category = "") {
  const t = traits.map(x => String(x).toLowerCase());
  if (t.includes("air") || category === "aircraft") return { skill: "Pilot", specialty: "Aircraft" };
  if (t.includes("grav") || category === "gravcraft") return { skill: "Drive", specialty: "Grav" };
  if (t.includes("marine") || category === "watercraft") return { skill: "Drive", specialty: "Marine" };
  if (t.includes("military")) return { skill: "Drive", specialty: "Military" };
  if (t.includes("industrial")) return { skill: "Drive", specialty: "Industrial" };
  return { skill: "Drive", specialty: "Civilian" };
}

/**
 * Ramming (book p.49): defender takes the speed band difference, rammer half of it rounded up.
 * @param {number} attackerSpeed
 * @param {number} defenderSpeed
 * @returns {{defender: number, attacker: number}}
 */
export function ramDamage(attackerSpeed, defenderSpeed) {
  const d = Math.abs((Number(attackerSpeed) || 0) - (Number(defenderSpeed) || 0));
  return { defender: d, attacker: Math.ceil(d / 2) };
}

/**
 * Hit-and-run damage (book p.49): 1D per speed band plus 1 per tonne.
 * @param {number} speedBand
 * @param {number} weightTons
 * @returns {string} book dice, e.g. "2D+2"
 */
export function hitAndRunDice(speedBand, weightTons) {
  const n = Math.max(0, Math.floor(Number(speedBand) || 0));
  const t = Math.max(0, Math.floor(Number(weightTons) || 0));
  if (n === 0) return t ? String(t) : "0";
  return t ? `${n}D+${t}` : `${n}D`;
}

/**
 * Offensive driving weight DM (book p.49): +1 per full 2 tonnes the attacker outweighs the target.
 * @param {number} attackerTons
 * @param {number} targetTons
 * @returns {number}
 */
export function offensiveDrivingDM(attackerTons, targetTons) {
  return Math.max(0, Math.floor(((Number(attackerTons) || 0) - (Number(targetTons) || 0)) / 2));
}

/**
 * Resolve offensive driving from two contested totals (book p.49).
 * Attacker wins on a higher total; ties go to the defender.
 * @returns {{winner: "attacker"|"defender", difference: number, attackerSpeedLoss: number, controlDM: number}}
 */
export function offensiveDrivingResult(attackerTotal, defenderTotal) {
  const diff = Math.abs(attackerTotal - defenderTotal);
  if (attackerTotal > defenderTotal) return { winner: "attacker", difference: diff, attackerSpeedLoss: 0, controlDM: -diff };
  return { winner: "defender", difference: diff, attackerSpeedLoss: diff, controlDM: 0 };
}

/**
 * Control check after losing offensive driving (book p.49): natural 2 or less flips, failure spins out.
 * @param {number} natural  2D without DMs
 * @param {number} total
 * @param {number} [target]
 * @returns {"flip"|"control"|"spin"}
 */
export function controlCheckOutcome(natural, total, target = 8) {
  if (natural <= 2) return "flip";
  return total >= target ? "control" : "spin";
}
