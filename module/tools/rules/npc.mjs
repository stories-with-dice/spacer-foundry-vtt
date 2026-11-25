/**
 * Non-player characters (book p.56-59): demeanour, the NPC table, information and rumours,
 * and the random NPC encounter table. Pure.
 */
import { band, clamp } from "./dice.mjs";
import { CHARACTERISTICS } from "../../config.mjs";

/** NPC Demeanour (p.56), 2D. */
export const DEMEANOUR = [
  [null, 2, { label: "Hostile", dm: -2 }],
  [3, 5, { label: "Rude", dm: -1 }],
  [6, 8, { label: "Indifferent", dm: 0 }],
  [9, 11, { label: "Intrigued", dm: 1 }],
  [12, null, { label: "Agreeable", dm: 2 }]
];

/** Roll the NPC demeanour. `dm` is usually the spacer's SOC DM (p.58, p.60). */
export function rollDemeanour(dice, dm = 0) {
  const natural = dice.twoD();
  const total = natural + dm;
  return { roll: total, natural, dmApplied: dm, ...band(DEMEANOUR, total) };
}

/** NPC table (p.56), d66 with the DM on the tens die (tens 0-9). */
export const NPC_TABLE = {
  1: "Castaway", 2: "Survivalist", 3: "Prospector", 4: "Scavenger", 5: "Surveyor", 6: "Hermit",
  11: "Homesteader", 12: "Hunter", 13: "Researcher", 14: "Wastelander", 15: "Rancher", 16: "Scout",
  21: "Space Pirate", 22: "Drifter", 23: "Pilgrim", 24: "Travelling Doctor", 25: "Outlaw", 26: "Fugitive",
  31: "Smuggler", 32: "Retired Spacer", 33: "Rogue", 34: "Courier", 35: "Farmer", 36: "Labourer",
  41: "Reporter", 42: "Cleric", 43: "Financier", 44: "Creative Professional", 45: "Blue-Collar Professional", 46: "Broker",
  51: "Academic", 52: "Shopkeeper", 53: "Engineer", 54: "White-Collar Professional", 55: "Speculating Merchant", 56: "Off-Duty Military Officer",
  61: "Bureaucrat", 62: "Dilettante", 63: "Emigre", 64: "Wanderer", 65: "White-Collar Criminal", 66: "Medical Professional",
  71: "Noble", 72: "Administrator", 73: "Police", 74: "Business Person", 75: "Celebrity", 76: "Merchant Prince",
  81: "Oligarch", 82: "Corporate Agent", 83: "Protester", 84: "Resistance Member", 85: "Politician", 86: "Mercenary",
  91: "Military Officer", 92: "Security Officer", 93: "State Agent", 94: "“Enemy of the State”", 95: "Defector", 96: "Refugee"
};

/** Quality of life by tens digit of the NPC table (p.56). */
export const NPC_QUALITY = ["Unsettled", "Frontier", "Scraping by", "Developing", "Established", "Prosperous", "Peak", "Decline", "Dystopian", "Oppressive"];

/** Population DM to the NPC table (p.56). */
export function npcPopulationDM(pop) {
  if (pop <= 2) return -3;
  if (pop <= 4) return -2;
  if (pop <= 6) return -1;
  if (pop <= 8) return 0;
  return 1;
}

/** Government DM to the NPC table (p.56). Gov 0 -2; 1,3,5 -1; 2,4,8 +0; 6,7,9 +1; A-C +2; D-F +3. */
export function npcGovernmentDM(gov) {
  if (gov === 0) return -2;
  if ([1, 3, 5].includes(gov)) return -1;
  if ([2, 4, 8].includes(gov)) return 0;
  if ([6, 7, 9].includes(gov)) return 1;
  if (gov >= 10 && gov <= 12) return 2;
  return 3;
}

/**
 * Roll on the NPC table. `world` ({pop, gov}) gives the DMs. Population 0 uses the Population 1-2
 * DM (the book lists no row for 0).
 */
export function rollNpcType(dice, world = null) {
  const dm = world ? npcPopulationDM(world.pop ?? 7) + npcGovernmentDM(world.gov ?? 4) : 0;
  const code = dice.d66(dm, { minTens: 0, maxTens: 9 });
  return { code, dm, type: NPC_TABLE[code], quality: NPC_QUALITY[Math.floor(code / 10)] };
}

/** NPC weapon when the referee wants one (p.56): 1-3 unarmed, 4-5 blade, 6 gun. */
export function rollNpcWeapon(dice) {
  const r = dice.d6();
  return r <= 3 ? "Unarmed" : r <= 5 ? "Blade" : "Gun";
}

