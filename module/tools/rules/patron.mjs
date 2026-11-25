/**
 * The Spacer campaign (book p.50-55): finding a patron, patron generation, patron job generation,
 * job negotiations, destinations, colonies, and job complications. Pure.
 */
import { band, clamp } from "../../shared/dice.mjs";
import { rollDemeanour } from "./npc.mjs";

/** Patron table (p.50), D66. */
export const PATRONS = {
  11: "Assassin", 12: "Smuggler", 13: "Hacker", 14: "Drifter", 15: "Gambler", 16: "Rogue",
  21: "Belter", 22: "Citizen, Worker", 23: "Courier Ship Captain", 24: "Ship Captain", 25: "Spy", 26: "Revolutionary",
  31: "Entertainer", 32: "Citizen, Corporate", 33: "Citizen, Colonist", 34: "Administrator", 35: "Dilettante", 36: "Scholar",
  41: "Merchant", 42: "Scout", 43: "Broker", 44: "Courier", 45: "Freighter Captain", 46: "Merchant Marine",
  51: "Military (Army)", 52: "Military (Navy)", 53: "Military (Marine)", 54: "Agent", 55: "Legal/Court Official", 56: "Mob Boss",
  61: "Governor", 62: "Diplomat", 63: "Ambassador", 64: "Faction Leader", 65: "Noble", 66: "Government Official"
};

/**
 * Patron Location table (p.50). `tens` is the inclusive range of the tens die on the patron table.
 * The book's dice notes ("D3-1, 1D" for 11-26 and "1D-2, 1D" for 11-46) do not produce exactly the
 * listed ranges, so the tens die is rolled uniformly across the listed range.
 */
export const PATRON_LOCATIONS = {
  criminal: { label: "Criminal", examples: "Iniquitous establishments (Streetwise 0+ to find and enter)", range: "11-36", tens: [1, 3], multiplier: 2 },
  streets: { label: "Streets", examples: "Street corners, alleys, postings, holoscreens", range: "11-26", tens: [1, 2], multiplier: 0.5 },
  shipyards: { label: "Shipyards", examples: "Docks, warehouses, etc.", range: "41-46", tens: [4, 4], multiplier: 1 },
  carouse: { label: "Carouse", examples: "Bars, clubs, markets", range: "11-66", tens: [1, 6], multiplier: 1 },
  recreation: { label: "Recreation", examples: "Casinos, entertainment centers, etc.", range: "11-46", tens: [1, 4], multiplier: 1 },
  elite: { label: "Elite", examples: "Fundraisers, balls/parties, Noble court (SOC 10+)", range: "61-66", tens: [6, 6], multiplier: 3 }
};

/** Days searching and DM to find a patron by starport class (p.50). */
export const PATRON_SEARCH = {
  A: { settlement: "2D x 1,000,000", days: "D3", dm: 2 },
  B: { settlement: "2D x 100,000", days: "1D", dm: 1 },
  C: { settlement: "2D x 10,000", days: "1D+3", dm: 0 },
  D: { settlement: "2D x 1000", days: "2D", dm: -1 },
  E: { settlement: "2D x 100", days: "2D+3", dm: -2 },
  X: { settlement: "2D x 10", days: "3D", dm: -4 }
};

/** Patron personality and feature tables (p.51), D66. */
export const PERSONALITY = {
  11: "Demanding", 12: "Off-Putting", 13: "Angry", 14: "Nervous", 15: "Overly Charismatic", 16: "Terse",
  21: "Very Proper", 22: "Intense", 23: "Cautious", 24: "Secretive", 25: "Arrogant", 26: "Rude",
  31: "Pleasant", 32: "Desperate", 33: "Upset", 34: "Confident", 35: "Stubborn", 36: "Cunning",
  41: "Calm", 42: "Charming", 43: "Kind", 44: "Dour", 45: "Energetic", 46: "Aloof",
  51: "Eccentric", 52: "Relaxed", 53: "Brash", 54: "Logical", 55: "Considerate", 56: "All-Business",
  61: "Disturbed", 62: "Indifferent", 63: "Worry-Free", 64: "Open-Minded", 65: "Unfriendly", 66: "Stressed"
};
export const FEATURES = {
  11: "Bad Hair Style", 12: "Missing Facial Feature", 13: "Scruffy", 14: "Ugly", 15: "Odd Smell", 16: "Tall",
  21: "Overweight", 22: "Hunched", 23: "Tired", 24: "Bad Hygiene", 25: "Fidgety", 26: "Tattooed",
  31: "Unsettling", 32: "Elegant", 33: "Weathered", 34: "Scarred", 35: "Sturdy", 36: "Physically Impaired",
  41: "Nice Hair", 42: "Glasses", 43: "Well-Groomed", 44: "Good-Looking", 45: "Perfumed", 46: "Short",
  51: "Skeletal", 52: "Unkempt", 53: "Gaudily-Dressed", 54: "Well-Built", 55: "Old", 56: "Young",
  61: "Large Features", 62: "Sickly", 63: "Immaculately Dressed", 64: "Outdated Style", 65: "Slight", 66: "Physically Modified"
};

