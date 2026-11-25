/**
 * Vehicles and vehicular combat (book p.46-49). Pure functions, no Foundry globals.
 */

/** Maximum km/h by speed band (book p.46). */
export const SPEED_BAND_KMH = [0, 20, 50, 100, 200, 300, 500, 800, 1200, 3000, 6000];

export function speedKmh(band) {
  const b = Math.max(0, Math.min(SPEED_BAND_KMH.length - 1, Math.floor(Number(band) || 0)));
  return SPEED_BAND_KMH[b];
}

/** Cruising speed: one band below top speed, only for speed band 3+ (book p.46). */
export function cruiseBand(top) {
  return top >= 3 ? top - 1 : null;
}

/**
 * Top-speed operation DM (book p.46): at top speed, -1 DM per step of speed above the operator's
 * Drive rank. At cruising speed or below there is no penalty.
 * Example: Drive 2, speed band 4: speed 3 = 0, speed 4 = -2.
 */
export function topSpeedDM(speed, top, driveRank) {
  const s = Number(speed) || 0;
  if (s <= 0 || s < top) return 0;
  return -Math.max(0, s - (Number(driveRank) || 0));
}

/** Attack DM from the speed band difference between attacker and defender (book p.49). */
export function speedAttackDM(attackerSpeed, defenderSpeed) {
  return -Math.abs((Number(attackerSpeed) || 0) - (Number(defenderSpeed) || 0));
}

/** Cargo instead of occupants: 50kg per occupant slot (book p.46). */
export function cargoForOccupants(slots) {
  return 50 * Math.max(0, Number(slots) || 0);
}

/** Operating skill for a vehicle by its traits (book p.48). */
export function vehicleSkill(traits = [], category = "") {
  const t = traits.map(x => String(x).toLowerCase());
  if (t.includes("air") || category === "aircraft") return { skill: "Pilot", specialty: "Aircraft" };
  if (t.includes("grav") || category === "gravcraft") return { skill: "Drive", specialty: "Grav" };
  if (t.includes("marine") || category === "watercraft") return { skill: "Drive", specialty: "Marine" };
  if (t.includes("military")) return { skill: "Drive", specialty: "Military" };
  if (t.includes("industrial")) return { skill: "Drive", specialty: "Industrial" };
  return { skill: "Drive", specialty: "Civilian" };
}

/** Damage location, 1D (book p.49). */
export const VEHICLE_LOCATIONS = {
  civilian: { 1: "interior", 2: "drive", 3: "handling", 4: "hull", 5: "hull", 6: "hull" },
  military: { 1: "interior", 2: "drive", 3: "handling", 4: "weapon", 5: "hull", 6: "hull" }
};

export function vehicleLocation(d6, military = false) {
  return VEHICLE_LOCATIONS[military ? "military" : "civilian"][Math.max(1, Math.min(6, d6))];
}

/**
 * Convert damage from a source into vehicle damage points (book p.49).
 * vehicle: as rolled; personal: any rolled weapon dice deal 1; starship: x6.
 */
export function toVehicleDamage(amount, source = "vehicle") {
  const n = Math.max(0, Number(amount) || 0);
  if (source === "personal") return n > 0 ? 1 : 0;
  if (source === "starship") return n * 6;
  return n;
}

/** Vehicle weapon damage against a person: 6 per vehicle damage point (book p.49). */
export function vehicleDamageToPerson(amount) {
  return 6 * Math.max(0, Number(amount) || 0);
}

/** Explosion check: 1D + DM, 4+ explodes and deals 6D to every occupant (book p.49). */
export function explodes(d6, dm = 0) {
  return d6 + dm >= 4;
}

/**
 * Apply damage to a vehicle location. Pure: rolls come from `opts`.
 * Rules (book p.49):
 *  - Armour on the hit location reduces the damage by 1. Damage transferred to the hull
 *    is not reduced by hull armour.
 *  - Interior: occupants take 1D per damage point. Open trait: on 1D 2+ (opts.openRoll) the
 *    occupants or cargo are hit instead of the interior. At 0 the vehicle cannot be controlled;
 *    excess goes to the hull.
 *  - Drive: each point lowers the speed band; at 0 the vehicle cannot move; excess to the hull.
 *  - Handling: each point cuts range by 20%; at 0 the power system is destroyed and the vehicle
 *    makes an explosion check; excess to the hull.
 *  - Hull: at 0 the structure is compromised. A hit that brings the hull to 0, or hits it at 0,
 *    calls for an explosion check with +DM equal to the damage beyond 0.
 *  - Weapon: each point disables one weapon; extra hits go to the hull. A vehicle with no weapon
 *    location sends weapon hits to the hull.
 *
 * @param {object} state  { locations: {interior,drive,handling,hull,weapon: {value,max,armored}}, destroyed }
 * @param {string} location
 * @param {number} amount
 * @param {{open?: boolean, openRoll?: number}} [opts]
 * @returns {{state: object, log: Array<{location:string,text:string}>, events: Array<object>}}
 */
