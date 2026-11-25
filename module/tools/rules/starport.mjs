/**
 * Starport encounters (book p.60-61) and settlement encounters (p.102-103). Pure.
 * Both tables use D66 with a DM on the tens die (tens 0-9).
 */
import { characteristicDM } from "../../config.mjs";
import { rollDemeanour, rollRandomNpc, parseRange } from "./npc.mjs";
import { PATRONS } from "./patron.mjs";

/** Starport Encounter Modification: starport DM (p.60). */
export const STARPORT_DM = { A: 2, B: 1, C: 0, D: -1, E: -2, X: -3 };

/** Starport Encounter Modification: government DM (p.60). 0 -2; 2,4,8 -1; 1,3,5 +0; 6,7,9 +1; A-C +2; D-F +3. */
export function starportGovernmentDM(gov) {
  if (gov === 0) return -2;
  if ([2, 4, 8].includes(gov)) return -1;
  if ([1, 3, 5].includes(gov)) return 0;
  if ([6, 7, 9].includes(gov)) return 1;
  if (gov >= 10 && gov <= 12) return 2;
  return 3;
}

export const STARPORT_RANGES = ["Abandoned or neglected", "Seedy", "Rundown", "Out of date", "Below average", "Average", "Above average", "Elite", "Prohibitive", "Oppressive"];

/**
 * Starport Encounter Table (p.61). `patron` and `npc` hold the sub-roll ranges.
 */
export const STARPORT_ENCOUNTERS = {
  1: { text: "People picking through a trash pile" },
  2: { text: "Rusted-out service machine" },
  3: { text: "A broken vehicle missing parts. Someone is working on it but may be fixing it or stripping it." },
  4: { text: "A malfunctioning maintenance robot stumbles around" },
  5: { text: "Domesticated animals chase each other" },
  6: { text: "A rusted-out hull of an old starship, abandoned off to the side of the landing area" },
  11: { text: "Patron Encounter, 11-16", patron: "11-16" },
  12: { text: "A robot covered in graffiti is recharging at an energy station" },
  13: { text: "A vagrant inquires too much about where you are heading next" },
  14: { text: "A drifter sleeping in a corner briefly looks towards you then resumes sleeping" },
  15: { text: "A fight or duel is about to break out between two individuals" },
  16: { text: "There is a crowd loitering around the only working service machine. Random NPC range 11-16", npc: "11-16" },
  21: { text: "Patron Encounter, 21-26", patron: "21-26" },
  22: { text: "There is a small starport pub in need of business" },
  23: { text: "A blocked-off area is undergoing a security investigation while a crowd watches" },
  24: { text: "An NPC preaches while a small crowd listens. Faction Encounter" },
  25: { text: "A ship is seen docked but severely damaged, with emergency services removing crew" },
  26: { text: "Potential robbery. Random NPC range 41-46", npc: "41-46" },
  31: { text: "Patron Encounter, 11-36", patron: "11-36" },
  32: { text: "Drunk crew members are getting into a fight outside a bar" },
  33: { text: "Disgruntled dock workers on a smoke break" },
  34: { text: "Maintenance workers servicing a utility system" },
  35: { text: "A labor strike of dock workers is disrupting normal starport functions" },
  36: { text: "Belligerent and possibly inebriated group of people. Random NPC range 31-36", npc: "31-36" },
  41: { text: "Patron Encounter, D36", patron: "11-36" },
  42: { text: "Meager food stalls are lined up under neon signs and advertisements, with their stools filled with a variety of customers" },
  43: { text: "A dense and diverse crowd of humans, cyborgs, aliens, and robots fill the area, making for a noisy but bustling area for socializing, trading, or finding side work" },
  44: { text: "A busking musician plays for spare credits" },
  45: { text: "A captain is arguing with the port authority over a discrepancy in the ship's manifest, while their ship is being searched" },
  46: { text: "Low-life group looking for trouble. Random NPC D36", npc: "D36" },
  51: { text: "Patron Encounter, 41-46", patron: "41-46" },
  52: { text: "Maintenance crew are cleaning up a mess" },
  53: { text: "Annoyed passengers are dealing with a long delay and are getting irritated with the ship's captain" },
  54: { text: "Performers busking for spare credits or passage" },
  55: { text: "There is a plaza of different businesses offering respite from interstellar travel" },
  56: { text: "Random NPC range 31-56", npc: "31-56" },
  61: { text: "Patron Encounter, D66", patron: "11-66" },
  62: { text: "A number of tempting food vendors populate this area" },
  63: { text: "A variety of merchants have stalls to cater to the needs of travelling individuals, including basic items, and are potentially open to trade" },
  64: { text: "A park area populated with people sitting around sculptures and/or fountains" },
  65: { text: "2D Ship crew members on shore leave", count: "2D" },
  66: { text: "Frustrated and annoyed group of people stuck portside. Random NPC range 31-56", npc: "31-56" },
  71: { text: "Patron Encounter, 61-66", patron: "61-66" },
  72: { text: "A family on vacation asking for directions" },
  73: { text: "A crowd of exhausted passengers disembarking" },
  74: { text: "Stressed-out businessman pacing around" },
  75: { text: "A bored noble with an entourage is waiting for ship repair or refueling" },
  76: { text: "Accidentally bump into a stranger. Random NPC range 51-56", npc: "51-56" },
  81: { text: "Patron Encounter, 51-56", patron: "51-56" },
  82: { text: "Surprise search by authorities to determine if you are carrying any contraband or other illegal items." },
  83: { text: "Security forces attacking protestors" },
  84: { text: "Port authority charges a bogus fee for a minor or non-existent issue with the starship" },
  85: { text: "Bystander getting caught up in an arrest" },
  86: { text: "Overzealous law enforcement. Random NPC range 61-66", npc: "61-66" },
  91: { text: "Broken display screens showing propaganda" },
  92: { text: "Neglected or closed port service kiosks" },
  93: { text: "Military personnel with autoguns are scanning the area. Random NPC range 21-26", npc: "21-26" },
  94: { text: "Weapons are heard being fired off in the distance, followed by yelling" },
  95: { text: "Fenced-off area for additional passenger processing of immigrants, refugees, or “suspicious” off-worlders" },
  96: { text: "Local security is following you. Random NPC range 61-66", npc: "61-66" }
};

