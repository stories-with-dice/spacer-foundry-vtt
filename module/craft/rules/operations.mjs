/**
 * Starship acquisition, monthly operating costs, operation risks (book p.66, p.68-72).
 * Pure functions, no Foundry globals.
 */

/**
 * Crew positions (book p.70). The first six are the mandatory positions, in order: a ship needs
 * one crew member per 100T, filled from the top of this list.
 * `skill` is the requirement; `specialty` is used for rolls where it matters.
 */
export const CREW_POSITIONS = [
  { key: "pilot", salary: 6000, skill: "Pilot", specialty: "Starship", rank: 0, mandatory: 1 },
  { key: "astrogator", salary: 5000, skill: "Astrogation", rank: 0, mandatory: 2 },
  { key: "sensors", salary: 3000, skill: "Electronics", rank: 0, mandatory: 3 },
  { key: "engineer", salary: 4000, skill: "Engineering", rank: 0, mandatory: 4 },
  { key: "technician", salary: 3000, skill: "Computers", rank: 0, mandatory: 5 },
  { key: "mechanic", salary: 1000, skill: "Mechanic", rank: 0, mandatory: 6 },
  { key: "captain", salary: 10000, skill: "Leadership", rank: 1, mandatory: 0 },
  { key: "steward", salary: 3000, skill: "Steward", rank: 0, mandatory: 0 },
  { key: "medic", salary: 2000, skill: "Medic", rank: 0, mandatory: 0 },
  { key: "gunner", salary: 1000, skill: "Gunner", rank: 0, mandatory: 0 }
];
export const CREW_BY_KEY = Object.fromEntries(CREW_POSITIONS.map(p => [p.key, p]));

/** Minimum crew: one per 100T, at least a pilot (book p.70). */
export function minimumCrew(tonnage) {
  return Math.max(1, Math.floor((Number(tonnage) || 0) / 100));
}

/** Mandatory positions for a hull, in book order (repeats past six are left to the owner). */
export function mandatoryPositions(tonnage) {
  const n = minimumCrew(tonnage);
  return CREW_POSITIONS.filter(p => p.mandatory).slice(0, Math.min(6, n)).map(p => p.key);
}

/** Monthly salaries for a list of role keys. Unknown roles cost 0. */
export function crewSalaries(roles) {
  return roles.reduce((sum, r) => sum + (CREW_BY_KEY[r]?.salary ?? 0), 0);
}

/** Fuel prices per tonne (book p.66, p.70). */
export const FUEL_PRICE = { refined: 500, unrefined: 100 };

/** Life support: 2000cr per stateroom per month (book p.70). */
export function lifeSupportCost(staterooms) {
  return 2000 * Math.max(0, Number(staterooms) || 0);
}

/** Routine maintenance: 0.1% of the new price, once every 12 months (book p.70). */
export function annualMaintenance(newPrice, surchargePercent = 0) {
  return Math.round((Number(newPrice) || 0) * 0.001 * (1 + (Number(surchargePercent) || 0) / 100));
}

/** Berthing: 100cr for the first week, plus 100cr per extra day (book p.70). */
export function berthingCost(days) {
  const d = Math.max(0, Math.floor(Number(days) || 0));
  if (d === 0) return 0;
  return 100 + Math.max(0, d - 7) * 100;
}

/** Lack of maintenance: -1 DM per month past the 12-month window (book p.72). */
export function maintenanceDM(monthsSinceMaintenance) {
  return -Math.max(0, (Number(monthsSinceMaintenance) || 0) - 12);
}

/**
 * Purchase options (book p.68).
 * - new: 20% down, 1/240 of the price per month for 40 years (480 months), 220% in total.
 * - stock: a stock model from the shipyard is 10% cheaper (book p.74).
 * - used: discount 1D x 10%; loan 1/120 of the discounted price per month for 20 years;
 *   maintenance +half the discount, minimum +10%.
 * - subsidised: 600T+; 20% down; the employer pays the mortgage for 40 years of service.
 * - junked: discount (D3+1) x 20%; that many systems at 0; cash only; garage 2000cr per month.
 * @param {number} price new price in credits
 * @param {"new"|"stock"|"used"|"subsidised"|"junked"} mode
 * @param {{d6?: number, d3?: number}} [rolls]
 */
export function purchase(price, mode = "new", rolls = {}) {
  const p = Number(price) || 0;
  switch (mode) {
    case "stock": {
      const cost = Math.round(p * 0.9);
      return { mode, cost, down: Math.round(cost * 0.2), monthly: Math.round(cost / 240), months: 480, maintenanceSurcharge: 0 };
    }
    case "used": {
      const discount = 10 * Math.max(1, Math.min(6, rolls.d6 ?? 1));
      const cost = Math.round(p * (1 - discount / 100));
      return { mode, discount, cost, down: 0, monthly: Math.round(cost / 120), months: 240, maintenanceSurcharge: Math.max(10, discount / 2) };
    }
    case "subsidised":
      return { mode, cost: p, down: Math.round(p * 0.2), monthly: 0, months: 480, maintenanceSurcharge: 0, allowed: p > 0, minTonnage: 600, employerCut: 0.5 };
    case "junked": {
      const criticalSystems = Math.max(2, Math.min(4, (rolls.d3 ?? 1) + 1));
      const discount = 20 * criticalSystems;
      return { mode, discount, criticalSystems, cost: Math.round(p * (1 - discount / 100)), down: 0, monthly: 0, months: 0, garage: 2000, maintenanceSurcharge: 0 };
    }
    default:
      return { mode: "new", cost: p, down: Math.round(p * 0.2), monthly: Math.round(p / 240), months: 480, total: Math.round(p * 2.2), maintenanceSurcharge: 0 };
  }
}

