/**
 * Alien animals (book p.110-113): creation table with terrain DM, behaviour characteristics,
 * reactions, and traits. Pure.
 */
import { band, clamp } from "./dice.mjs";

/**
 * Terrain DM to the Animal Creation table (p.110). Exotic and Subterranean alternate +/- on each
 * trait roll; the positive DM is used for the size roll.
 */
export const ANIMAL_TERRAIN = {
  open: { label: "Open Country", dm: 0 },
  shrubland: { label: "Shrubland", dm: 1 },
  wetland: { label: "Wetland", dm: 1 },
  aquatic: { label: "Aquatic", dm: 1 },
  forest: { label: "Forest/Jungle", dm: 2 },
  arctic: { label: "Arctic", dm: -3 },
  desert: { label: "Desert", dm: -2 },
  mountain: { label: "Mountainous", dm: -1 },
  exotic: { label: "Exotic", dm: 1, alternate: true },
  subterranean: { label: "Subterranean", dm: 3, alternate: true }
};

/** Alien Animal Creation table (p.110). `behaviour` maps 1D results 1-3, 4-5, 6. */
export const ANIMAL_TABLE = [
  [null, 2, { size: "tiny", sizeLabel: "Tiny", difficulty: 12, hits: 1, damage: "1", flat: 1, behaviour: ["scavenger", "herbivore", "carnivore"], traits: "1", appearing: "D66", example: "Vermin animals" }],
  [3, 3, { size: "small", sizeLabel: "Small", difficulty: 10, hits: 6, damage: "1D", flat: 4, behaviour: ["carnivore", "herbivore", "scavenger"], traits: "2", appearing: "3D+3", example: "Cats and dogs" }],
  [4, 5, { size: "small", sizeLabel: "Small", difficulty: 10, hits: 12, damage: "2D", flat: 6, behaviour: ["carnivore", "herbivore", "scavenger"], traits: "3", appearing: "2D+3", example: "Goats and boars" }],
  [6, 7, { size: "medium", sizeLabel: "Medium", difficulty: 8, hits: 18, damage: "2D+3", flat: 10, behaviour: ["omnivore", "herbivore", "scavenger"], traits: "D3", appearing: "1D+6", example: "Humans and apes" }],
  [8, 9, { size: "large", sizeLabel: "Large", difficulty: 6, hits: 24, damage: "3D", flat: 12, behaviour: ["carnivore", "herbivore", "omnivore"], traits: "D3", appearing: "2D+3", example: "Horses" }],
  [10, 11, { size: "large", sizeLabel: "Large", difficulty: 6, hits: 36, damage: "4D", flat: 14, behaviour: ["omnivore", "carnivore", "herbivore"], traits: "D3", appearing: "1D+3", example: "Hippos" }],
  [12, 12, { size: "large", sizeLabel: "Large", difficulty: 6, hits: 48, damage: "5D", flat: 18, behaviour: ["herbivore", "carnivore", "omnivore"], traits: "D3+1", appearing: "D3+3", example: "Elephants" }],
  [13, null, { size: "veryLarge", sizeLabel: "Very Large", difficulty: 4, hits: 60, damage: "6D", flat: 20, behaviour: ["herbivore", "carnivore", "scavenger"], traits: "D3+1", appearing: "1D", example: "Large dinosaurs, blue whales" }]
];

/**
 * Characteristics table (p.111): flee / ignore / fight on 2D for each behaviour characteristic.
 * Numbers are thresholds: flee if <= flee, fight if >= fight; text rules otherwise.
 */
