/**
 * Character creation data, transcribed from the Spacer book (v1.03) pages 16-29 and 114.
 * Pure data and small pure helpers: no Foundry globals.
 *
 * Skill names follow the skill descriptions on p.28-29 ("Melee Combat", "Ranged Combat",
 * "Vaccsuit", "Computers", "Engineering"). The career tables on p.19 spell some names
 * differently ("Vacc Suit", "Melee (Blade)", "Computer", "Engineer", "Gun Combat"); `parseSkill`
 * keeps the book label and maps it to the p.28-29 name.
 */

/** Characteristic keys in UPP order (p.16). */
export const CHARS = ["str", "dex", "end", "int", "edu", "soc"];
/** Physical characteristics: injuries and aging lower these (p.18, p.20). */
export const PHYSICAL = ["str", "dex", "end"];
/** Short labels of the characteristics, for the log and the wizard. */
export const CHAR_LABEL = { str: "STR", dex: "DEX", end: "END", int: "INT", edu: "EDU", soc: "SOC", psi: "PSI" };

/** Specialised skills and their specialties (p.28-29). */
export const SPECIALTIES = {
  "Drive": ["Civilian", "Grav", "Industrial", "Marine", "Military", "Misc"],
  "Melee Combat": ["Blade", "Hand-to-Hand", "Bludgeon"],
  "Pilot": ["Starship", "Aircraft"],
  "Ranged Combat": ["Short", "Stock", "Energy", "Archaic"],
  "Tactics": ["Starship", "Vehicle", "Squad", "Zero-G"]
};

/** Book spellings on the career tables mapped to the p.28-29 skill names. */
export const SKILL_ALIASES = {
  "Vacc Suit": "Vaccsuit",
  "Melee": "Melee Combat",
  "Ranged": "Ranged Combat",
  "Gun Combat": "Ranged Combat",
  "Computer": "Computers",
  "Engineer": "Engineering",
  "Jack-of-all-Trades": "Jack-of-All-Trades",
  "Gambling": "Gambling"
};
const SPEC_ALIASES = { "H2H": "Hand-to-Hand", "Vehicles": "Vehicle", "Hand to Hand": "Hand-to-Hand" };

/**
 * Parse a book table label into a gain.
 * "+1 END" -> { char: "end", amount: 1 }
 * "Melee Combat (H2H)" -> { skill: "Melee Combat", specs: ["Hand-to-Hand"] }
 * "Drive (Any Non-Military)" -> { skill: "Drive", specs: [every Drive specialty except Military] }
 * "Pilot" -> { skill: "Pilot", specs: null } (any specialty)
 */
export function parseSkill(label) {
  const text = String(label).trim();
  const ch = text.match(/^([+-]\d+)\s+(STR|DEX|END|INT|EDU|SOC)$/i);
  if (ch) return { label: text, char: ch[2].toLowerCase(), amount: Number(ch[1]) };
  const m = text.match(/^(.*?)\s*(?:\((.*)\))?$/);
  let name = m[1].trim();
  name = SKILL_ALIASES[name] ?? name;
  const all = SPECIALTIES[name] ?? null;
  let specs = null;
  if (m[2] && all) {
    const inner = m[2].trim();
    if (/^any$/i.test(inner)) specs = null;
    else if (/non-?\s*military/i.test(inner)) specs = all.filter(s => s !== "Military");
    else specs = inner.split(/\s+or\s+/i).map(s => SPEC_ALIASES[s.trim()] ?? s.trim()).filter(s => all.includes(s));
    if (specs && !specs.length) specs = null;
  }
  return { label: text, skill: name, specs };
}

