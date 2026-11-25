/**
 * Planetside exploration (book p.96-104): weather, overland travel, planetside encounters,
 * location encounters, habitat conditions, and environment encounters. Pure.
 */
import { band, clamp } from "../../shared/dice.mjs";
import { rollDemeanour, rollNpcType } from "./npc.mjs";
import { settlementPopDM } from "./starport.mjs";

/* ---------------------------------------------------------------- weather (p.96-97) */

export const ZONES = {
  tropical: "Above Average (Tropical)",
  temperate: "Average (Temperate)",
  polar: "Below Average (Polar)",
  iceWorld: "Ice World",
  hotWorld: "Hot World"
};

/** Temperature Dice Modification table (p.96). null = not possible ("X"). */
export const TEMP_DM = {
  Frozen: { tropical: -1, temperate: -2, polar: -4, iceWorld: -6, hotWorld: null },
  Cold: { tropical: 0, temperate: -1, polar: -2, iceWorld: -4, hotWorld: null },
  Temperate: { tropical: 1, temperate: 0, polar: -1, iceWorld: -2, hotWorld: 2 },
  Hot: { tropical: 2, temperate: 1, polar: 0, iceWorld: null, hotWorld: 4 },
  Boiling: { tropical: 4, temperate: 2, polar: 1, iceWorld: null, hotWorld: 6 }
};

/** Weather range of each temperature type (p.96): rolls outside it are rerolled. */
export const WEATHER_RANGE = {
  Frozen: [1, 5], Cold: [2, 8], Temperate: [1, 13], Hot: [9, 13], Boiling: [13, 99]
};

/** Weather table (p.97). */
export const WEATHER = [
  [null, 0, { type: "Ice World", subtypes: null, text: "Weather impossible", next: -4, survival: -6, vehicle: -3, harm: "4D", walk: -3, speed: -3 }],
  [1, 1, { type: "Extreme Cold Weather", subtypes: ["Extreme wind", "Extreme storm", "Deep freeze"], next: -3, survival: -3, vehicle: -3, harm: "3D", walk: -3, speed: -3 }],
  [2, 3, { type: "Significant Cold Weather", subtypes: ["Cold wave", "High wind", "Blizzard"], next: -2, survival: -2, vehicle: -2, harm: "2D", walk: -2, speed: -2 }],
  [4, 5, { type: "Cool Weather", subtypes: ["Cold snap", "Ice", "Snow"], next: -1, survival: -1, vehicle: -1, harm: "1D", walk: -1, speed: -1 }],
  [6, 8, { type: "Average", subtypes6: ["Clear", "Overcast", "Wind", "Fog", "Flurries", "Mist"], next: 0, survival: 0, vehicle: 0, harm: "D3", walk: 0, speed: 0 }],
  [9, 10, { type: "Warm Weather", subtypes: ["Hot", "Humid", "Precipitation"], next: 1, survival: 1, vehicle: -1, harm: "1D", walk: -1, speed: -1 }],
  [11, 12, { type: "Hot Weather", subtypes: ["Heat wave", "High wind", "Heavy precipitation"], next: 2, survival: 2, vehicle: -2, harm: "2D", walk: -2, speed: -2 }],
  [13, 13, { type: "Extreme Heat Weather", subtypes: ["Extreme wind", "Extreme storm", "Oppressive humidity"], next: 3, survival: 3, vehicle: -3, harm: "3D", walk: -3, speed: -3 }],
  [14, null, { type: "Inferno World", subtypes: null, text: "Weather extreme and deadly", next: 4, survival: -6, vehicle: -3, harm: "4D", walk: -4, speed: -3 }]
];

/** 1-3 / 4-5 / 6 subtype pick, or a straight 1D for Average weather. */
function weatherSubtype(dice, row) {
  const r = dice.d6();
  if (row.subtypes6) return row.subtypes6[r - 1];
  if (!row.subtypes) return row.text;
  return row.subtypes[r <= 3 ? 0 : r <= 5 ? 1 : 2];
}

/**
 * Weather check for the next six hours (p.96-97). `temperature` is the world's temperature type,
 * `zone` a key of ZONES, `previousDM` the "effect on next weather check" of the last result.
 * Rolls outside the type's range are rerolled (up to 20 times, then clamped).
 */