/** Job types (p.52-53). `pay` is the weekly payment dice and multiplier; enrichment uses its own table. */
export const JOB_TYPES = [
  { key: "chase", label: "Chase / Pursuit", pay: { dice: "1D", per: 500 }, note: "The spacers must find the objective; roles may flip if a complication occurs." },
  { key: "assault", label: "Assault / Rescue", pay: { dice: "1D", per: 1000 }, note: "Assumes the spacers will use violence. A complication means the target is not what it seems." },
  { key: "discovery", label: "Discovery / Exploration", pay: { dice: "1D+6", per: 1000 }, note: "Find accurate information and survive. A complication reveals an unexpected outcome." },
  { key: "enrichment", label: "Enrichment", pay: null, note: "Short-term, possibly high-risk payouts. A complication means the subject is not what it seems." },
  { key: "enigma", label: "Enigma / Mystery", pay: { dice: "2D", per: 2000 }, note: "Help solve a mystery. A complication shows why it was not answered before." },
  { key: "novelty", label: "Novelty / Unique", pay: { dice: "2D+3", per: 2000 }, note: "An unusual opportunity. Complications bring role reversals and unexpected dangers." }
];

/** Job objectives (p.52): JOB_OBJECTIVES[type][2D - 2]. */
export const JOB_OBJECTIVES = {
  chase: [
    "Track down a major criminal / bail skipper / VIP. They are dangerous.",
    "Track down a minor criminal / bail skipper / VIP. May be dangerous.",
    "Repo vehicle / starship",
    "Steal data from a starship",
    "Intercept courier and collect or destroy data",
    "Recover valuable data from a database located in a hard-to-reach location",
    "Collect intel",
    "Track NPC and report",
    "Recruit NPC",
    "Capture NPC",
    "Hijack starship"
  ],
  assault: [
    "Assault military starship",
    "Break into secure location to: roll again on Chase / Pursuit column",
    "Clandestine operation",
    "Sabotage",
    "Repress or support rebels",
    "Escort and protect",
    "Recover item, data, or ship",
    "Rescue NPC",
    "Security detail",
    "Privateering job",
    "Assassinate VIP"
  ],
  discovery: [
    "Find an ancient / alien artifact or explore ancient / alien structure",
    "Find a lost base",
    "Find survivors of a crash or outpost",
    "Gather samples from a planet",
    "Locate mineable asteroids",
    "Search abandoned ship",
    "Locate crash site",
    "Re-chart a star system",
    "Navigate a new route across a rift or unexplored area",
    "Explore an uncharted star system",
    "Investigate anomaly"
  ],
  enrichment: [
    "Facilitate illegal deal",
    "Mining Operation",
    "Ransom",
    "Scavenge",
    "Haul freight",
    "Courier",
    "Transport patron",
    "Tow starship",
    "Smuggle items in or out",
    "Smuggle people in or out",
    "Blockade running"
  ],
  enigma: [
    "Locate a psionic institute",
    "Investigate conspiracy",
    "Shut off a location communication beacon",
    "Transport VIP in low passage to unknown location",
    "Explore an abandoned ship or location",
    "Find missing person",
    "Investigate mysterious beacon",
    "Locate sleeper agent / cell",
    "Colony went silent",
    "Recover rumored artifact",
    "Investigate ancient structure"
  ],
  novelty: [
    "Represent the patron and establish a good relationship with an outsider",
    "Go undercover to infiltrate faction",
    "Train new recruits for a special mission",
    "Frame NPC",
    "Participate in a noble's tournament",
    "Manage outpost, starship, or satellite",
    "Sneak passengers into or out of a system or planet",
    "Be a test subject for prototype technology",
    "Help robot seeking its creator",
    "Return an alien to its homeworld",
    "Impersonate VIP to gather intel or spread rumors"
  ]
};