/** Careers and the Service Table (p.17). DMs are characteristic keys. "x" in the book is null. */
export const CAREERS = {
  navy: {
    key: "navy", name: "Navy", military: true, draft: 1,
    enlist: { target: 8, dm: "int" },
    survival: { target: 5, dm: "int" },
    promotion: { target: 8, dm: "edu" },
    commission: { target: 10, dm: "soc" },
    reenlist: 6,
    enlistSkill: "Vaccsuit",
    ranks: ["Private", "Ensign", "Lieutenant", "Lieutenant Commander", "Commander", "Captain", "Admiral"]
  },
  marines: {
    key: "marines", name: "Marines", military: true, draft: 2,
    enlist: { target: 9, dm: "int" },
    survival: { target: 6, dm: "end" },
    promotion: { target: 9, dm: "soc" },
    commission: { target: 9, dm: "edu" },
    reenlist: 6,
    enlistSkill: "Melee Combat",
    ranks: ["Private", "Lieutenant", "Captain", "Force Commander", "Lieutenant Colonel", "Colonel", "Brigadier"]
  },
  army: {
    key: "army", name: "Army", military: true, draft: 3,
    enlist: { target: 5, dm: "int" },
    survival: { target: 5, dm: "edu" },
    promotion: { target: 6, dm: "edu" },
    commission: { target: 5, dm: "end" },
    reenlist: 7,
    enlistSkill: "Ranged Combat",
    ranks: ["Private", "Lieutenant", "Captain", "Major", "Lieutenant Colonel", "Colonel", "General"]
  },
  scouts: {
    key: "scouts", name: "Scouts", military: false, draft: 4,
    enlist: { target: 7, dm: "int" },
    survival: { target: 7, dm: "end" },
    promotion: null,
    commission: null,
    reenlist: 3,
    enlistSkill: "Pilot",
    ranks: null
  },
  merchants: {
    key: "merchants", name: "Merchants", military: false, draft: 5,
    enlist: { target: 7, dm: "int" },
    survival: { target: 5, dm: "int" },
    promotion: { target: 10, dm: "int" },
    commission: { target: 4, dm: "int" },
    reenlist: 4,
    enlistSkill: "Broker",
    // Rank 6 is "x" for merchants (p.20).
    ranks: ["Private", "4th Officer", "3rd Officer", "2nd Officer", "1st Officer", "Captain"]
  },
  civilian: {
    key: "civilian", name: "Civilian", military: false, draft: 6,
    enlist: { target: 3, dm: "int" },
    survival: { target: 5, dm: "int" },
    promotion: null,
    commission: null,
    reenlist: 5,
    enlistSkill: "Profession",
    ranks: null
  }
};

/** Career keys in the order of the Service table (p.17). */
export const CAREER_KEYS = ["navy", "marines", "army", "scouts", "merchants", "civilian"];
/** The skill drafted characters gain: "Gun Combat 0" (p.18), which is Ranged Combat. */
export const DRAFT_SKILL = "Ranged Combat";

const col = rows => rows.map(parseSkill);