/** Roll a patron in a D66 range like "11-36" (p.60: patron encounter uses the listed range). */
export function rollPatronInRange(dice, range) {
  const m = String(range).match(/^(\d)\d-(\d)\d$/);
  const code = m ? dice.d66Range(Number(m[1]), Number(m[2])) : dice.d66();
  return { code, name: PATRONS[code] };
}

/** Resolve the sub-rolls of an encounter row: patron, random NPC, counts. */
function resolveRow(dice, row, socDM) {
  const out = { text: row.text };
  if (row.patron) out.patron = { ...rollPatronInRange(dice, row.patron), reaction: rollDemeanour(dice, socDM) };
  if (row.npc) out.npc = rollRandomNpc(dice, { range: parseRange(row.npc), socDM });
  if (row.count) out.count = dice.roll(row.count);
  return out;
}

/**
 * Starport encounter (p.60). `world` = { starport, gov, law }; `lowestSoc` is the lowest SOC
 * score in the group (legal encounters); `socDM` the interacting spacer's SOC DM.
 */
export function starportEncounter(dice, { world = {}, lowestSoc = 7, socDM = 0 } = {}) {
  const starport = world.starport ?? "C";
  const gov = world.gov ?? 4;
  const law = world.law ?? 4;
  const kindRoll = dice.d6();
  if (kindRoll === 1) {
    const dm = characteristicDM(lowestSoc);
    const natural = dice.twoD();
    const total = natural + dm;
    const avoided = total >= law;
    return {
      kind: "starport", legal: true, kindRoll,
      avoid: { roll: total, natural, dm, target: law, avoided },
      reaction: avoided ? null : rollDemeanour(dice, socDM),
      text: avoided
        ? "Legal encounter avoided: the group slips past law enforcement, customs agents, or security."
        : "Legal encounter: the spacers are approached, questioned, or asked for permits. Repeat the same check to avoid arrest or fines."
    };
  }
  const dm = (STARPORT_DM[starport] ?? 0) + starportGovernmentDM(gov);
  const code = dice.d66(dm, { minTens: 0, maxTens: 9 });
  const row = STARPORT_ENCOUNTERS[code];
  return { kind: "starport", legal: false, kindRoll, dm, code, range: STARPORT_RANGES[Math.floor(code / 10)], ...resolveRow(dice, row, socDM) };
}

/** Settlement Encounter Modification (p.102): population DM. */
export function settlementPopDM(pop) {
  if (pop <= 3) return -3;
  if (pop <= 5) return -2;
  if (pop <= 7) return -1;
  if (pop <= 9) return 0;
  return 1;
}
/** Settlement Encounter Modification (p.102): law level DM. */
export function settlementLawDM(law) {
  if (law <= 0) return 0;
  if (law <= 3) return 1;
  if (law <= 5) return 2;
  if (law <= 8) return 3;
  return 4;
}

export const SETTLEMENT_RANGES = ["Abandoned or neglected", "Seedy", "Rundown", "Out of date", "Maintained", "Burgeoning", "Esteemed", "Decline", "Dystopian", "Oppressive"];

