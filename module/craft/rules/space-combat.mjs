/**
 * Space combat (book p.84-87): range bands, movement, initiative, crew positions and actions,
 * damage location tables, and damage application. Pure functions, no Foundry globals.
 */
import { systemState, fuelHitsMax, internalPoints } from "./drives.mjs";

/** Space range bands with the starship combat range DM (book p.84). */
export const SPACE_RANGES = [
  { key: "adjacent", distance: "< 1 km", dm: 1 },
  { key: "close", distance: "1-10 km", dm: 0 },
  { key: "medium", distance: "11-1,000 km", dm: -2 },
  { key: "long", distance: "1,001-10,000 km", dm: -4 },
  { key: "distant", distance: "10,001-50,000 km", dm: -6 },
  { key: "beyond", distance: "50,001+ km", dm: -8 }
];

/** Range DM for a band key or index. "Beyond" takes -2 more per extra 10,000 km (`extra10k`). */
export function rangeDM(band, extra10k = 0) {
  const r = typeof band === "number" ? SPACE_RANGES[band] : SPACE_RANGES.find(b => b.key === band);
  if (!r) return 0;
  return r.dm - (r.key === "beyond" ? 2 * Math.max(0, extra10k) : 0);
}

export function rangeIndex(band) {
  return typeof band === "number" ? band : SPACE_RANGES.findIndex(b => b.key === band);
}

/** Pulse and beam weapons take +2 DM (book p.84). */
export function isEnergyWeapon(weapon) {
  const s = `${weapon?.name ?? ""} ${weapon?.mount ?? ""} ${(weapon?.traits ?? []).join(" ")}`.toLowerCase();
  return /pulse|beam|laser/.test(s);
}
export function isMissile(weapon) {
  const s = `${weapon?.name ?? ""} ${weapon?.mount ?? ""}`.toLowerCase();
  return /missile/.test(s);
}
export function isBeam(weapon) {
  return /beam/.test(`${weapon?.name ?? ""} ${weapon?.mount ?? ""}`.toLowerCase());
}

/** Called shot to a chosen location: -2 DM (book p.86). */
export const CALLED_SHOT_DM = -2;

/**
 * Total DM for a gunner's attack roll (book p.84-86).
 * @param {object} o
 * @param {string|number} o.range   space range band
 * @param {boolean} [o.energy]      pulse or beam weapon (+2)
 * @param {boolean} [o.called]      called shot (-2)
 * @param {number} [o.evade]        effect of the target pilot's evade roll (subtracted)
 * @param {number} [o.jamming]      sensor jamming penalty (subtracted)
 * @param {number} [o.sandcaster]   sandcaster penalty: 4 vs beams, 2 vs missiles (subtracted)
 * @param {number} [o.positions]    crew positions the gunner fills (-2 per extra position)
 * @param {number} [o.other]
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

/** -2 DM per crew position beyond the first that one crew member fills (book p.84). */
export function multiplePositionsDM(positions) {
  return -2 * Math.max(0, (Number(positions) || 1) - 1);
}

/** Initiative: 1D + M-Drive rating + pilot's Pilot rank (book p.84). */
export function initiative(d6, thrust, pilotRank) {
  return d6 + (Number(thrust) || 0) + (Number(pilotRank) || 0);
}

/**
 * Space movement (book p.84): moving N range bands takes N rounds using N thrust.
 * Returns whether the ship can do it this round and the rounds needed.
 */
export function movementPlan(thrust, bands) {
  const n = Math.abs(Number(bands) || 0);
  return { possible: n === 0 || (Number(thrust) || 0) >= n, rounds: n, thrust: n };
}

/** Move a range band index toward (-) or away (+), clamped. Adjacent ships are dogfighting. */
export function shiftRange(index, delta) {
  const i = Math.max(0, Math.min(SPACE_RANGES.length - 1, (Number(index) || 0) + delta));
  return { index: i, key: SPACE_RANGES[i].key, dogfight: i === 0 };
}

/** Missiles impact after a number of rounds equal to the range band distance (book p.76, p.84). */
export function missileDelay(band) {
  return Math.max(0, rangeIndex(band));
}

/** Morale check is needed once a ship has lost 50% of its hull (book p.84). */
export function needsMorale(hull) {
  return hull.max > 0 && hull.value <= hull.max / 2;
}

/** Engineer overload (book p.85): 8+ gives one step, 10+ two steps, etc.; failure damages the plant by the effect. */
export function overloadResult(total) {
  if (total < 8) return { success: false, steps: 0, damage: 8 - total };
  return { success: true, steps: 1 + Math.floor((total - 8) / 2), damage: 0 };
}

