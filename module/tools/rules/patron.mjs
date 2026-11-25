/**
 * The Spacer campaign (book p.50-55): finding a patron, patron generation, patron job generation,
 * job negotiations, destinations, colonies, and job complications. Pure. The book tables live in
 * rules/patron-tables.mjs and are re-exported here.
 */
import { band, clamp } from "../../shared/dice.mjs";
import { rollDemeanour } from "./npc.mjs";
import {
  PATRONS, PATRON_LOCATIONS, PATRON_SEARCH, PERSONALITY, FEATURES, JOB_TYPES, JOB_OBJECTIVES, TERMS, PAYMENT_TERMS,
  JOB_START, DESTINATIONS, DESTINATION_TL, COLONY_RUNNER, COLONY_AGE, COLONY_POP, COMPLICATIONS
} from "./patron-tables.mjs";

export * from "./patron-tables.mjs";

/** The target of the patron search roll (p.50, p.14). */
// BOOK: p.50 gives the search days and a DM by starport but no target number; we use the core
// task rule of p.14: 2D + DMs, 8+ succeeds.
export const FIND_PATRON_TARGET = 8;

/**
 * Roll a colony (p.55, p.102): who runs it, its age, and its population. Called by
 * `rollDestination` for destinations whose name contains "Colony". Returns
 * `{ runner, age, population }`, for example `{ runner: "Military", age: "7 years", population: 400 }`.
 */
export function rollColony(dice) {
  const runner = band(COLONY_RUNNER, dice.twoD());
  const ageRow = band(COLONY_AGE, dice.twoD());
  const age = dice.roll(ageRow.dice);
  const popPer = band(COLONY_POP, dice.twoD());
  const population = dice.d6() * popPer;
  return { runner, age: `${age} ${ageRow.unit}`, population };
}

/** Roll a job complication (p.55): 1D on each of the who, what, why, and how columns. */
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
  if (DESTINATION_TL[code]) out.tl = dice.roll(DESTINATION_TL[code]);
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
 * @param {number} o.socDM      SOC DM of the negotiating spacer (the terms roll only; the patron's
 *                             demeanour is rolled without it)
 * @param {number} o.brokerDM   Broker rank (+ Reputation DM) for the payment roll
 * @param {number} o.findDM     extra DM to the finding roll (e.g. Streetwise or Carouse rank)
 * @param {boolean} o.multipleObjectives  roll D3 objectives (optional rule, p.52)
 */
export function generatePatron(dice, { location = "carouse", starport = "C", socDM = 0, brokerDM = 0, findDM = 0, multipleObjectives = false } = {}) {
  const loc = PATRON_LOCATIONS[location] ?? PATRON_LOCATIONS.carouse;
  const search = PATRON_SEARCH[starport] ?? PATRON_SEARCH.C;
  const days = Math.max(1, dice.roll(search.days));
  const findNatural = dice.twoD();
  const findTotal = findNatural + search.dm + findDM;
  const found = findTotal >= FIND_PATRON_TARGET;

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