export const CHARACTERISTICS = {
  herbivore: [
    { name: "Filter", flee: 5, ignore: "n/a if in range", fight: 6 },
    { name: "Filter", flee: 5, ignore: "n/a if in range", fight: 6 },
    { name: "Intermittent", flee: 4, ignore: "5-9", fight: 10 },
    { name: "Intermittent", flee: 4, ignore: "5-9", fight: 10 },
    { name: "Grazer", flee: 6, ignore: "7", fight: 8 },
    { name: "Grazer", flee: 6, ignore: "7", fight: 8 }
  ],
  carnivore: [
    { name: "Chaser", flee: 5, ignore: "See Fight column", fight: null, fightText: "Attacks if it outnumbers target" },
    { name: "Chaser", flee: 5, ignore: "See Fight column", fight: null, fightText: "Attacks if it outnumbers target" },
    { name: "Pouncer", flee: null, fleeText: "Flees if surprised", ignore: "See Fight column", fight: null, fightText: "Attacks if it has surprise" },
    { name: "Trapper", flee: 5, ignore: "See Fight column", fight: null, fightText: "Attacks if it has surprise" },
    { name: "Siren", flee: 4, ignore: "See Fight column", fight: null, fightText: "Attacks if it has surprise" },
    { name: "Killer", flee: 3, ignore: "4-5", fight: 6 }
  ],
  omnivore: [
    { name: "Gatherer", flee: 7, ignore: "8", fight: 9 },
    { name: "Gatherer", flee: 7, ignore: "8", fight: 9 },
    { name: "Gatherer", flee: 7, ignore: "8", fight: 9 },
    { name: "Hunter", flee: 5, ignore: "6-9 if equal or smaller than potential target", fight: null, fightText: "6+ if animal is larger than target, 10+ if not", fightLarger: 6, fightSmaller: 10 },
    { name: "Eater", flee: 4, ignore: "n/a", fight: 5 },
    { name: "Intermittent", flee: 4, ignore: "5-9", fight: null, fightText: "5+ if animal is larger than target, 10+ if not", fightLarger: 5, fightSmaller: 10 }
  ],
  scavenger: [
    { name: "Carrion-Eater", flee: 6, ignore: "7-8", fight: 11 },
    { name: "Filter", flee: 5, ignore: "n/a if in range", fight: null, fightText: "If possible" },
    { name: "Hijacker", flee: 6, ignore: "n/a", fight: 7 },
    { name: "Intimidator", flee: 7, ignore: "n/a", fight: 8 },
    { name: "Carrion-Eater", flee: 6, ignore: "7-10", fight: 11 },
    { name: "Reducer", flee: 7, ignore: "8-9", fight: 10 }
  ]
};

export const DESCRIPTIONS = {
  "Carrion-Eater": "Primarily consumes dead animal flesh, usually after other animals have finished feeding.",
  Chaser: "Pursues prey, usually in packs.",
  Eater: "Eats anything edible, an omnivore without preference.",
  Filter: "Feeds by letting the environment pass through its filter to capture food. Usually slow-moving, in water or the air.",
  Gatherer: "Collects food it finds and consumes it, storing and sharing with similar animals.",
  Grazer: "Spends most of its time grazing on plant matter, in herds or alone.",
  Hunter: "Patiently stalks prey until the ideal time to strike, often in a group.",
  Intermittent: "Alternates between grazing and gathering plant matter, often alone.",
  Intimidator: "Steals food from others violently, often with a pack, using aggression to scare other animals away.",
  Killer: "A predator that hunts regardless of the prey's size and fights for its food without apprehension.",
  Pouncer: "A solitary ambush hunter that waits for prey to pass by and takes it by surprise.",
  Reducer: "Consumes all remaining biological matter from a food source; usually swarms of tiny animals.",
  Hijacker: "Steals hunted or captured food from other animals when it is opportune and safe.",
  Siren: "Attracts prey using sound, smell, colour, or patterns, then traps them.",
  Trapper: "Builds a trap and waits for prey to fall into it or become ensnared."
};

/** Alien Animal Traits (p.113): TRAITS[behaviour][clamp(1D + DM, 0, 9)]. */
export const TRAITS = {
  herbivore: ["Psionic", "Amphibious", "Bioelectric", "Poison", "Alarm", "Camouflaged", "Heightened Sense", "Flyer", "Armour", "Slow"],
  omnivore: ["Dark Sight", "Amphibious", "Incandescent", "Flyer", "Pheromone", "Alarm", "Slow", "Heightened Sense", "Camouflaged", "Echolocation"],
  carnivore: ["Psionic", "UV Sight", "Bioelectric", "Poison", "Fast", "Flyer", "Heightened Sense", "Camouflaged", "Amphibious", "Echolocation"],
  scavenger: ["Heightened Sense", "Amphibious", "Camouflaged", "Alarm", "Flyer", "Pheromone", "Fast", "Dark Sight", "Diseased", "Incandescent"]
};

