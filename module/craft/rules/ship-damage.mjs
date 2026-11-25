/**
 * Starship and small craft damage (book p.86-87): location tables and damage application.
 * Pure functions, no Foundry globals. Re-exported by ./space-combat.mjs.
 */
import { systemState, fuelHitsMax, internalPoints, armorLayers } from "./drives.mjs";

/** Starship damage location, 2D (book p.86). */
export const SHIP_LOCATIONS_2D = {
  2: "internal", 3: "power", 4: "fuel", 5: "mDrive", 6: "weapon", 7: "hull",
  8: "weapon", 9: "mDrive", 10: "jDrive", 11: "power", 12: "internal"
};
/** Small craft damage location, 1D (book p.86). */
export const SMALL_CRAFT_LOCATIONS_1D = { 1: "cockpit", 2: "weapon", 3: "drive", 4: "drive", 5: "hull", 6: "hull" };

/**
 * Hit location for a location roll (book p.86). Called by damageShip.
 * @param {number} roll        2D total (ships) or 1D (small craft)
 * @param {boolean} [smallCraft]
 * @returns {string}
 */
export function shipLocation(roll, smallCraft = false) {
  return smallCraft ? SMALL_CRAFT_LOCATIONS_1D[Math.max(1, Math.min(6, roll))] : SHIP_LOCATIONS_2D[Math.max(2, Math.min(12, roll))];
}

/** Internal hit sub-table, D3 (book p.87). */
export const INTERNAL_EFFECTS = { 1: "computer", 2: "crew", 3: "cargo" };

/**
 * Cargo damage on a failed 8+ roll: 10% per point of failure (book p.87). Called by damageShip.
 * @param {number} roll  2D total
 * @returns {number} percent of the cargo damaged
 */
export function cargoDamagePercent(roll) {
  return roll >= 8 ? 0 : Math.min(100, (8 - roll) * 10);
}

/**
 * Starship destroyed: explodes on 4+ on 1D, otherwise breaks apart (book p.86).
 * @param {number} d6
 * @returns {boolean}
 */
export function destroyedShipExplodes(d6) {
  return d6 >= 4;
}

/**
 * Apply damage to a starship or small craft. Pure: it returns the new state and a log, and
 * never rolls dice. Rolls the caller must supply: `internalRolls` (D3 per internal hit).
 * Called by damageShip (craft/ship-damage.mjs).
 *
 * @param {object} state
 * @param {number} state.tonnage
 * @param {boolean} [state.smallCraft]
 * @param {{value:number,max:number}} state.hull
 * @param {{rating:string,value:number,damage:number,destroyed:boolean}} state.jDrive / mDrive / power
 * @param {{value:number,max:number}} state.fuel
 * @param {number} [state.fuelHits]       10T leaks so far
 * @param {number} [state.internalHits]
 * @param {number} [state.cockpitHits]
 * @param {Array<{id:string, disabled?:boolean, destroyed?:boolean}>} [state.weapons]
 * @param {Record<string,number>} [state.armor]  armour layers per location
 * @param {string} location   internal | power | fuel | mDrive | jDrive | weapon | hull | cockpit | drive
 * @param {number} amount     damage points
 * @param {{internalRolls?: number[], ignoreArmor?: boolean}} [opts]
 * @returns {{state: object, log: Array<{location:string, text:string}>, events: Array<object>}}
 */