/** Settlement Encounter Table (p.103). "Random NPC" without a range rolls the full table. */
export const SETTLEMENT_ENCOUNTERS = {
  1: { text: "Shanty town or tent city" },
  2: { text: "Abandoned storefronts" },
  3: { text: "Malfunctioning display signs" },
  4: { text: "Trash piles" },
  5: { text: "Buildings destroyed by collapse or attack" },
  6: { text: "The burnt-out remains of a vehicle" },
  11: { text: "A gang of armed civilians notice you" },
  12: { text: "A robbery is seen nearby" },
  13: { text: "An apparent illegal deal occurs in the shadows" },
  14: { text: "Beggar asks for food or credits" },
  15: { text: "Armed private security outside of one of the few open stores; Random NPC", npc: "D66" },
  16: { text: "A brawl happens in front of a bar; Random NPC (any)", npc: "D66" },
  21: { text: "Someone bumps into you and attempts to pickpocket you, but starts running off when they mess up" },
  22: { text: "A street vendor is willing to buy anything and claims they can find you anything to buy if you pay them a finder's fee" },
  23: { text: "A group of people are tagging a building or vehicle with graffiti" },
  24: { text: "Local NPC walks by talking to themself; 4+ chance they mumble something informative", chance: 4 },
  25: { text: "Municipal worker is cleaning up trash around a rubbish bin" },
  26: { text: "Random NPC 11-16", npc: "11-16" },
  31: { text: "A local festival is being celebrated" },
  32: { text: "A food stall is offering delicious-smelling but odd-looking food" },
  33: { text: "A crime scene is being investigated while reporters broadcast" },
  34: { text: "Two professionals are arguing politics outside of a cafe" },
  35: { text: "A group of citizens are smoking and socializing outside of a bar" },
  36: { text: "Random NPC 21-26", npc: "21-26" },
  41: { text: "Wires and digital ads and neon signs hang from all buildings, causing an artificial glow on the colourful crowds congesting the narrow streets" },
  42: { text: "A robot and a traveller walk by. The traveller doesn't notice you, but the robot maintains eye contact for too long." },
  43: { text: "Stained Brutalist facades cast shadows on the streets below, shading the crowd in a drab overcast that is reflective of their demeanour" },
  44: { text: "Public transit stations are full of loiterers; 4+ chance for a group to harass the travellers", chance: 4 },
  45: { text: "A group of tourists approach and ask for directions, and look very out of place." },
  46: { text: "Random NPCs 31-36", npc: "31-36" },
  51: { text: "A citizen is feeding animals at a park" },
  52: { text: "A citizen is out walking a unique pet" },
  53: { text: "A family of citizens are enjoying a day together" },
  54: { text: "A road is closed off for a parade" },
  55: { text: "A servant of a noble is desperately looking for help" },
  56: { text: "Random NPCs 41-46", npc: "41-46" },
  61: { text: "A businessman is arguing with someone on a headset" },
  62: { text: "Locals are gossiping outside of a bar or cafe" },
  63: { text: "A local celebration or holiday is currently happening, which draws an enthusiastic crowd, blocking streets" },
  64: { text: "Street performers are entertaining a crowd" },
  65: { text: "A noble entourage passes by and ignores you unless your SOC is 10+" },
  66: { text: "Random NPCs 51-56", npc: "51-56" },
  71: { text: "A protest outside of a municipal building" },
  72: { text: "Sidewalk vendors selling bootlegs, stolen goods, junk, and possibly uncommon goods" },
  73: { text: "Locals who pass by on vehicles maintain eye contact while passing" },
  74: { text: "A desperate person approaches you and begs for a ride off-world" },
  75: { text: "A crowd is gathering for a public duel between two nobles" },
  76: { text: "Random NPCs 51-56", npc: "51-56" },
  81: { text: "A beggar is being violently arrested" },
  82: { text: "A protest is being cleared by a riot squad" },
  83: { text: "Someone is preaching on the corner with a sign stating “The end is nigh”" },
  84: { text: "Overtly wealthy NPCs with private police partaking in excess and immunity from consequences" },
  85: { text: "Propaganda posters depicting an authoritative political leader; 4+ chance of it being vandalized", chance: 4 },
  86: { text: "Random NPCs 61-66", npc: "61-66" },
  91: { text: "Buildings have bars over their windows, with the occasional person looking out at you" },
  92: { text: "A security vehicle covered in graffiti or trash drives past then stops. 1D armored police step out. Random NPC", npc: "61-66", count: "1D" },
  93: { text: "Someone is vandalizing a display screen showing propaganda" },
  94: { text: "Military are present on the street, armed with auto guns and wearing armor" },
  95: { text: "Speakers declare the curfew hours" },
  96: { text: "Random NPCs 61-66", npc: "61-66" }
};

/**
 * Settlement encounter (p.102). `checkLegal` rolls the once-per-day legal check first:
 * 2D under the law level means a legal encounter.
 */
export function settlementEncounter(dice, { world = {}, socDM = 0, checkLegal = false } = {}) {
  const pop = world.pop ?? 6;
  const law = world.law ?? 4;
  let legal = null;
  if (checkLegal) {
    const r = dice.twoD();
    legal = { roll: r, law, encounter: r < law };
    if (legal.encounter) {
      legal.reaction = rollDemeanour(dice, socDM);
      return { kind: "settlement", legal, text: "Legal encounter: law enforcement asks for paperwork, frisks the spacers, or customs officers search the ship." };
    }
  }
  const dm = settlementPopDM(pop) + settlementLawDM(law);
  const code = dice.d66(dm, { minTens: 0, maxTens: 9 });
  const row = SETTLEMENT_ENCOUNTERS[code];
  const out = { kind: "settlement", legal, dm, code, range: SETTLEMENT_RANGES[Math.floor(code / 10)], ...resolveRow(dice, row, socDM) };
  if (row.chance) { const c = dice.d6(); out.chance = { roll: c, target: row.chance, happens: c >= row.chance }; }
  return out;
}