/** Negotiate Terms (p.54): 2D + SOC DM gives both columns. `weeks` is rolled from `time`. */
export const TERMS = [
  [null, 2, { time: "D3 weeks", timeDice: "D3", unit: "weeks", location: "Local: Within star system", parsecs: "0" }],
  [3, 5, { time: "1D weeks", timeDice: "1D", unit: "weeks", location: "Close: Within D3 parsecs", parsecs: "D3" }],
  [6, 8, { time: "1D+3 weeks", timeDice: "1D+3", unit: "weeks", location: "Average: Within 1D parsecs", parsecs: "1D" }],
  [9, 11, { time: "2D+3 weeks", timeDice: "2D+3", unit: "weeks", location: "Far: 2D parsecs", parsecs: "2D" }],
  [12, null, { time: "1D3+3 months", timeDice: "1D3+3", unit: "months", location: "Distant: 2D+6 parsecs", parsecs: "2D+6" }]
];

/** Negotiate Payment (p.54): 2D + Broker (+ Reputation). */
export const PAYMENT_TERMS = [
  [null, 2, { text: "Full payment on arrival", upFront: 0 }],
  [3, 5, { text: "25% now, 75% on completion", upFront: 0.25 }],
  [6, 8, { text: "50% now, 50% on completion", upFront: 0.5 }],
  [9, 11, { text: "75% up front, 25% on completion", upFront: 0.75 }],
  [12, null, { text: "100% up front", upFront: 1 }]
];

/** Negotiate Start of the Job (p.54), 2D. */
export const JOB_START = [
  [null, 2, { text: "Immediately", dice: null }],
  [3, 5, { text: "2D hours", dice: "2D", unit: "hours" }],
  [6, 8, { text: "D3 days", dice: "D3", unit: "days" }],
  [9, 11, { text: "1D days", dice: "1D", unit: "days" }],
  [12, null, { text: "2D days", dice: "2D", unit: "days" }]
];

/** Job destinations (p.54), D66. Rows marked `settlement` roll the settlement type and distance. */
export const DESTINATIONS = {
  11: "Coordinates without known location", 12: "Rockball with WayStation", 13: "Habitable World Starport (TL 1D+6)",
  14: "Habitable World Starport (TL 2D+6)", 15: "Rockball Starport", 16: "Orbital Space Station",
  21: "Moon Starport", 22: "Spaceship in Orbit", 23: "Rockball with Starport", 24: "Asteroid Starport", 25: "Belter Base", 26: "Scrapyard",
  31: "Settlement (TL D3+6)", 32: "Settlement (TL 1D+6)", 33: "Settlement (TL 2D+3)", 34: "Established Mining Colony",
  35: "Established Manufacturing Colony", 36: "Scavenger Base",
  41: "Remote Scout Base", 42: "Remote Independent Frontier Settlement", 43: "Remote Colony, Agriculture", 44: "Remote Waystation",
  45: "Remote Colony, Manufacturing", 46: "Remote Colony, Mining",
  51: "Warzone", 52: "Planetside Military Base", 53: "Battle Wreckage", 54: "Naval Fleet / Base", 55: "Pirate Base", 56: "Military Ship in Transit",
  61: "Controversial Colony", 62: "Red Zone Planet", 63: "Prison Colony", 64: "Pirate Base", 65: "Remote Coordinates", 66: "Anomaly"
};
const DEST_TL = { 13: "1D+6", 14: "2D+6", 31: "D3+6", 32: "1D+6", 33: "2D+3" };

/** Colonies (p.55 and p.102): 2D on each column. */
export const COLONY_RUNNER = [
  [null, 2, "Criminal"], [3, 4, "Military"], [5, 7, "Corporation"], [8, 9, "Government"],
  [10, 11, "Political/Philosophical Ideology"], [12, null, "Religious"]
];
export const COLONY_AGE = [
  [null, 2, { dice: "D3+3", unit: "years" }], [3, 4, { dice: "2D", unit: "years" }], [5, 7, { dice: "2D+6", unit: "years" }],
  [8, 9, { dice: "D3", unit: "decades" }], [10, 11, { dice: "1D+3", unit: "decades" }], [12, null, { dice: "D3", unit: "centuries" }]
];
export const COLONY_POP = [
  [null, 2, 50], [3, 4, 100], [5, 7, 500], [8, 9, 1000], [10, 11, 5000], [12, null, 10000]
];

/**
 * Roll a colony. The book lists "8-10" and "10-11" (10 is in both rows); 10 is read as the
 * second row so every row keeps a range.
 */