export function rollWeather(dice, { temperature = "Temperate", zone = "temperate", previousDM = 0 } = {}) {
  const tdm = TEMP_DM[temperature]?.[zone];
  const zoneDM = tdm === null || tdm === undefined ? 0 : tdm;
  const [lo, hi] = WEATHER_RANGE[temperature] ?? [1, 13];
  let total;
  let rerolls = 0;
  for (;;) {
    total = dice.twoD() + zoneDM + previousDM;
    if (total >= lo && total <= hi) break;
    if (++rerolls >= 20) { total = clamp(total, lo, hi); break; }
  }
  const row = band(WEATHER, total);
  const sub = weatherSubtype(dice, row);
  return {
    kind: "weather", temperature, zone, zoneLabel: ZONES[zone], zoneDM, previousDM, invalidZone: tdm === null, total, rerolls,
    type: row.type, detail: sub, nextDM: row.next, survivalDM: row.survival, vehicleDM: row.vehicle, harm: row.harm,
    walkPenalty: row.walk, speedPenalty: row.speed
  };
}

/* ---------------------------------------------------------------- overland travel (p.98) */

/** Terrain Types table (p.98). `survival` is the DM to survival and encounter checks. */
export const TERRAIN = {
  open: { label: "Open Country", walk: 5, survival: 0, vehicle: { land: 0, hover: 0, water: null } },
  shrubland: { label: "Shrubland", walk: 4, survival: 1, vehicle: { land: -1, hover: 0, water: null } },
  wetland: { label: "Wetland", walk: 3, survival: 1, vehicle: { land: -2, hover: -1, water: -3 } },
  forest: { label: "Forest/Jungle", walk: 3, survival: 2, vehicle: { land: -3, hover: -2, water: null } },
  arctic: { label: "Arctic", walk: 4, survival: -3, vehicle: { land: -3, hover: -1, water: null } },
  desert: { label: "Desert", walk: 4, survival: -2, vehicle: { land: -3, hover: -1, water: null } },
  mountain: { label: "Mountainous", walk: 2, survival: -1, vehicle: { land: -3, hover: -4, water: null } },
  aquatic: { label: "Aquatic", walk: 0, swim: 3, survival: -1, survivalBad: -3, vehicle: { land: null, hover: -3, water: 0 } },
  vacuum: { label: "Vacuum", walk: 3, survival: -2, survivalBad: -6, vehicle: { land: -2, hover: -2, water: null } }
};

/** Vehicle gears (p.98). */
export const GEARS = {
  low: { label: "Low Gear", band: -3, dm: 2, failure: "Fender bender, cosmetic damage" },
  mid: { label: "Mid Gear", band: -2, dm: 1, failure: "Minor crash, hull damage" },
  high: { label: "High Gear", band: -1, dm: 0, failure: "Crash, critical damage" },
  top: { label: "Top Gear", band: 0, dm: -2, failure: "Severe crash, inoperable until repaired" }
};

/**
 * Overland travel (p.97-98). Walking: terrain km/h minus the weather penalty. Vehicles: speed band
 * minus the gear, terrain, and weather penalties; roads lower the Drive DM by 1 (paved 2).
 */
export function overlandTravel({ terrain = "open", weather = null, mode = "walk", hours = 6, speedBand = 4, vehicleType = "land", gear = "high", road = "" } = {}) {
  const t = TERRAIN[terrain] ?? TERRAIN.open;
  if (mode === "walk" || mode === "swim") {
    const base = mode === "swim" ? (t.swim ?? 0) : t.walk;
    const kmh = Math.max(0, base + (weather?.walkPenalty ?? 0));
    return { mode, terrain: t.label, kmh, hours, km: kmh * hours };
  }
  const g = GEARS[gear] ?? GEARS.high;
  const terrainPenalty = t.vehicle[vehicleType];
  if (terrainPenalty === null || terrainPenalty === undefined) return { mode, terrain: t.label, impossible: true, text: `${vehicleType} vehicles cannot cross ${t.label}.` };
  const effective = Math.max(0, speedBand + g.band + terrainPenalty + (weather?.speedPenalty ?? 0));
  const roadDM = road === "paved" ? 2 : road === "road" ? 1 : 0;
  return {
    mode, terrain: t.label, gear: g.label, speedBand: effective, stopped: effective === 0,
    driveDM: g.dm + roadDM + (weather?.vehicleDM ?? 0), failure: g.failure,
    crashDamage: `${effective}D per passenger`
  };
}