export const TRAIT_TEXT = {
  Alarm: "Releases a sound, scent, or visual signal that attracts 2D more of the same type.",
  Amphibious: "Lives both in liquid and on land for long durations.",
  Armour: "Has armour equal to 1D.",
  Bioelectric: "Natural electricity attack as powerful as a stun weapon.",
  Camouflaged: "Stealth 2, and +2 DM to contested checks to spot it.",
  "Dark Sight": "Sees in the ultraviolet, infrared, or other spectrums humans cannot.",
  "UV Sight": "Sees in the ultraviolet spectrum.",
  Diseased: "A successful attack deals an ongoing 1D damage every hour until the target makes an 8+ END save.",
  Echolocation: "Sees via sound.",
  Fast: "Moves or attacks a second time each combat round.",
  Flyer: "Floats or flies with wings, air sacks, membranes, or other means.",
  "Heightened Sense": "+1 DM to any roll that helps it survive, including attacking or seeking food.",
  Incandescent: "Creates light in a dark location.",
  Pheromone: "Communicates complex emotional states with pheromones.",
  Poison: "1D continuous damage every round until an 8+ END roll or first aid.",
  Psionic: "Psionically attuned. Uses Shield; predators have Awareness, others Teleport.",
  Slow: "Only moves or attacks once a combat round."
};

/**
 * Behaviour reaction (p.111): roll 2D when it notices the spacers. `larger` tells if the animal
 * is larger than its target; `surprise` and `outnumbers` resolve the text rules.
 */
export function animalReaction(dice, ch, { larger = false, surprise = false, outnumbers = false, surprised = false } = {}) {
  const r = dice.twoD();
  let result;
  if (ch.flee !== null && r <= ch.flee) result = "Flees";
  else if (ch.name === "Pouncer" && surprised) result = "Flees";
  else if (ch.fight !== null && r >= ch.fight) result = "Fights";
  else if (ch.fightLarger) result = r >= (larger ? ch.fightLarger : ch.fightSmaller) ? "Fights" : "Ignores";
  else if (ch.fightText) {
    if (/outnumbers/.test(ch.fightText)) result = outnumbers ? "Fights" : "Ignores";
    else if (/surprise/.test(ch.fightText)) result = surprise ? "Fights" : "Ignores";
    else result = "Fights if possible";
  } else result = "Ignores";
  return { roll: r, result };
}

/**
 * Generate an alien animal (p.110-113).
 * @param {object} o
 * @param {string} o.terrain   key of ANIMAL_TERRAIN
 */
export function generateAnimal(dice, { terrain = "open" } = {}) {
  const t = ANIMAL_TERRAIN[terrain] ?? ANIMAL_TERRAIN.open;
  const sizeRoll = dice.twoD() + t.dm;
  const row = band(ANIMAL_TABLE, sizeRoll);
  const b = dice.d6();
  const behaviour = row.behaviour[b <= 3 ? 0 : b <= 5 ? 1 : 2];
  const chRoll = dice.d6();
  const characteristic = CHARACTERISTICS[behaviour][chRoll - 1];
  const traitCount = Math.max(1, dice.roll(row.traits));
  const traits = [];
  const traitRolls = [];
  for (let i = 0; i < traitCount; i++) {
    const dm = t.alternate ? (i % 2 === 0 ? t.dm : -t.dm) : t.dm;
    const r = dice.d6() + dm;
    const idx = clamp(r, 0, 9);
    traitRolls.push(r);
    const trait = TRAITS[behaviour][idx];
    if (!traits.includes(trait)) traits.push(trait);
  }
  const extras = {};
  if (traits.includes("Armour")) extras.armour = dice.d6();
  if (traits.includes("Psionic")) extras.psi = Math.max(1, dice.d6() + (t.alternate ? t.dm : Math.max(0, t.dm)));
  const appearing = row.appearing;
  const count = Math.max(1, dice.roll(appearing));
  const swarm = row.size === "tiny" && count >= 6;
  const name = `${traits[0] ?? ""} ${characteristic.name} ${behaviour[0].toUpperCase()}${behaviour.slice(1)}`.trim();
  return {
    kind: "animal", terrain, terrainLabel: t.label, sizeRoll, ...row,
    behaviourRoll: b, behaviour, characteristic: characteristic.name, characteristicRow: characteristic,
    description: DESCRIPTIONS[characteristic.name] ?? "",
    traits, traitRolls, traitText: traits.map(x => `${x}: ${TRAIT_TEXT[x] ?? ""}`), ...extras,
    count, swarm, swarmDifficulty: swarm ? 8 : null, name,
    rations: row.hits
  };
}