export function rollColony(dice) {
  const runner = band(COLONY_RUNNER, dice.twoD());
  const ageRow = band(COLONY_AGE, dice.twoD());
  const age = dice.roll(ageRow.dice);
  const popPer = band(COLONY_POP, dice.twoD());
  const population = dice.d6() * popPer;
  return { runner, age: `${age} ${ageRow.unit}`, population };
}

/** Job complications (p.55), 1D per column. */
export const COMPLICATIONS = {
  who: ["Ally", "Friend", "Connection", "Different Patron", "Rival", "Enemy"],
  what: ["Role Reversal", "Contract Change / Rival Offer", "Betrayed", "Pursuing / Pursued", "Misinformed / Cover-up", "Restriction / Obstacle"],
  why: ["No Reason / Chance", "Political", "Cultural", "Professional", "Economical", "Ideological"],
  how: ["Money", "Favor", "Benefit", "Threat", "Sabotage", "Violence"]
};

export function rollComplication(dice) {
  const out = {};
  for (const k of ["who", "what", "why", "how"]) out[k] = COMPLICATIONS[k][dice.d6() - 1];
  return out;
}

/** Settlement type and distance from the starport (p.54). */
export function rollSettlement(dice) {
  const t = dice.d6();
  const type = t <= 3 ? "Planetside" : t <= 5 ? "Moon/Asteroid" : "Orbital Space Station";
  const d = dice.d6();
  let distance;
  if (d <= 3) distance = "Close to a major starport, or has one locally";
  else if (d <= 5) distance = `${dice.d6() * 100} km from the nearest starport`;
  else distance = `${dice.twoD() * 100} km from the nearest starport`;
  return { type, distance };
}

/** Destination (p.54) with its TL, settlement, and colony details. */
export function rollDestination(dice) {
  const code = dice.d66();
  const name = DESTINATIONS[code];
  const out = { code, name };
  if (DEST_TL[code]) out.tl = dice.roll(DEST_TL[code]);
  if (code >= 31 && code <= 33) out.settlement = rollSettlement(dice);
  if (/Colony/.test(name)) out.colony = rollColony(dice);
  return out;
}

/** Enrichment payment (p.53). Returns a text and, where the book gives enough, a total. */
export function enrichmentPayment(dice, objective, { parsecs = 1 } = {}) {
  const p = Math.max(1, parsecs);
  switch (objective) {
    case "Facilitate illegal deal": {
      const tons = dice.twoD() * 10;
      return { text: `Deal of ${tons} tons of goods (roll the good on the illegal goods rows 71-76 of the trade table). The spacers' cut is 1/4 of the total value.`, tons, cut: 0.25, tradeRange: [7, 7] };
    }
    case "Mining Operation":
      return { text: "Basic ore 500cr/tonne, uncommon ore 1000cr/tonne, precious metals 5000cr/tonne, precious minerals 10000cr/tonne." };
    case "Ransom": {
      const soc = dice.twoD();
      return { text: `Target's SOC ${soc} x 10,000cr`, total: soc * 10000 };
    }
    case "Scavenge":
      return { text: "1000cr per tonne scavenged." };
    case "Haul freight":
      return { text: `1000cr per tonne per parsec (${p} parsec${p === 1 ? "" : "s"}).`, perTon: 1000 * p };
    case "Courier":
      return { text: "The Enrichment Job Type Table lists no payment for Courier; the referee sets it." };
    case "Transport patron":
      return { text: `Low 500cr, Basic 2000cr, Middle 5000cr, High 10,000cr per parsec (${p} parsec${p === 1 ? "" : "s"}).`, total: 5000 * p };
    case "Tow starship": {
      const tons = dice.d6() * 100;
      return { text: `100cr per tonne of the ship (a ${tons}T ship).`, total: tons * 100 };
    }
    case "Smuggle items in or out":
      return { text: `8000cr per person per parsec (${p} parsec${p === 1 ? "" : "s"}).`, perPerson: 8000 * p };
    case "Smuggle people in or out":
      return { text: "x2 cost per tonne per parsec." };
    case "Blockade running":
      return { text: "x5 cost per tonne per parsec within an amber zone / dangerous area." };
    default:
      return { text: "" };
  }
}

/** Roll the job objective for a type. Handles "roll again on Chase / Pursuit". */
export function rollObjective(dice, typeKey) {
  const r = dice.twoD();
  let text = JOB_OBJECTIVES[typeKey][r - 2];
  let sub = null;
  if (typeKey === "assault" && r === 3) {
    const r2 = dice.twoD();
    sub = JOB_OBJECTIVES.chase[r2 - 2];
    text = `Break into secure location to: ${sub}`;
  }
  return { roll: r, text };
}