/** Skill tables (p.19), indexed [career][1D-1]. */
export const SKILL_TABLES = {
  personal: {
    name: "Personal Development",
    navy: col(["+1 END", "+1 DEX", "+1 STR", "+1 EDU", "+1 INT", "+1 SOC"]),
    marines: col(["+1 END", "+1 DEX", "+1 STR", "Melee (Blade)", "Carouse", "Melee Combat (H2H)"]),
    army: col(["+1 END", "+1 DEX", "+1 STR", "+1 EDU", "Carouse", "Melee Combat (H2H)"]),
    scouts: col(["+1 END", "+1 DEX", "+1 STR", "+1 EDU", "+1 INT", "Ranged Combat (Any)"]),
    merchants: col(["+1 END", "+1 DEX", "+1 STR", "Melee (Blade)", "Deception", "Gambling"]),
    civilian: col(["+1 END", "+1 DEX", "+1 STR", "+1 SOC", "Ranged (Short or Archaic)", "Drive (And non-military)"])
  },
  service: {
    name: "Service Skills",
    navy: col(["Pilot", "Vacc Suit", "Comms", "Mechanic", "Ranged Combat (Short or Energy)", "Athlete"]),
    marines: col(["Drive", "Vacc Suit", "Recon", "Ranged Combat (Any)", "Survival", "Athlete"]),
    army: col(["Vacc Suit", "Mechanic", "Recon", "Ranged Combat (Stock)", "Melee Combat (Any)", "Athlete"]),
    scouts: col(["Pilot", "Astrogation", "Survival", "Vacc Suit", "Mechanic", "Ranged Combat (Short)"]),
    merchants: col(["Drive (Any Non-Military)", "Vacc Suit", "Broker", "Negotiate", "Electronics", "Steward"]),
    civilian: col(["Drive (Any Non-Military)", "Streetwise", "Legal", "Admin", "Knowledge", "Melee Combat (Any)"])
  },
  education: {
    name: "Professional Education",
    navy: col(["Astrogation", "Gunner", "Medic", "Comms", "Engineering", "Computers"]),
    marines: col(["Heavy Weapons", "Melee Combat (Blade)", "Survival", "Pilot", "Navigation", "Tactics (Squad)"]),
    army: col(["Heavy Weapons", "Drive (Military)", "Mechanic", "Electronics", "Computers", "Gunner"]),
    scouts: col(["Computers", "Comms", "Electronics", "Medic", "Engineering", "Navigation"]),
    merchants: col(["Navigation", "Streetwise", "Persuade", "Legal", "Ranged Combat", "Astrogation"]),
    civilian: col(["Deception", "Legal", "Profession", "Carouse", "Athlete", "Vacc Suit"])
  },
  advanced: {
    name: "Advanced Education",
    minEdu: 8,
    navy: col(["Admin", "Recon", "Navigation", "Knowledge", "Survival", "Tactics (Starship or Vehicles)"]),
    marines: col(["Medic", "Ranged Combat (Energy)", "Explosives", "Stealth", "Comms", "Tactics (Starship)"]),
    army: col(["Diplomacy", "Knowledge", "Explosives", "Survival", "Engineer", "Tactics (Vehicle or Squad)"]),
    scouts: col(["Knowledge", "Explosives", "Crafting", "Survival", "Admin", "Jack-of-All-Trades"]),
    merchants: col(["Engineering", "Pilot", "Computer", "Electronics", "Admin", "Medic"]),
    civilian: col(["Medic", "Mechanic", "Admin", "Computers", "Diplomacy", "Jack-of-All-Trades"])
  },
  officer: {
    name: "Commissioned Officer Skills",
    commissioned: true,
    all: col(["Admin", "Leadership", "Diplomacy", "Profession", "Melee (any)", "Tactics (any)"])
  }
};

/** Skill table keys in the order the wizard offers them (p.19). */
export const TABLE_KEYS = ["personal", "service", "education", "advanced", "officer"];

/** The row list of a skill table for a career. */
export function tableRows(table, career) {
  const t = SKILL_TABLES[table];
  return t.all ?? t[career];
}

/** Civilian skills for the Peacekeeper event: every skill on the Civilian skill tables (p.19). */
export function civilianSkills() {
  const out = new Set();
  for (const t of ["personal", "service", "education", "advanced"]) {
    for (const g of SKILL_TABLES[t].civilian) if (g.skill) out.add(g.skill);
  }
  return [...out].sort();
}

/**
 * Injury Table (p.18), 1D. Effects are applied by the engine.
 * discharge: removed from service; cashRolls: extra D3 rolls on the Monetary table.
 */
export const INJURY = {
  1: { name: "Death", text: "Your character dies in service of their career.", death: true },
  2: { name: "Detrimental Injury", text: "-D3 to all physical characteristics. Discharged from service. Gain two D3 cash mustering rolls.", d3All: true, discharge: true, cashRolls: 2 },
  3: { name: "Severe Injury", text: "-D3 to two physical characteristics. Discharged from service. Gain a D3 cash mustering roll.", d3Two: true, discharge: true, cashRolls: 1 },
  4: { name: "Notable Injury", text: "-D3 to a random physical characteristic. Discharged from service.", d3Random: true, discharge: true },
  5: { name: "Major Injury", text: "-1 to all physical characteristics. Reenlistment -2 DM. Future survival checks in this career -1 DM.", minusAll: true, reenlistDM: -2, survivalDM: -1 },
  6: { name: "Minor Injury", text: "-1 to a physical characteristic of your choice. Future survival checks in this career -1 DM.", minusChoice: true, survivalDM: -1 }
};

/**
 * Rank benefits (p.20): extra mustering out rolls for a rank (0-6). Called by planMuster().
 * BOOK: the p.22 example gives a rank 0 Private "a bonus mustering out" roll, but the Rank Benefit
 * table (p.20) gives rank 0 nothing ("x"); we follow the table: rank 0 = no bonus roll.
 */