export function applyShipDamage(state, location, amount, opts = {}) {
  const s = structuredClone(state);
  s.destroyed = !!s.destroyed; s.fuelHits ??= 0; s.internalHits ??= 0; s.cockpitHits ??= 0; s.weapons ??= []; s.armor ??= {};
  const log = [];
  const events = [];
  const internalRolls = [...(opts.internalRolls ?? [])];
  const armorKey = location === "drive" ? "mDrive" : location;
  const layers = opts.ignoreArmor ? 0 : Math.max(0, Number(s.armor[armorKey]) || 0);
  let points = Math.max(0, Math.floor(Number(amount) || 0));
  if (layers && points) {
    const absorbed = Math.min(points, layers);
    points -= absorbed;
    log.push({ location, text: `armour:${absorbed}` });
    events.push({ type: "armor", location, absorbed });
  }
  if (s.destroyed) return { state: s, log, events };

  const hitHull = (n, from) => {
    for (let i = 0; i < n && !s.destroyed; i++) {
      if (s.smallCraft) {
        if (s.hull.value <= 0) { destroy("hull"); break; }
        s.hull.value -= 1;
        log.push({ location: "hull", text: from ? `transfer:${from}` : "hit" });
      } else {
        s.hull.value = Math.max(0, s.hull.value - 1);
        log.push({ location: "hull", text: from ? `transfer:${from}` : "hit" });
        if (s.hull.value === 1) events.push({ type: "critical", location: "hull" });
        if (s.hull.value <= 0) destroy("hull");
      }
    }
  };
  const destroy = (cause) => {
    if (s.destroyed) return;
    s.destroyed = true;
    events.push({ type: "destroyed", cause });
  };

  // Armour beyond 1 layer per 100T shifts the hull column (p.77). deriveShip uses the same
  // armorLayers(), so a hit steps the drive exactly as the sheet shows it.
  const layersTotal = armorLayers(s.armor);
  const hitSystem = (key) => {
    const sys = s[key];
    const before = systemState(sys, s.tonnage, layersTotal);
    if (before.destroyed) { hitHull(1, key); return; }
    sys.damage = (sys.damage || 0) + 1;
    const after = systemState(sys, s.tonnage, layersTotal);
    if (after.destroyed) {
      sys.destroyed = true;
      log.push({ location: key, text: "destroyed" });
      events.push({ type: "systemDestroyed", location: key });
      if (key === "power") { events.push({ type: "explode", location: key }); destroy("power"); }
    } else {
      log.push({ location: key, text: `${before.letter}>${after.letter}` });
      if (after.critical) events.push({ type: "critical", location: key });
    }
  };

  for (let i = 0; i < points && !s.destroyed; i++) {
    if (s.smallCraft) {
      switch (location) {
        case "cockpit":
          if (s.cockpitHits === 0) { s.cockpitHits = 1; log.push({ location, text: "hit" }); events.push({ type: "pilotDamage", dice: "2D" }); }
          else if (s.cockpitHits === 1) { s.cockpitHits = 2; log.push({ location, text: "destroyed" }); events.push({ type: "systemDestroyed", location }); }
          else hitHull(1, location);
          break;
        case "drive":
        case "mDrive": {
          const thrust = Math.max(0, Number(s.mDrive.value) || 0);
          if ((s.mDrive.damage || 0) < thrust) {
            s.mDrive.damage = (s.mDrive.damage || 0) + 1;
            log.push({ location: "drive", text: `${thrust - s.mDrive.damage}/${thrust}` });
            if (s.mDrive.damage >= thrust) events.push({ type: "critical", location: "drive" });
          } else {
            s.mDrive.destroyed = true;
            events.push({ type: "explode", location: "drive" });
            destroy("drive");
          }
          break;
        }
        case "weapon": hitWeapon(true); break;
        default: hitHull(1);
      }
      continue;
    }
    switch (location) {
      case "hull": hitHull(1); break;
      case "mDrive": case "jDrive": case "power": hitSystem(location); break;
      case "fuel": {
        const max = fuelHitsMax(s.fuel.max);
        if (s.fuelHits >= max) { hitHull(1, "fuel"); break; }
        s.fuelHits += 1;
        const capacity = Math.max(0, s.fuel.max - 10 * s.fuelHits);
        const lost = Math.max(0, s.fuel.value - capacity);
        s.fuel.value = Math.min(s.fuel.value, capacity);
        log.push({ location, text: `leak:${lost}` });
        if (s.fuelHits >= max) events.push({ type: "critical", location: "fuel" });
        break;
      }
      case "internal": {
        const max = internalPoints(s.tonnage);
        if (s.internalHits >= max) { hitHull(1, "internal"); break; }
        s.internalHits += 1;
        const d3 = internalRolls.shift() ?? 1;
        const effect = INTERNAL_EFFECTS[Math.max(1, Math.min(3, d3))];
        log.push({ location, text: effect });
        events.push({ type: "internal", effect, internalHits: s.internalHits });
        if (s.internalHits >= max) events.push({ type: "depressurized", location });
        break;
      }
      case "weapon": hitWeapon(false); break;
      default: hitHull(1);
    }
  }

  function hitWeapon(small) {
    const ok = s.weapons.find(w => !w.disabled && !w.destroyed);
    if (ok) { ok.disabled = true; log.push({ location: "weapon", text: `disabled:${ok.id}` }); events.push({ type: "weaponDisabled", id: ok.id }); return; }
    if (!small) {
      const dis = s.weapons.find(w => w.disabled && !w.destroyed);
      if (dis) {
        dis.destroyed = true;
        log.push({ location: "weapon", text: `destroyed:${dis.id}` });
        events.push({ type: "weaponDestroyed", id: dis.id });
        hitHull(1, "weapon");
        return;
      }
    }
    hitHull(1, "weapon");
  }

  return { state: s, log, events };
}

/**
 * Fraction of the hull lost, for morale (book p.84).
 * @param {{value: number, max: number}} hull
 * @returns {number} 0-1
 */
export function hullLostFraction(hull) {
  return hull.max > 0 ? (hull.max - hull.value) / hull.max : 0;
}
