/**
 * Vehicle damage (book p.49): hit locations, damage conversion, armour, and damage application.
 * Pure functions, no Foundry globals. Re-exported by ./vehicles.mjs.
 */
/** Damage location, 1D (book p.49). */
export const VEHICLE_LOCATIONS = {
  civilian: { 1: "interior", 2: "drive", 3: "handling", 4: "hull", 5: "hull", 6: "hull" },
  military: { 1: "interior", 2: "drive", 3: "handling", 4: "weapon", 5: "hull", 6: "hull" }
};

/**
 * Hit location for a 1D roll (book p.49). Called by damageVehicle.
 * @param {number} d6
 * @param {boolean} [military]
 * @returns {string}
 */
export function vehicleLocation(d6, military = false) {
  return VEHICLE_LOCATIONS[military ? "military" : "civilian"][Math.max(1, Math.min(6, d6))];
}

/**
 * Convert damage from a source into vehicle damage points (book p.49).
 * vehicle: as rolled; personal: any rolled weapon dice deal 1; starship: x6.
 * Called by damageVehicle.
 * @param {number} amount
 * @param {"vehicle"|"personal"|"starship"} [source]
 * @returns {number}
 */
export function toVehicleDamage(amount, source = "vehicle") {
  const n = Math.max(0, Number(amount) || 0);
  if (source === "personal") return n > 0 ? 1 : 0;
  if (source === "starship") return n * 6;
  return n;
}

/**
 * Vehicle weapon damage against a person: 6 per vehicle damage point (book p.49).
 * @param {number} amount  vehicle damage points
 * @returns {number} personal damage
 */
export function vehicleDamageToPerson(amount) {
  return 6 * Math.max(0, Number(amount) || 0);
}

/**
 * Damage a person (character, NPC, or creature) takes from a mounted weapon (book p.49).
 * vehicle: x6 per vehicle damage point; personal: as rolled.
 * BOOK: the book does not convert starship weapon damage for people. It gives starship -> vehicle
 * x6 and vehicle -> person x6, so we chain them: starship -> person x36.
 * Called by applyHit (craft/damage.mjs).
 * @param {number} amount
 * @param {"vehicle"|"personal"|"starship"} [source]
 * @returns {number}
 */
export function personDamage(amount, source = "vehicle") {
  const n = Math.max(0, Number(amount) || 0);
  if (source === "personal") return n;
  if (source === "starship") return vehicleDamageToPerson(n * 6);
  return vehicleDamageToPerson(n);
}

/**
 * Order in which a vehicle's armour rating goes onto its locations, one point per location (p.49).
 * BOOK: "Any vehicle that comes with an armour rating has 1 rating assigned to one of the different
 * damage locations" but the book does not say which ones. We armour the hull first (most hits land
 * there), then the interior (it protects the occupants), then the drive, handling, and weapon.
 */
export const VEHICLE_ARMOR_ORDER = ["hull", "interior", "drive", "handling", "weapon"];

/**
 * The armoured locations of a vehicle (book p.49). When any location has `armored: true`, those
 * are the armoured locations. When none has, the armour rating is spread over VEHICLE_ARMOR_ORDER,
 * one point per location that exists (max > 0), so hand-made vehicles with only `armor: N` work.
 * Called by applyVehicleDamage and deriveVehicle.
 * @param {Record<string, {max: number, armored?: boolean}>} locations
 * @param {number} [armor]  the vehicle's armour rating (system.armor)
 * @returns {string[]}
 */
export function armoredLocations(locations, armor = 0) {
  const flagged = Object.entries(locations ?? {}).filter(([, l]) => l?.armored).map(([k]) => k);
  if (flagged.length) return flagged;
  const n = Math.max(0, Math.floor(Number(armor) || 0));
  return VEHICLE_ARMOR_ORDER.filter(k => (locations?.[k]?.max ?? 0) > 0).slice(0, n);
}

/**
 * Explosion check: 1D + DM, 4+ explodes and deals 6D to every occupant (book p.49).
 * @param {number} d6
 * @param {number} [dm]
 * @returns {boolean}
 */
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
 * Called by damageVehicle (craft/vehicle-damage.mjs).
 * @param {object} state  { locations: {interior,drive,handling,hull,weapon: {value,max,armored}}, armor, destroyed }
 *                        `armor` is the armour rating, used when no location is flagged (armoredLocations).
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
  if (armoredLocations(L, s.armor).includes(location) && points > 0) {
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

/**
 * Effective speed band after drive damage (book p.49). Called by deriveVehicle.
 * @param {number} speedBand
 * @param {{value: number, max: number}} drive
 * @returns {number}
 */
export function effectiveSpeedBand(speedBand, drive) {
  if (drive.max > 0 && drive.value <= 0) return 0;
  return Math.max(0, speedBand - Math.max(0, drive.max - drive.value));
}

/**
 * Effective range in km after handling damage: -20% per point (book p.49).
 * @param {number} rangeKm
 * @param {{value: number, max: number}} handling
 * @returns {number}
 */
export function effectiveRange(rangeKm, handling) {
  const lost = Math.max(0, handling.max - handling.value);
  return Math.max(0, Math.round(rangeKm * Math.max(0, 1 - 0.2 * lost)));
}