export function rankMusterRolls(rank) {
  if (rank >= 6) return 4;
  if (rank >= 5) return 3;
  if (rank >= 3) return 2;
  if (rank >= 1) return 1;
  return 0;
}
/** Rank benefits (p.20): number of +1 DM mustering out rolls for a commissioned officer. Called by planMuster(). */
export function commissionMusterDMs(rank, commissioned) {
  if (!commissioned) return 0;
  if (rank >= 6) return 3;
  if (rank >= 4) return 2;
  if (rank >= 2) return 1;
  return 0;
}

/**
 * Aging table (p.20). Applies when the character is 34 or older after a term (term 4+).
 * BOOK: p.16 starts aging at term 5 ("age 34 or higher when starting this career term"); we follow
 * p.20 and this table, which start at term 4, age 34.
 * Each entry: characteristic, loss, unmodified 2D target to avoid it.
 */
export function agingChecks(age) {
  if (age < 34) return [];
  if (age < 50) return [{ char: "str", loss: 1, target: 8 }, { char: "dex", loss: 1, target: 7 }, { char: "end", loss: 1, target: 8 }];
  if (age < 66) return [{ char: "str", loss: 1, target: 9 }, { char: "dex", loss: 1, target: 8 }, { char: "end", loss: 1, target: 9 }];
  return [{ char: "str", loss: 2, target: 9 }, { char: "dex", loss: 2, target: 9 }, { char: "end", loss: 2, target: 9 }, { char: "int", loss: 1, target: 9 }];
}

/**
 * Material Benefits Table (p.21), rows 1-7 (7 needs a DM). Each benefit:
 * { kind: "passage"|"char"|"blade"|"gun"|"sss"|"shares"|"scoutShip"|"merchantShip"|"none", ... }
 */
const B = {
  low: { kind: "passage", name: "Low Passage" },
  mid: { kind: "passage", name: "Medium Passage" },
  high: { kind: "passage", name: "High Passage" },
  blade: { kind: "blade", name: "Blade" },
  gun: { kind: "gun", name: "Gun" },
  sss: { kind: "sss", name: "Spacer Support Service (SSS)" },
  shares: { kind: "shares", name: "Ship Shares" },
  scout: { kind: "scoutShip", name: "Scout Ship" },
  merchant: { kind: "merchantShip", name: "Merchant Ship" },
  none: { kind: "none", name: "x" },
  c: (char, amount) => ({ kind: "char", char, amount, name: `+${amount} ${CHAR_LABEL[char]}` })
};
/** Material Benefits rows 1-7 per career (p.21). */
export const MATERIAL = {
  navy: [B.low, B.c("int", 1), B.c("edu", 2), B.blade, B.sss, B.high, B.c("soc", 2)],
  marines: [B.low, B.c("int", 2), B.c("edu", 1), B.blade, B.sss, B.high, B.c("soc", 2)],
  army: [B.low, B.c("int", 1), B.c("edu", 2), B.gun, B.high, B.mid, B.c("soc", 1)],
  scouts: [B.low, B.c("int", 2), B.c("edu", 2), B.blade, B.gun, B.scout, B.none],
  merchants: [B.low, B.c("int", 1), B.c("edu", 1), B.gun, B.blade, B.high, B.merchant],
  civilian: [B.low, B.c("int", 1), B.c("edu", 1), B.c("soc", 1), B.shares, B.high, B.none]
};

/** Monetary Benefit Table (p.21), credits, rows 1-7. */
export const MONETARY = {
  navy: [1000, 5000, 5000, 10000, 20000, 50000, 50000],
  marines: [2000, 5000, 5000, 10000, 20000, 30000, 40000],
  army: [2000, 5000, 10000, 10000, 10000, 20000, 30000],
  scouts: [20000, 20000, 30000, 30000, 50000, 50000, 50000],
  merchants: [1000, 5000, 10000, 20000, 20000, 40000, 40000],
  civilian: [1000, 5000, 10000, 10000, 10000, 50000, 100000]
};
/** At most three Monetary rolls per career (p.20). See the BOOK note in musterOut() (muster.mjs). */
export const MONETARY_CAP = 3;