/* ---------------------------------------------------------------- planetside encounters (p.100-101) */

/** Planetside encounter frequency (p.100). */
export const PLANET_LOCATIONS = {
  forest: { label: "Forest/Jungle", frequency: "6 hours", dm: 3, table: "D66" },
  wetland: { label: "Wetland", frequency: "12 hours", dm: 2, table: "D66" },
  shrubland: { label: "Shrubland/Mountain", frequency: "1 day", dm: 1, table: "D66" },
  mountain: { label: "Shrubland/Mountain", frequency: "1 day", dm: 1, table: "D66" },
  open: { label: "Open Country", frequency: "1 day", dm: 0, table: "D66" },
  aquatic: { label: "Aquatic", frequency: "1 day", dm: -1, table: "D36" },
  arctic: { label: "Polar/Desert", frequency: "2 days", dm: -2, table: "D36" },
  desert: { label: "Polar/Desert", frequency: "2 days", dm: -2, table: "D36" },
  vacuum: { label: "Vacuum", frequency: "3 days", dm: -3, table: "D16" }
};

export const PLANET_TYPES = [
  [null, 2, { type: "npc", label: "NPC Encounter", distance: "Close (5m or less)" }],
  [3, 5, { type: "environment", label: "Environment", distance: "Short (5m-10m)" }],
  [6, 9, { type: "location", label: "Location Encounter", distance: "Medium (11m-50m)" }],
  [10, 11, { type: "environment", label: "Environment", distance: "Long (51m-250m)" }],
  [12, null, { type: "npc", label: "NPC Encounter", distance: "Very Long (251m-500m)" }]
];

/** Planetside NPC Encounter table (p.100): [2D - 2] for the three columns. */
export const PLANET_NPC = {
  animal: ["1D animal remains", "Scavenging animal", "Hunting animal", "Patrolling animal", "Carnivores", "Herbivores", "Omnivores", "Scavengers", "x2 animals", "x3 animals", "x4 animals"],
  human: ["1D NPC remains", "Lost NPC", "Hermit NPC", "D3 hunting/scavenging NPCs", "D3 exploring/travelling NPCs", "1D NPCs homesteading", "1D NPC sightseeing", "1D NPC transporting", "2D NPCs working", "3D NPCs (any)", "4D NPCs building/installing"],
  mixed: ["Animal/animal remains", "Animal/animal, hunting", "Animal/animal, docile", "Animal/animal, coexisting", "Human/animal, hunting", "Human/animal, domesticated", "Human/human, friendly interaction", "Human/human, neutral interaction", "Human/human, aggressive interaction", "Human/human, fighting", "Human/human remains"]
};

/** Planetside Location Encounters table (p.101), D66. */
export const LOCATIONS = {
  11: "Scenic landscape feature", 12: "Dangerous landscape feature", 13: "Vehicle/robot remains", 14: "Abandoned ship", 15: "Escape pod", 16: "Crashed ship",
  21: "Survival shelter", 22: "Cave", 23: "Shelter made of recycled and scavenged material", 24: "Destroyed habitat/encampment", 25: "Animal pack", 26: "Animal den",
  31: "Graveyard", 32: "Scrapyard", 33: "Campsite", 34: "Grounded spaceship", 35: "D3 grounded spaceships", 36: "E-type starport",
  41: "Manufacturing base", 42: "Construction site", 43: "Refinery", 44: "Mine", 45: "Industrial station", 46: "Communication station",
  51: "Greenhouse", 52: "Warehouse or cargo containers", 53: "Research base", 54: "Waystation", 55: "Outpost", 56: "Unique settlement",
  61: "Personal habitat, 1D people", 62: "Farms, 1D x 10 people", 63: "Settlement, 1D x 100 population", 64: "Settlement, 1D x 1000 population",
  65: "Settlement, 1D x 10,000 population", 66: "Settlement, 1D x 100,000 population, with a starport"
};
const LOCATION_PEOPLE = { 61: ["1D", 1], 62: ["1D", 10], 63: ["1D", 100], 64: ["1D", 1000], 65: ["1D", 10000], 66: ["1D", 100000] };
export const OUTPOSTS = ["Military", "Scout/ranger", "Communications", "Communications", "Courier", "Science"];

