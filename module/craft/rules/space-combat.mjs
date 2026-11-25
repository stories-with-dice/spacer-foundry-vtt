/**
 * Space combat (book p.84-87): initiative, morale, crew positions and actions. Pure functions,
 * no Foundry globals. Re-exports the range bands, weapons, and ship damage rules so
 * `game.spacer.craft.rules.spaceCombat` keeps one namespace.
 */
export * from "./ranges.mjs";
export * from "./weapons.mjs";
export * from "./ship-damage.mjs";

/**
 * Initiative: 1D + M-Drive rating + pilot's Pilot rank (book p.84). Called by the space combat helper.
 * @param {number} d6
 * @param {number} thrust     effective thrust
 * @param {number} pilotRank
 * @returns {number}
 */
export function initiative(d6, thrust, pilotRank) {
  return d6 + (Number(thrust) || 0) + (Number(pilotRank) || 0);
}

/**
 * Morale check is needed once a ship has lost 50% of its hull (book p.84).
 * @param {{value: number, max: number}} hull
 * @returns {boolean}
 */
export function needsMorale(hull) {
  return hull.max > 0 && hull.value <= hull.max / 2;
}

/**
 * Engineer overload (book p.85): 8+ gives one step, 10+ two steps, etc.; failure damages the
 * plant by the effect. Called by crewAction.
 * @param {number} total  roll total
 * @returns {{success: boolean, steps: number, damage: number}}
 */
export function overloadResult(total) {
  if (total < 8) return { success: false, steps: 0, damage: 8 - total };
  return { success: true, steps: 1 + Math.floor((total - 8) / 2), damage: 0 };
}

/**
 * Emergency jump calculation: 12+, -1 per round already spent (book p.85). Called by crewAction.
 * @param {number} roundsSpent
 * @returns {number} target number
 */
export function emergencyJumpTarget(roundsSpent) {
  return Math.max(2, 12 - Math.max(0, Number(roundsSpent) || 0));
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

/** The skill a pilot rolls to evade (book p.84-85): Pilot (Starship). */
export const EVADE_SKILL = { skill: "Pilot", specialty: "Starship" };