/** Emergency jump calculation: 12+, -1 per round already spent (book p.85). */
export function emergencyJumpTarget(roundsSpent) {
  return Math.max(2, 12 - Math.max(0, Number(roundsSpent) || 0));
}

/** Beam overheat (book p.76): roll 1D + Gunner; overheats on a result <= rounds in use. */
export function beamOverheats(d6, gunnerRank, roundsInUse) {
  return d6 + (Number(gunnerRank) || 0) <= Math.max(1, roundsInUse);
}

/**
 * Crew positions and their space combat actions (book p.70 and p.84-85).
 * `skill` / `specialty` match the skills compendium. `target` is the roll needed.
 */
export const CREW_ACTIONS = {
  captain: [
    { key: "rally", skill: "Leadership", target: 8 },
    { key: "command", skill: "Leadership", target: 8 },
    { key: "tactics", skill: "Tactics", specialty: "Starship", target: 8 }
  ],
  pilot: [
    { key: "evade", skill: "Pilot", specialty: "Starship", target: 8, thrust: true },
    { key: "firingPosition", skill: "", target: 0, thrust: true, auto: true },
    { key: "changeRange", skill: "", target: 0, thrust: true, auto: true }
  ],
  sensors: [
    { key: "jammer", skill: "Comms", target: 0, auto: true },
    { key: "jamMissiles", skill: "Comms", target: 8 },
    { key: "jamEnergy", skill: "Comms", target: 8 },
    { key: "scramble", skill: "Comms", target: 8 }
  ],
  engineer: [
    { key: "overload", skill: "Engineering", target: 8 },
    { key: "divert", skill: "Engineering", target: 8 }
  ],
  astrogator: [
    { key: "emergencyJump", skill: "Astrogation", target: 12 },
    { key: "activateJump", skill: "Astrogation", target: 8 }
  ],
  technician: [
    { key: "changeProgram", skill: "Computers", target: 8 },
    { key: "repairComputer", skill: "Computers", target: 8 }
  ],
  mechanic: [
    { key: "repair", skill: "Mechanic", target: 8 },
    { key: "juryRig", skill: "Mechanic", target: 8 }
  ],
  gunner: [
    { key: "useTurret", skill: "Gunner", target: 8 },
    { key: "useFixed", skill: "Gunner", target: 8 }
  ],
  any: [
    { key: "vaccsuit", skill: "", target: 0, auto: true },
    { key: "depressurize", skill: "", target: 0, auto: true },
    { key: "reload", skill: "", target: 0, auto: true },
    { key: "firstAid", skill: "Medic", target: 8 },
    { key: "assist", skill: "", target: 0, auto: true }
  ]
};

/** Starship damage location, 2D (book p.86). */
export const SHIP_LOCATIONS_2D = {
  2: "internal", 3: "power", 4: "fuel", 5: "mDrive", 6: "weapon", 7: "hull",
  8: "weapon", 9: "mDrive", 10: "jDrive", 11: "power", 12: "internal"
};
/** Small craft damage location, 1D (book p.86). */
export const SMALL_CRAFT_LOCATIONS_1D = { 1: "cockpit", 2: "weapon", 3: "drive", 4: "drive", 5: "hull", 6: "hull" };

export function shipLocation(roll, smallCraft = false) {
  return smallCraft ? SMALL_CRAFT_LOCATIONS_1D[Math.max(1, Math.min(6, roll))] : SHIP_LOCATIONS_2D[Math.max(2, Math.min(12, roll))];
}

/** Internal hit sub-table, D3 (book p.87). */
export const INTERNAL_EFFECTS = { 1: "computer", 2: "crew", 3: "cargo" };

/** Cargo damage on a failed 8+ roll: 10% per point of failure (book p.87). */
export function cargoDamagePercent(roll) {
  return roll >= 8 ? 0 : Math.min(100, (8 - roll) * 10);
}

/** Starship destroyed: explodes on 4+ on 1D, otherwise breaks apart (book p.86). */
export function destroyedShipExplodes(d6) {
  return d6 >= 4;
}

/**
 * Apply damage to a starship or small craft. Pure: it returns the new state and a log, and
 * never rolls dice. Rolls the caller must supply: `internalRolls` (D3 per internal hit).
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

  const hitSystem = (key) => {
    const sys = s[key];
    const before = systemState(sys, s.tonnage);
    if (before.destroyed) { hitHull(1, key); return; }
    sys.damage = (sys.damage || 0) + 1;
    const after = systemState(sys, s.tonnage);
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

/** Morale-relevant summary of a ship's damage: fraction of hull lost. */
export function hullLostFraction(hull) {
  return hull.max > 0 ? (hull.max - hull.value) / hull.max : 0;
}