/** Habitat Condition (p.101), 2D in each column + encounter DM. */
export const HABITAT_OCCUPIED = [[null, 1, "Abandoned and destroyed"], [2, 3, "Abandoned"], [4, 4, "Abandoned but makeshift"], [5, 9, "In use"], [10, 10, "Occupied but under construction"], [11, 12, "Occupied"], [13, null, "Occupied and fortified"]];
export const HABITAT_CONDITION = [[null, 1, "Destroyed/collapsed"], [2, 3, "Falling apart/overgrown"], [4, 4, "Makeshift"], [5, 9, "Showing age/weathered"], [10, 10, "Under construction/being repaired"], [11, 12, "Well-maintained"], [13, null, "Fortified"]];

/**
 * Roll a location encounter (p.101). `dm` is the terrain encounter DM. The population DM shifts
 * the tens die; the book does not give its values on p.100, so the Settlement Encounter
 * population DMs (p.102) are used.
 */
export function rollLocation(dice, { dm = 0, table = "D66", pop = null } = {}) {
  const popDM = pop === null ? 0 : settlementPopDM(pop);
  let code;
  if (table === "D16") code = dice.d16();
  else if (table === "D36") code = dice.d36(popDM);
  else code = dice.d66(popDM);
  const out = { code, text: LOCATIONS[code], popDM };
  if (code === 25) out.text += `: ${["Herbivore", "Herbivore", "Herbivore", "Omnivore", "Omnivore", "Carnivore"][dice.d6() - 1]}`;
  if (code === 26) out.text += `: ${["Herbivore", "Omnivore", "Carnivore"][dice.d3() - 1]}`;
  if (code === 35) out.text = `${dice.d3()} grounded spaceships`;
  if (code === 55) out.text += `: ${OUTPOSTS[dice.d6() - 1]}`;
  if (LOCATION_PEOPLE[code]) { const [d, m] = LOCATION_PEOPLE[code]; out.people = dice.roll(d) * m; }
  if ([13, 14, 34, 35].includes(code)) {
    const r = dice.d6();
    out.condition = r <= 3 ? "Ruined" : r <= 5 ? "Damaged/rusted but repairable" : "Operable";
  }
  if (code >= 11 && code <= 26) {
    const r = dice.twoD() + dm;
    out.inUse = { roll: r, target: 8, inUse: r >= 8 };
  }
  if (code >= 41 && code <= 46) {
    const r = dice.twoD() + dm;
    out.labor = { roll: r, state: r <= 2 ? "Abandoned" : r <= 7 ? "Skeleton crew or a single worker" : "In use" };
  }
  if (code >= 51 && code <= 62) {
    out.habitat = { occupied: band(HABITAT_OCCUPIED, dice.twoD() + dm), condition: band(HABITAT_CONDITION, dice.twoD() + dm) };
  }
  if (code >= 61) out.lawNote = "Same law level as the planet.";
  return out;
}

/** Planetside Environment table (p.104), D66. */
export const ENVIRONMENT = {
  11: "Radiation storm", 12: "Temperature spike/drop", 13: "Extreme weather imminent", 14: "Fallen space junk", 15: "Meteor impact site", 16: "Small meteorite impacts 2Dx10 km away",
  21: "Dust/debris storm on the horizon", 22: "Massive crater", 23: "Rusted and ruined vehicle", 24: "Rusted and ruined starship", 25: "Temporary shelter remains", 26: "Overgrown location",
  31: "Roadway, dirt", 32: "Roadway, paved", 33: "Roadway, elevated", 34: "Litter and trash", 35: "Wasteland", 36: "Starship flying in the distance",
  41: "Cave opening", 42: "Abandoned mining/drilling machines", 43: "Animal herd/flock/school in the distance", 44: "Light/smoke in the distance", 45: "Strange mechanical sound in the distance", 46: "Strange animal sound in the distance",
  51: "Unique landscape formation", 52: "Scenic landscape", 53: "Significant overgrowth/bloom", 54: "Body of liquid (lake)", 55: "Flowing liquid (river)", 56: "Oasis",
  61: "Cairns", 62: "Stone spires", 63: "Fissures/chasm", 64: "Cave", 65: "Monolith", 66: "Mysterious ruins"
};