/** Monthly mortgage on a new ship: 1/240 of the price (book p.68). */
export function monthlyMortgage(price) {
  return Math.round((Number(price) || 0) / 240);
}

/**
 * The bill for one month (book p.70). Costs are paid at the start of the month.
 * @param {object} o
 * @param {number} [o.mortgage]      monthly loan payment
 * @param {number} [o.crewSalaries]
 * @param {number} [o.lifeSupport]
 * @param {number} [o.fuelCost]      planned fuel purchases this month
 * @param {number} [o.maintenance]   annual maintenance, charged when `maintenanceDue`
 * @param {boolean} [o.maintenanceDue]
 * @param {number} [o.berthingDays]
 * @param {number} [o.other]
 */
export function monthlyBill({ mortgage = 0, crewSalaries: salaries = 0, lifeSupport = 0, fuelCost = 0, maintenance = 0, maintenanceDue = false, berthingDays = 0, other = 0 } = {}) {
  const lines = [
    { key: "mortgage", amount: Math.round(mortgage) },
    { key: "crewSalaries", amount: Math.round(salaries) },
    { key: "lifeSupport", amount: Math.round(lifeSupport) },
    { key: "fuelCost", amount: Math.round(fuelCost) },
    { key: "maintenance", amount: maintenanceDue ? Math.round(maintenance) : 0 },
    { key: "berthing", amount: berthingCost(berthingDays) },
    { key: "other", amount: Math.round(other) }
  ].filter(l => l.amount);
  return { lines, total: lines.reduce((a, l) => a + l.amount, 0) };
}

/** Customs per discrepancy, by starport (book p.66). Per person or per ton of cargo. */
export const CUSTOMS = {
  A: { cargo: 5000, passengers: 1000, lackOfCrew: 2000 },
  B: { cargo: 4000, passengers: 800, lackOfCrew: 1800 },
  C: { cargo: 3000, passengers: 600, lackOfCrew: 1500 },
  D: { cargo: 2000, passengers: 400, lackOfCrew: 1000 },
  E: { cargo: 1000, passengers: 200, lackOfCrew: 500 },
  X: { cargo: 0, passengers: 0, lackOfCrew: 0 }
};
/** No starport: roll 1D for the equivalent starport (book p.66). */
export function customsStarport(d6) {
  return ["A", "B", "C", "D", "E", "E"][Math.max(1, Math.min(6, d6)) - 1];
}

/** Passage income per parsec (book p.68). */
export const PASSAGE = { low: 500, middle: 5000, high: 10000 };

/** Skipping (book p.72): allowed missed payments = SOC DM; caught on 2D + DMs >= 12, boxcars always. */
export const SKIP_STARPORT_DM = { A: 5, B: 4, C: 3, D: 2, E: 1, X: 0 };
export const SKIP_DISTANCE_DM = [{ key: "5pc", dm: -1 }, { key: "10pc", dm: -2 }, { key: "15pc", dm: -3 }, { key: "20pc", dm: -4 }, { key: "2subsectors", dm: -5 }, { key: "1sector", dm: -6 }];
/**
 * Skipping (book p.72): is the crew caught? 2D + starport DM + distance DM >= 12; boxcars always.
 * @param {number} natural  2D
 * @param {string} starport A-E or X
 * @param {number} [distanceDM]  from SKIP_DISTANCE_DM
 * @returns {boolean}
 */
export function skippingCaught(natural, starport, distanceDM = 0) {
  if (natural >= 12) return true;
  return natural + (SKIP_STARPORT_DM[starport] ?? 0) + (Number(distanceDM) || 0) >= 12;
}
/**
 * Missed payments allowed before the ship is repossessed: the owner's SOC DM (book p.72).
 * @param {number} socDM
 * @returns {number}
 */
export function allowedMissedPayments(socDM) {
  return Math.max(0, Number(socDM) || 0);
}

/** Hijack: when passengers board, 2D = 2 means an attempt (book p.72). */
export function hijackAttempt(natural) {
  return natural <= 2;
}

/**
 * Contaminated fuel (book p.72): drive checks take -2 DM. On a failure the drive steps down by
 * the failure margin; a natural 2 or less makes it critical (misjump for the J-Drive).
 */
export function contaminatedFuelResult(natural, total, target = 8) {
  if (natural <= 2) return { failed: true, steps: 0, critical: true };
  if (total >= target) return { failed: false, steps: 0, critical: false };
  return { failed: true, steps: target - total, critical: false };
}

/** Misjump (book p.72): 1D direction and 1D parsecs. */
export const MISJUMP_DIRECTIONS = ["spinCoreward", "coreward", "coreTrailing", "trailingRimward", "rimward", "rimSpinward"];
/**
 * Misjump result (book p.72). Called by jump (craft/travel.mjs).
 * @param {number} dirRoll   1D
 * @param {number} distRoll  1D
 * @returns {{direction: string, parsecs: number}}
 */
export function misjump(dirRoll, distRoll) {
  return { direction: MISJUMP_DIRECTIONS[Math.max(1, Math.min(6, dirRoll)) - 1], parsecs: Math.max(1, Math.min(6, distRoll)) };
}