export function applyVehicleDamage(state, location, amount, opts = {}) {
  const s = structuredClone(state);
  const L = s.locations;
  const log = [];
  const events = [];
  let points = Math.max(0, Math.floor(Number(amount) || 0));
  if (s.destroyed || !L[location]) return { state: s, log, events };
  if (L[location].armored && points > 0) {
    points -= 1;
    log.push({ location, text: "armour:1" });
    events.push({ type: "armor", location, absorbed: 1 });
  }
  if (points <= 0) return { state: s, log, events };

  const toHull = (n, from) => {
    if (n <= 0) return;
    const before = L.hull.value;
    L.hull.value = Math.max(0, before - n);
    const beyond = Math.max(0, n - before);
    log.push({ location: "hull", text: from ? `transfer:${from}:${n}` : `hit:${n}` });
    if (L.hull.value <= 0) {
      events.push({ type: "hullCompromised" });
      events.push({ type: "explosionCheck", cause: "hull", dm: beyond });
    }
  };

  if (location === "interior" && opts.open && (opts.openRoll ?? 0) >= 2) {
    log.push({ location, text: "open" });
    events.push({ type: "occupants", dice: points, cause: "open" });
    return { state: s, log, events };
  }

  if (location === "hull") { toHull(points); return { state: s, log, events }; }

  const loc = L[location];
  const before = loc.value;
  const taken = Math.min(before, points);
  const excess = points - taken;
  loc.value = before - taken;
  if (taken > 0) log.push({ location, text: `hit:${taken}` });
  switch (location) {
    case "interior":
      events.push({ type: "occupants", dice: points, cause: "interior" });
      if (loc.value <= 0) events.push({ type: "uncontrolled" });
      break;
    case "drive":
      if (taken) events.push({ type: "speedLoss", bands: taken });
      if (loc.value <= 0) events.push({ type: "immobile" });
      break;
    case "handling":
      if (taken) events.push({ type: "rangeLoss", percent: 20 * taken });
      if (before > 0 && loc.value <= 0) {
        events.push({ type: "powerDestroyed" });
        events.push({ type: "explosionCheck", cause: "handling", dm: 0 });
      }
      break;
    case "weapon":
      for (let i = 0; i < taken; i++) events.push({ type: "weaponDisabled" });
      break;
  }
  toHull(excess, location);
  return { state: s, log, events };
}

/** Effective speed band after drive damage. */
export function effectiveSpeedBand(speedBand, drive) {
  if (drive.max > 0 && drive.value <= 0) return 0;
  return Math.max(0, speedBand - Math.max(0, drive.max - drive.value));
}

/** Effective range in km after handling damage: -20% per point (book p.49). */
export function effectiveRange(rangeKm, handling) {
  const lost = Math.max(0, handling.max - handling.value);
  return Math.max(0, Math.round(rangeKm * Math.max(0, 1 - 0.2 * lost)));
}

/** Ramming (book p.49): defender takes the speed band difference, rammer half of it rounded up. */
export function ramDamage(attackerSpeed, defenderSpeed) {
  const d = Math.abs((Number(attackerSpeed) || 0) - (Number(defenderSpeed) || 0));
  return { defender: d, attacker: Math.ceil(d / 2) };
}

/** Hit-and-run damage (book p.49): 1D per speed band plus 1 per tonne. Returns book dice. */
export function hitAndRunDice(speedBand, weightTons) {
  const n = Math.max(0, Math.floor(Number(speedBand) || 0));
  const t = Math.max(0, Math.floor(Number(weightTons) || 0));
  if (n === 0) return t ? String(t) : "0";
  return t ? `${n}D+${t}` : `${n}D`;
}

/** Offensive driving weight DM (book p.49): +1 per full 2 tonnes the attacker outweighs the target. */
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

/** Control check after losing offensive driving: natural 2 or less flips, failure spins out. */
export function controlCheckOutcome(natural, total, target = 8) {
  if (natural <= 2) return "flip";
  return total >= target ? "control" : "spin";
}
