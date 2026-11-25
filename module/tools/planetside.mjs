/**
 * Planetside exploration (p.96-107): weather, overland travel, planetside encounters, survival
 * tasks, and food and water. Foundry glue around rules/planetside.mjs and rules/survival.mjs.
 */
import { CHARACTERISTICS } from "../config.mjs";
import { rollTask } from "../play/api.mjs";
import { signed } from "../shared/foundry.mjs";
import * as planetRules from "./rules/planetside.mjs";
import * as survivalRules from "./rules/survival.mjs";
import { ANIMAL_TERRAIN, generateAnimal as rollAnimal } from "./rules/animals.mjs";
import * as cards from "./cards/planetside.mjs";
import { actorOption, dice, planetState, postToolsCard, rankOf, resolveWorld, setPlanetState, socDMOf } from "./context.mjs";
import { advanceClock } from "./clock.mjs";

/** The last weather check (kept in the `toolsPlanetside` setting), or null. */
export function lastWeather() {
  return planetState().weather ?? null;
}

/**
 * Weather check for the next six hours (p.96-97) on the current world. The last check's "next
 * check" DM applies unless `previousDM` is given. Stores the result (GM) and posts a card.
 */
export async function weather({ zone = "temperate", temperature = null, previousDM = null, chat = true } = {}) {
  const w = resolveWorld(undefined);
  const r = planetRules.rollWeather(dice(), {
    temperature: temperature ?? w?.temperature ?? "Temperate",
    zone,
    previousDM: previousDM ?? lastWeather()?.nextDM ?? 0
  });
  await setPlanetState({ weather: r });
  if (chat) await postToolsCard(cards.weatherCard(r), { kind: "weather", data: r });
  return r;
}

/** Overland travel (p.97-98) with the last weather's penalties. Posts a card. */
export async function travel({ terrain = "open", mode = "walk", hours = 6, speedBand = 4, vehicleType = "land", gear = "high", road = "", chat = true } = {}) {
  const r = planetRules.overlandTravel({ terrain, mode, hours, speedBand, vehicleType, gear, road, weather: lastWeather() });
  if (chat) await postToolsCard(cards.travelCard(r), { kind: "travel", data: r });
  return r;
}

/** A planetside encounter check (p.100) in a terrain key of PLANET_LOCATIONS. Posts a card. */
export async function planetsideEncounter({ terrain = "open", force = false, world, actor, chat = true } = {}) {
  const speaker = await actorOption(actor);
  // The temperature dice modification of the last weather check applies to encounter checks (p.96).
  const weatherDM = lastWeather()?.zoneDM ?? 0;
  const r = planetRules.planetsideEncounter(dice(), { terrain, weatherDM, world: resolveWorld(world), force, socDM: socDMOf(speaker) });
  if (chat) await postToolsCard(cards.planetsideCard(r), { kind: "planetside", data: { terrain } });
  return r;
}

/**
 * A survival activity (p.106-107) rolled with rollTask for the actor. `activity` is a key of
 * ACTIVITIES (rules/survival.mjs). A successful hunt rolls the animal; a successful forage rolls
 * the amount. Advances the clock by the activity time when `advance` is true (GM). Returns
 * `{ task, animal }`.
 */
export async function survival(activity, { actor, terrain = "open", inadequate = false, advance = true, skill = null } = {}) {
  const a = survivalRules.ACTIVITIES[activity];
  if (!a) throw new Error(`Unknown survival activity ${activity}`);
  const roller = await actorOption(actor);
  // Weather survival DM (p.97) plus the temperature dice modification (p.96).
  const lw = lastWeather();
  const weatherDM = (lw?.survivalDM ?? 0) + (lw?.zoneDM ?? 0);
  const scores = {};
  for (const k of CHARACTERISTICS) scores[k] = roller?.system?.characteristics?.[k]?.value ?? 7;
  const characteristic = survivalRules.bestCharacteristic(a.characteristics, scores);
  const dm = survivalRules.activityDM(activity, { terrain, weatherDM, inadequate });
  const skillName = skill ?? a.skill ?? survivalRules.SURVIVAL_SKILL;
  const task = await rollTask({ actor: roller, characteristic, skill: skillName, dm, label: `${a.label} (${planetRules.TERRAIN[terrain]?.label ?? terrain})` });
  const extra = [{ label: "Roll", value: `${characteristic.toUpperCase()} + ${skillName} + terrain/weather DM ${signed(dm)}` }];
  let animal = null;
  if (task.success && activity === "hunting") {
    animal = rollAnimal(dice(), { terrain: ANIMAL_TERRAIN[terrain] ? terrain : "open" });
    extra.push({ label: "Animal", value: `${animal.name} (${animal.sizeLabel})` }, { label: "Rations", value: String(animal.hits) });
  }
  if (task.success && activity.startsWith("foraging")) {
    const f = survivalRules.forageAmount(dice(), { rank: rankOf(roller, skillName), terrain });
    extra.push({ label: activity === "foragingWater" ? "Water (days)" : "Food (rations)", value: `${f.amount} (${f.dice} ${f.roll})` });
  }
  await postToolsCard(cards.survivalCard({ label: a.label, activity: a, task, extra }), { kind: "survival", data: animal, actor: roller });
  if (advance && a.hours && game.user.isGM) await advanceClock(a.hours * 3600, { label: a.label, chat: false });
  return { task, animal };
}

/** Food and water needs and costs (p.106) on the world (default: the current world). Posts a card. */
export async function rations({ people = 1, days = 1, world, chat = true } = {}) {
  const w = resolveWorld(world);
  const r = survivalRules.rations({ people, days, pop: w?.pop ?? 6, hydro: w?.hydro ?? 5 });
  if (chat) await postToolsCard(cards.rationsCard(r, { people, days }), { kind: "rations" });
  return r;
}
