/**
 * Survival (book p.106-107): shelter, food and water, hunting, foraging, scavenging, crafting,
 * and know direction. Pure: the Foundry side rolls the task with rollTask.
 *
 * The book uses a "Survival" rank, but the skill list (p.28-29) has no Survival skill. The tasks
 * use the skill name "Survival"; rollTask treats a missing skill as untrained (-3).
 */
import { TERRAIN } from "./planetside.mjs";
import { characteristicDM } from "../../config.mjs";

export const SURVIVAL_SKILL = "Survival";

/** Activities (p.106-107). `characteristics` are the two options; the better one is used. */
export const ACTIVITIES = {
  shelter: { label: "Build shelter", characteristics: ["end", "str"], hours: 6, weather: false, text: "Shelter prevents exposure damage from the weather table." },
  hunting: { label: "Hunting", characteristics: ["end", "dex"], hours: 6, weather: false, text: "Produces 1 ration per hit of the animal hunted." },
  foragingFood: { label: "Foraging (food)", characteristics: ["int", "edu"], hours: 6, weather: false, text: "Forages 1D per Survival rank, modified by the terrain DM. Make an encounter check." },
  foragingWater: { label: "Foraging (water)", characteristics: ["int", "edu"], hours: 6, weather: false, text: "Forages 1D per Survival rank, modified by the terrain DM. Make an encounter check." },
  scavenging: { label: "Scavenging", characteristics: ["end", "int"], hours: 6, weather: false, text: "State the object or material and its purpose first. Make an encounter check." },
  crafting: { label: "Crafting", characteristics: ["int", "edu"], hours: 6, weather: false, skill: "Crafting", text: "Open-ended; the referee sets characteristic, skill, and DMs. Takes 6 hours." },
  direction: { label: "Know direction", characteristics: ["edu", "int"], hours: 0, weather: true, text: "Success prevents becoming lost." }
};

/** Pick the better characteristic of the options for an actor's scores ({str: 7, ...}). */
export function bestCharacteristic(options, scores = {}) {
  let best = options[0];
  for (const k of options) if (characteristicDM(scores[k] ?? 7) > characteristicDM(scores[best] ?? 7)) best = k;
  return best;
}

/** Terrain DM for survival checks (p.98). `inadequate` uses the starred value (aquatic, vacuum). */
export function terrainSurvivalDM(terrain, { inadequate = false } = {}) {
  const t = TERRAIN[terrain] ?? TERRAIN.open;
  return inadequate && t.survivalBad !== undefined ? t.survivalBad : t.survival;
}

/** Total DM of a survival activity: terrain plus the weather survival DM (p.97 applies it to all survival tasks). */
export function activityDM(activity, { terrain = "open", weatherDM = 0, inadequate = false } = {}) {
  return terrainSurvivalDM(terrain, { inadequate }) + weatherDM;
}

/** Amount foraged (p.106): 1D per Survival rank (at least one die), plus the terrain DM. */
export function forageAmount(dice, { rank = 0, terrain = "open" } = {}) {
  const n = Math.max(1, rank);
  const roll = dice.nd(n, 6);
  return { dice: `${n}D`, roll, amount: Math.max(0, roll + terrainSurvivalDM(terrain)) };
}

/**
 * Food and water needs and costs (p.106). Provisions cost x2 per population step above A;
 * water costs x2 per hydrographics step below 3.
 */
export function rations({ people = 1, days = 1, pop = 6, hydro = 5 } = {}) {
  const foodCost = 5 * 2 ** Math.max(0, pop - 10);
  const waterCost = 5 * 2 ** Math.max(0, 3 - hydro);
  const n = people * days;
  return {
    foodKg: n * 0.5, waterL: n * 2,
    foodCost, waterCost, total: n * (foodCost + waterCost),
    starvation: "After 2 days without rations, -1 END per extra day."
  };
}