/** Unique Atmosphere Planetside Environment table (p.104), 1D for atmospheres A-F. */
export const UNIQUE_ENVIRONMENT = {
  10: ["Massive spores create a type of fog", "Remains of animal/NPC with plants/fungi growing out of it", "Massive crystalline columns", "Floating islands of tangled spores or moss", "Hazardous plant/fungi encounter", "Camouflaged animal encounter"],
  11: ["Hot acid geysers", "Acidic lakes", "Rocky columns", "Corrosive rain storm", "Silicon deposits", "Silicon-based plant or fungi"],
  12: ["Lava flows", "Jagged and sharp landscape feature; will destroy vaccsuit", "Volcano", "Ash storm", "Basalt field", "Sulfur fog"],
  13: ["Severe rain", "Vortex storm", "Poisonous gas", "Extreme winds", "Fist-sized hail storm", "Radioactive rift"],
  14: ["Atmosphere pockets in low areas like valleys or craters", "Subterranean opening", "Drifting moss clusters that pile up in low areas or hillsides", "Moving ice boulders", "Animals with air sacs wandering", "Animals with hard carapaces for vacuum protection in highland areas"],
  15: ["Floating plants", "Mobile slime/goo creatures", "Rainbow fog", "Floating landmasses", "Glowing plants and animals", "Non-newtonian fluid river or pond"]
};

/**
 * Environment encounter (p.104). Atmosphere 0 uses 11-16, 1-3 uses 21-26, 4-9 the full D66.
 * Atmospheres A-F (10-15) replace results 11-16 with their unique column; other results use
 * the main table.
 */
export function rollEnvironment(dice, { atmosphere = 6 } = {}) {
  let code;
  if (atmosphere === 0) code = 10 + dice.d6();
  else if (atmosphere <= 3) code = 20 + dice.d6();
  else code = dice.d66();
  let text = ENVIRONMENT[code];
  let unique = false;
  if (atmosphere >= 10 && code <= 16) {
    unique = true;
    text = UNIQUE_ENVIRONMENT[Math.min(15, atmosphere)][code - 11];
    if (atmosphere === 12 && code === 13) { const r = dice.d6(); text += `: ${r === 1 ? "dormant" : r <= 5 ? "active" : "erupting"}`; }
  }
  if (code === 16 && !unique) text = `Small meteorite impacts ${dice.twoD() * 10} km away`;
  const out = { code, text, unique };
  if (code >= 31 && code <= 33 && !unique) out.note = "Roadways continue, if followed, until they lead to a Planetside Location Encounter.";
  return out;
}

/** Planetside NPC encounter (p.100): 2D, the column is picked with a D3 (the book does not say how). */
export function rollPlanetNpc(dice, { column = null, world = null, socDM = 0 } = {}) {
  const col = column ?? ["animal", "human", "mixed"][dice.d3() - 1];
  const r = dice.twoD();
  const text = PLANET_NPC[col][r - 2];
  const out = { column: col, roll: r, text };
  const m = text.match(/^(\d?D3?|D3) /);
  if (m && col === "human") out.count = dice.roll(m[1]);
  if (col !== "animal") { out.npcType = rollNpcType(dice, world); out.reaction = rollDemeanour(dice, socDM); }
  if (col === "animal") { const x = text.match(/^x(\d)/); if (x) out.multiplier = Number(x[1]); }
  return out;
}

/**
 * Planetside encounter check and result (p.100). `weatherDM` is added to the check and type
 * rolls. `force` skips the check.
 */
export function planetsideEncounter(dice, { terrain = "open", weatherDM = 0, world = null, force = false, socDM = 0 } = {}) {
  const loc = PLANET_LOCATIONS[terrain] ?? PLANET_LOCATIONS.open;
  const natural = dice.d6();
  const check = natural + loc.dm + weatherDM;
  const encounter = force || check >= 6;
  const out = { kind: "planetside", terrain, location: loc, check: { natural, total: check, dm: loc.dm + weatherDM }, encounter, forced: force };
  if (!encounter) return out;
  const typeRoll = dice.twoD() + loc.dm + weatherDM;
  const type = band(PLANET_TYPES, typeRoll);
  out.typeRoll = typeRoll;
  out.type = type;
  if (type.type === "npc") out.npc = rollPlanetNpc(dice, { world, socDM });
  else if (type.type === "location") out.site = rollLocation(dice, { dm: loc.dm, table: loc.table, pop: world?.pop ?? null });
  else out.environment = rollEnvironment(dice, { atmosphere: world?.atmosphere ?? 6 });
  return out;
}