/** Characteristics for a generated NPC: 2D each (as for spacers, p.16). `hits` fixes STR, DEX, END (p.58). */
export function rollCharacteristics(dice, { hits = null } = {}) {
  const out = {};
  for (const k of CHARACTERISTICS) {
    out[k] = hits !== null && ["str", "dex", "end"].includes(k) ? hits : dice.twoD();
  }
  return out;
}

/** Information and Rumour table (p.57). */
export const INFORMATION = [
  { type: "Adventure Lead", die: "1D", details: ["Person", "Place", "Thing", "Object", "Background info", "Secret"], note: "Leads to potential side jobs or personal interest pursuits." },
  { type: "Narrative Information", die: "1D", details: ["Major fact", "Minor fact", "Notable fact", "Unnecessary fact", "Valuable information", "Unexpected connection"], note: "Assists or advances the spacer's current narrative." },
  { type: "Job Information", die: "D3", details: ["Fact about patron", "Fact about a place", "Fact about a job detail"], note: "Assists the spacer with their current job." },
  { type: "Job Lead", die: "1D", details: ["Patron suggestion", "Job rumour", "Criminal patron suggestion", "Criminal job rumour", "Secret patron suggestion", "Secretive job rumour"], note: "Can lead to a potential client or a rumoured job." },
  { type: "Rumour", die: "1D", details: ["NPC connection", "Faction connection", "Location connection", "Narrative clue", "Adventure clue", "Job clue"], note: "Needs more roleplaying to find the source and the truth." },
  { type: "Local Gossip", die: "1D", details: ["Illicit information on an NPC", "Illicit info on a faction", "Illicit info on a location", "Dangerous information", "Conspiracy theory", "Unbelievable connection"], note: "Open-ended local flavour." }
];

/**
 * Information and rumours procedure (p.57): reaction, D3 pieces of information, a type for each.
 * `socDM` applies to the reaction.
 */
export function rollInformation(dice, { socDM = 0 } = {}) {
  const reaction = rollDemeanour(dice, socDM);
  const count = dice.d3();
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const t = dice.d6();
    const row = INFORMATION[t - 1];
    const d = dice.roll(row.die);
    pieces.push({ roll: t, type: row.type, detailRoll: d, detail: row.details[d - 1], note: row.note });
  }
  return { reaction, count, pieces };
}

/**
 * Random NPC table (p.59). `avoid` is the target number, `hits` the STR/DEX/END score.
 * An asterisk in the book (vehicle nearby) is `vehicle: true`.
 */
