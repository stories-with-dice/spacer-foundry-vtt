/**
 * Ship finances (book p.68-72): book costs, writing them to the ship, and paying a month.
 * `system.finances.maintenance` is the ANNUAL maintenance amount; it is paid every 12 months.
 */
import * as OPS from "./rules/operations.mjs";
import { L, card, credits } from "./common.mjs";

/** The four monthly cost fields that bookFinances fills. */
const BOOK_KEYS = ["mortgage", "crewSalaries", "lifeSupport", "maintenance"];

/**
 * Book values for the costs of a ship (book p.68-70): monthly mortgage, monthly crew salaries
 * (crew roles on the ship, else the mandatory positions), monthly life support, and the ANNUAL
 * maintenance (with `system.finances.maintenanceSurcharge`). Reads the actor; does not write.
 * Called by calculateFinances, payMonth, and the ship sheet.
 * @param {Actor} actor  ship
 * @returns {{mortgage: number, maintenance: number, crewSalaries: number, lifeSupport: number}}
 */
export function bookFinances(actor) {
  const s = actor.system;
  const roles = s.crew.map(c => c.role).filter(Boolean);
  const salaryRoles = roles.length ? roles : OPS.mandatoryPositions(s.tonnage);
  return {
    mortgage: OPS.monthlyMortgage(s.cost),
    maintenance: s.maintenance.annual,
    crewSalaries: OPS.crewSalaries(salaryRoles),
    lifeSupport: OPS.lifeSupportCost(s.staterooms)
  };
}

/**
 * Write the book values into `system.finances` (keeps the bank and the fuel budget).
 * Called by the ship sheet "Book values" button.
 * Example: 100T scout costing 30Mcr: finances.mortgage 0 -> 125,000.
 * @param {Actor} actor  ship
 * @returns {Promise<object>} the values written
 */
export async function calculateFinances(actor) {
  const f = bookFinances(actor);
  await actor.update(Object.fromEntries(Object.entries(f).map(([k, v]) => [`system.finances.${k}`, v])));
  return f;
}

/** The bill table and bank lines of the pay-month card. */
function billBody(bill, bank, late) {
  const rows = bill.lines.map(l => `<tr><td>${L(`Finance.${l.key}`)}</td><td class="num">${credits(l.amount)}</td></tr>`).join("");
  return `<table>${rows}<tr class="total"><td>${L("Finance.total")}</td><td class="num">${credits(bill.total)}</td></tr></table>`
    + `<p>${L("Finance.bankNow", { bank: credits(bank) })}</p>${bank < 0 ? `<p class="warn">${L("Finance.overdrawn")}</p>` : ""}`
    + (late ? `<p class="warn">${L("Finance.maintenanceLate")}</p>` : "");
}

/**
 * Pay one month of costs from the ship's bank (book p.70): mortgage, crew salaries, life support,
 * fuel budget, berthing, and the annual maintenance when it is due (every 12 months, or when
 * `maintenance: true`). Writes `system.finances.bank`, `system.finances.monthsSinceMaintenance`
 * (lack of maintenance: -1 DM per month late, p.72), and `system.finances.mortgagePaid`.
 * Called by the ship sheet "Pay month" button.
 * Example: bank 1,000,000, bill 145,100 -> bank 854,900; monthsSinceMaintenance 0 -> 1.
 * @param {Actor} actor  ship
 * @param {{berthingDays?: number, maintenance?: "auto"|boolean, other?: number, chat?: boolean}} [o]
 * @returns {Promise<{lines: object[], total: number, bank: number, maintenanceDue: boolean}>}
 */
export async function payMonth(actor, { berthingDays = 0, maintenance = "auto", other = 0, chat = true } = {}) {
  const s = actor.system;
  // A ship whose finances were never filled in pays the book values (p.68-70).
  const f = BOOK_KEYS.every(k => !s.finances[k]) ? { ...s.finances, ...bookFinances(actor) } : s.finances;
  const months = s.maintenance.months;
  const due = maintenance === "auto" ? months + 1 >= 12 : !!maintenance;
  const bill = OPS.monthlyBill({ mortgage: f.mortgage, crewSalaries: f.crewSalaries, lifeSupport: f.lifeSupport, fuelCost: f.fuelCost, maintenance: f.maintenance, maintenanceDue: due, berthingDays, other });
  const bank = f.bank - bill.total;
  await actor.update({
    "system.finances.bank": bank,
    "system.finances.monthsSinceMaintenance": due ? 0 : months + 1,
    "system.finances.mortgagePaid": s.finances.mortgagePaid + (f.mortgage > 0 ? 1 : 0)
  });
  if (chat) await card({ actor, title: L("Finance.payMonthTitle", { name: actor.name }), body: billBody(bill, bank, !due && months + 1 >= 12) });
  return { ...bill, bank, maintenanceDue: due };
}