/**
 * Generate a patron and a job (p.50-55) in one result.
 * @param {object} dice
 * @param {object} o
 * @param {string} o.location   key of PATRON_LOCATIONS
 * @param {string} o.starport   starport class A-E or X
 * @param {number} o.socDM      SOC DM of the negotiating spacer (demeanour and terms)
 * @param {number} o.brokerDM   Broker rank (+ Reputation DM) for the payment roll
 * @param {number} o.findDM     extra DM to the finding roll (e.g. Streetwise or Carouse rank)
 * @param {boolean} o.multipleObjectives  roll D3 objectives (optional rule, p.52)
 */
export function generatePatron(dice, { location = "carouse", starport = "C", socDM = 0, brokerDM = 0, findDM = 0, multipleObjectives = false } = {}) {
  const loc = PATRON_LOCATIONS[location] ?? PATRON_LOCATIONS.carouse;
  const search = PATRON_SEARCH[starport] ?? PATRON_SEARCH.C;
  // Finding a patron (p.50): the book gives the days and a DM but no target. We use the core
  // task rule: 2D + DMs, 8+ succeeds (p.14).
  const days = Math.max(1, dice.roll(search.days));
  const findNatural = dice.twoD();
  const findTotal = findNatural + search.dm + findDM;
  const found = findTotal >= 8;

  const patronCode = dice.d66Range(loc.tens[0], loc.tens[1]);
  const patron = PATRONS[patronCode];
  const personality = PERSONALITY[dice.d66()];
  const feature = FEATURES[dice.d66()];
  const demeanour = rollDemeanour(dice, 0);

  const typeRoll = dice.d6();
  const type = JOB_TYPES[typeRoll - 1];
  const objectiveCount = multipleObjectives ? dice.d3() : 1;
  const objectives = [];
  for (let i = 0; i < objectiveCount; i++) objectives.push(rollObjective(dice, type.key));

  // Negotiate terms: 2D + SOC DM + demeanour DM (p.54).
  const termsNatural = dice.twoD();
  const termsTotal = termsNatural + socDM + demeanour.dm;
  const terms = band(TERMS, termsTotal);
  const timeValue = Math.max(1, dice.roll(terms.timeDice));
  const weeks = terms.unit === "months" ? timeValue * 4 : timeValue;
  const parsecs = terms.parsecs === "0" ? 0 : dice.roll(terms.parsecs);

  // Negotiate payment: 2D + Broker + demeanour DM (p.54).
  const payNatural = dice.twoD();
  const payTotal = payNatural + brokerDM + demeanour.dm;
  const paymentTerms = band(PAYMENT_TERMS, payTotal);

  const startRow = band(JOB_START, dice.twoD() + demeanour.dm);
  const start = startRow.dice ? `${dice.roll(startRow.dice)} ${startRow.unit}` : "Immediately";

  let payment;
  if (type.pay) {
    const roll = dice.roll(type.pay.dice);
    const weekly = roll * type.pay.per;
    const base = weekly * weeks;
    payment = { text: `${type.pay.dice} (${roll}) x ${type.pay.per}cr x ${weeks} weeks x${loc.multiplier}`, weekly, total: Math.round(base * loc.multiplier) };
  } else {
    const e = enrichmentPayment(dice, objectives[0].text, { parsecs });
    payment = { text: `${e.text}${e.total ? ` Patron multiplier x${loc.multiplier}.` : ""}`, total: e.total ? Math.round(e.total * loc.multiplier) : null };
  }
  payment.upFront = payment.total !== null && payment.total !== undefined ? Math.round(payment.total * paymentTerms.upFront) : null;

  const destination = rollDestination(dice);
  const complication = rollComplication(dice);

  return {
    kind: "patron",
    location: { key: location, ...loc },
    search: { starport, days, roll: findTotal, natural: findNatural, dm: search.dm + findDM, found },
    patron: { code: patronCode, name: patron, personality, feature, demeanour },
    job: {
      type: type.label, typeKey: type.key, note: type.note, objectives,
      terms: { roll: termsTotal, time: `${timeValue} ${terms.unit}`, weeks, location: terms.location, parsecs },
      paymentTerms: { roll: payTotal, ...paymentTerms },
      start,
      payment,
      destination,
      complication
    }
  };
}

/** Days searching for a patron (p.50) for one starport class. */
export function patronSearchDays(dice, starport) {
  const s = PATRON_SEARCH[starport] ?? PATRON_SEARCH.C;
  return clamp(dice.roll(s.days), 1, 99);
}