/** Items the material benefits give (p.21). `lookup` lists compendium names to try, in order. */
export const BENEFIT_ITEMS = {
  dagger: { name: "Dagger", type: "weapon", lookup: ["Dagger", "Knife"] },
  sword: { name: "One-Handed Sword", type: "weapon", lookup: ["One-Handed Sword", "Sword"] },
  bodyPistol: { name: "Body Pistol", type: "weapon", lookup: ["Body Pistol"], spec: "Short" },
  carbine: { name: "Carbine", type: "weapon", lookup: ["Carbine"], spec: "Stock" },
  energyPistol: { name: "Energy Pistol", type: "weapon", lookup: ["Energy Pistol", "Laser Pistol"], spec: "Energy" }
};

/** Pension (p.22) by terms in one career. */
export function pensionFor(terms) {
  if (terms >= 8) return { monthly: 800, yearly: 9000 };
  if (terms >= 7) return { monthly: 600, yearly: 7000 };
  if (terms >= 6) return { monthly: 500, yearly: 6000 };
  if (terms >= 5) return { monthly: 400, yearly: 4000 };
  return null;
}
/** Disability pension equals 5 terms of service (p.18). */
export const DISABILITY_PENSION = { monthly: 400, yearly: 4000 };

/** Event table names (p.24-27), for the log. */
export const MILITARY_EVENTS = {
  1: "Chewed Up and Spat Out", 2: "Voluntold", 3: "Up for Promotion", 4: "Espionage", 5: "Warzone",
  6: "Honor Duel", 7: "Extracurricular Training", 8: "Peacekeeper", 9: "Court Martial", 10: "Shell-Shocked",
  11: "War Hero", 12: "Career Soldier", 13: "Unique"
};
/** Non-Military Life Event names (p.26-27). */
export const CIVIL_EVENTS = {
  1: "Severe Illness", 2: "Inheritance", 3: "Management", 4: "Romantic Interest", 5: "On Strike", 6: "Secret",
  7: "Made Redundant", 8: "Heated Rivalry", 9: "Legal Trouble", 10: "Tragedy", 11: "Local Hero",
  12: "Married to the Job", 13: "Unique"
};
/** Unique Event names (p.25, p.27). */
export const UNIQUE_EVENTS = {
  1: "Life Among Sophonts", 2: "Psionic Encounter", 3: "Influential Contact", 4: "Artefact",
  5: "Social Isolation", 6: "Forced Retirement"
};
/** War Hero check characteristic (p.25); officers use EDU. */
export const WAR_HERO_CHAR = { army: "str", marines: "dex", navy: "int" };
/** Local Hero check characteristic (p.27). */
export const LOCAL_HERO_CHAR = { scouts: "end", civilian: "edu", merchants: "soc" };

/** Prison table (p.27): skill options, check characteristic, injury die. */
export const PRISON_EVENTS = {
  1: { name: "Hit the Weights", skills: ["Melee Combat", "Athlete"], check: "str", injury: "1D", success: "contact" },
  2: { name: "Block Runner", skills: ["Gambling", "Stealth", "Melee Combat (Blade)"], check: "dex", injury: "1D", success: "ally" },
  3: { name: "Poor Conditions", skills: ["Streetwise", "Carouse", "Recon"], check: "end", injury: "1D", success: "jack" },
  4: { name: "Smart Guy", skills: ["Admin", "Legal", "Profession"], check: "int", injury: "1D", success: "contact" },
  5: { name: "Hit the Books", skills: ["Mechanic", "Engineering", "Electronics"], check: "edu", injury: "1D", success: "release" },
  6: { name: "Build Bridges", skills: ["Diplomacy", "Deception", "Persuade"], check: "soc", injury: "D3", success: "ally" }
};

/** Characteristic dice modifier (p.16). Same as config.mjs, kept here so the rules stay standalone. */
export function charDM(score) {
  const s = Number(score) || 0;
  if (s <= 0) return -3;
  if (s <= 2) return -2;
  if (s <= 5) return -1;
  if (s <= 8) return 0;
  if (s <= 11) return 1;
  if (s <= 14) return 2;
  return 3;
}

const HEX = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
/** A score as one extended-hex UPP digit (p.16): 10 -> "A". Used by upp() and summary(). */
export function hex(n) { return HEX[Math.max(0, Math.floor(n))] ?? "?"; }