export const RANDOM_NPC = {
  11: { who: "Drifter", number: "1D", avoid: 6, weapon: "Improvised", attack: -1, hits: 6, armour: "" },
  12: { who: "Worker", number: "1D", avoid: 6, weapon: "Club", attack: -1, hits: 6, armour: "" },
  13: { who: "Worker", number: "2D", avoid: 8, weapon: "Improvised", attack: -1, hits: 6, armour: "" },
  14: { who: "Rowdy Crowd", number: "3D", avoid: 8, weapon: "Improvised", attack: 0, hits: 5, armour: "Jack" },
  15: { who: "Criminal", number: "2D", avoid: 8, weapon: "Club", attack: 1, hits: 7, armour: "Jack" },
  16: { who: "Criminal", number: "3D", avoid: 10, weapon: "Daggers", attack: 1, hits: 7, armour: "Jack" },
  21: { who: "Soldier", number: "2D", avoid: 6, weapon: "Slug Thrower", attack: 2, hits: 7, armour: "Cloth" },
  22: { who: "Soldier", vehicle: true, number: "3D", avoid: 8, weapon: "Rifle", attack: 2, hits: 7, armour: "Mesh" },
  23: { who: "Soldier", vehicle: true, number: "4D", avoid: 10, weapon: "Carbine", attack: 2, hits: 7, armour: "Mesh" },
  24: { who: "Naval Soldier on Shore Leave", vehicle: true, number: "2D", avoid: 6, weapon: "Carbine", attack: 2, hits: 7, armour: "Cloth" },
  25: { who: "Marines", vehicle: true, number: "2D", avoid: 8, weapon: "Blade and Body Pistol", attack: 2, hits: 7, armour: "Mesh" },
  26: { who: "Mercenary Group", vehicle: true, number: "2D", avoid: 8, weapon: "Autorifle", attack: 1, hits: 8, armour: "Jack" },
  31: { who: "Spacers", number: "2D", avoid: 6, weapon: "Blade and Shotgun", attack: 1, hits: 6, armour: "Mesh" },
  32: { who: "Noble with Retinue", number: "2D", avoid: 6, weapon: "Blade", attack: 0, hits: 7, armour: "" },
  33: { who: "Group of Drunks", number: "2D", avoid: 10, weapon: "Improvised", attack: -2, hits: 5, armour: "" },
  34: { who: "Rude Tourists", number: "1D", avoid: 8, weapon: "", attack: -2, hits: 5, armour: "" },
  35: { who: "Annoying Tourists", vehicle: true, number: "2D", avoid: 10, weapon: "", attack: -2, hits: 5, armour: "" },
  36: { who: "Grumpy Locals", vehicle: true, number: "2D", avoid: 8, weapon: "Improvised", attack: -1, hits: 5, armour: "" },
  41: { who: "Wanted Criminals", number: "1D", avoid: 6, weapon: "Body Pistol", attack: 1, hits: 6, armour: "" },
  42: { who: "Pickpocket crew", number: "1D", avoid: 12, weapon: "Dagger", attack: 0, hits: 5, armour: "" },
  43: { who: "Docked Pirates", number: "2D", avoid: 6, weapon: "Blade and Shotgun", attack: 1, hits: 6, armour: "Mesh" },
  44: { who: "Street Gang", number: "3D", avoid: 8, weapon: "Blade and Club", attack: 1, hits: 6, armour: "" },
  45: { who: "Criminal with Entourage", vehicle: true, number: "3D", avoid: 6, weapon: "Carbine and Blade", attack: 1, hits: 6, armour: "Cloth" },
  46: { who: "Streetside Hustlers", number: "2D", avoid: 8, weapon: "Blade", attack: 0, hits: 5, armour: "" },
  51: { who: "Streetside Merchants", vehicle: true, number: "2D", avoid: 10, weapon: "Shotgun and Dagger", attack: 0, hits: 5, armour: "" },
  52: { who: "Alleyway Traders", number: "2D", avoid: 8, weapon: "Dagger", attack: 0, hits: 5, armour: "" },
  53: { who: "Truckers on Shore Leave", number: "2D", avoid: 6, weapon: "Improvised and Body Pistol", attack: 0, hits: 6, armour: "" },
  54: { who: "Street Preacher w/ Group", number: "4D", avoid: 6, weapon: "", attack: -2, hits: 5, armour: "" },
  55: { who: "Street Gamblers", number: "2D", avoid: 6, weapon: "Dagger", attack: 0, hits: 5, armour: "" },
  56: { who: "Noble with Retinue", vehicle: true, number: "4D", avoid: 6, weapon: "Blade and Autorifle", attack: 0, hits: 7, armour: "Mesh" },
  61: { who: "Protestors", number: "4D", avoid: 8, weapon: "Improvised", attack: 0, hits: 6, armour: "" },
  62: { who: "Police", number: "2D", avoid: 8, weapon: "Club and Body Pistol", attack: 1, hits: 7, armour: "Mesh" },
  63: { who: "Police", vehicle: true, number: "3D", avoid: 10, weapon: "Club and Shotgun", attack: 1, hits: 7, armour: "Mesh" },
  64: { who: "Military Supporting Police", vehicle: true, number: "3D", avoid: 12, weapon: "Club and Carbine", attack: 1, hits: 8, armour: "Jack" },
  65: { who: "Mercenaries as Police", vehicle: true, number: "3D", avoid: 12, weapon: "Club and Autorifle", attack: 1, hits: 8, armour: "Jack" },
  66: { who: "Bounty Hunter", number: "1D", avoid: 8, weapon: "Blade and Carbine", attack: 3, hits: 8, armour: "Jack" }
};

/**
 * Roll on the Random NPC table (p.59).
 * `range` limits the roll: null (full D66), "D36", or [loTens, hiTens] for ranges like 31-56,
 * where a D3 (or the matching die) picks the 10-interval (p.60).
 */
export function rollRandomNpc(dice, { range = null, socDM = 0 } = {}) {
  let code;
  if (!range) code = dice.d66();
  else if (range === "D36") code = dice.d36();
  else code = dice.d66Range(range[0], range[1]);
  const row = RANDOM_NPC[code];
  const number = Math.max(1, dice.roll(row.number));
  const reaction = rollDemeanour(dice, socDM);
  return { code, ...row, count: number, reaction };
}

/** Parse "31-56" or "D36" or "11-16" into the `range` argument of rollRandomNpc. */
export function parseRange(text) {
  if (!text || text === "D66") return null;
  if (text === "D36") return "D36";
  const m = String(text).match(/^(\d)\d-(\d)\d$/);
  if (!m) return null;
  return [clamp(Number(m[1]), 1, 6), clamp(Number(m[2]), 1, 6)];
}

/** A full notable NPC (p.56): type, demeanour, characteristics, weapon. */
export function generateNpc(dice, { world = null, socDM = 0 } = {}) {
  const type = rollNpcType(dice, world);
  const demeanour = rollDemeanour(dice, socDM);
  const characteristics = rollCharacteristics(dice);
  const weapon = rollNpcWeapon(dice);
  return { kind: "npc", ...type, demeanour, characteristics, weapon };
}
