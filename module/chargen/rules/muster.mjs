/**
 * Mustering out (book p.20-22): the plan of mustering out rolls, the Material and Monetary
 * Benefits tables, pensions, and the final step. Pure: no Foundry globals.
 */
import {
  MATERIAL, MONETARY, MONETARY_CAP, BENEFIT_ITEMS, DISABILITY_PENSION, rankMusterRolls, commissionMusterDMs, pensionFor
} from "./careers.mjs";
import { askYesNo, upp } from "./state.mjs";
import { skillKey } from "./skills.mjs";

/**
 * The mustering out rolls of a career (p.16, p.20-21): one roll per term, alternating Material
 * (terms 1, 3, 5, 7+) and Monetary (terms 2, 4, 6), plus rank rolls and event rolls (the player
 * picks the table; Monetary at most three times), plus D3 cash rolls from injuries.
 */
export function planMuster(career) {
  const rolls = [];
  if (career.key === "prison") return { rolls, dmTokens: 0 };
  if (career.forfeit) {
    for (let i = 0; i < career.regained; i++) rolls.push({ column: null, reason: "regained" });
    return { rolls, dmTokens: 0 };
  }
  for (let t = 1; t <= career.terms; t++) rolls.push({ column: t % 2 === 0 && t <= 6 ? "cash" : "material", reason: `term ${t}` });
  const rankRolls = career.ranks ? rankMusterRolls(career.rank) : 0;
  for (let i = 0; i < rankRolls; i++) rolls.push({ column: null, reason: "rank" });
  for (let i = 0; i < career.extraMuster; i++) rolls.push({ column: null, reason: "event" });
  for (let i = 0; i < career.cashRolls; i++) rolls.push({ column: "cash", d3: true, reason: "injury" });
  const dmTokens = commissionMusterDMs(career.rank, career.commissioned) + career.musterDMs;
  return { rolls: career.cashOnly ? rolls.filter(r => r.column !== "material") : rolls, dmTokens };
}

/**
 * Mustering out steps, mixed into `Run` by engine.mjs. `this` is the run (see state.mjs).
 * `main()` in engine.mjs calls musterOut() after each career and finish() at the end.
 */
export const musterSteps = {
  /** Add the Monetary Benefits row `row` (1-7) of career `key` to the credits (p.21). */
  cash(key, row, why) {
    const r = Math.max(1, Math.min(7, row));
    const amount = MONETARY[key][r - 1];
    this.s.credits += amount;
    this.log(`${why}: ${amount}cr`, { kind: "gain" });
  },

  /** Apply the Material Benefits row `row` (1-7) of career `key` (p.21): items, characteristics, ships. */
  *material(key, row, why) {
    const s = this.s;
    const r = Math.max(1, Math.min(7, row));
    const b = MATERIAL[key][r - 1];
    switch (b.kind) {
      case "passage": this.addItem({ name: b.name, type: "gear", description: `A ticket for one ${b.name.toLowerCase()} (p.21).` }); return;
      case "char": this.changeChar(b.char, b.amount, why); return;
      case "blade": {
        const canSword = (s.skills["Melee Combat (Blade)"] ?? -1) >= 1;
        const pick = canSword ? yield* this.choose("blade", "Blade: choose a weapon.", [{ value: "sword", label: BENEFIT_ITEMS.sword.name, ask: true }, { value: "dagger", label: BENEFIT_ITEMS.dagger.name, ask: true }], "sword") : "dagger";
        this.addItem({ ...BENEFIT_ITEMS[pick] });
        return;
      }
      case "gun": {
        const guns = ["bodyPistol", "carbine", "energyPistol"].filter(k => s.skills[skillKey("Ranged Combat", BENEFIT_ITEMS[k].spec)] !== undefined);
        const pool = guns.length ? guns : ["bodyPistol"];
        const pick = yield* this.choose("gun", "Gun: choose a weapon (by your Ranged Combat training).", pool.map(k => ({ value: k, label: `${BENEFIT_ITEMS[k].name} (${BENEFIT_ITEMS[k].spec})` })), pool.at(-1));
        this.addItem({ ...BENEFIT_ITEMS[pick] });
        return;
      }
      case "sss":
        if (s.sss) { this.log("Already a Spacer Support Service member", { kind: "info" }); return; }
        s.sss = true;
        this.log("Gain Spacer Support Service (SSS) membership", { kind: "gain" });
        return;
      case "shares": {
        const d = yield* this.roll({ id: "shares", label: "Ship Shares (1D %)", n: 1, pause: false });
        s.shipShares += d.total;
        this.log(`Gain ${d.total}% Ship Shares (total ${s.shipShares}%)`, { kind: "gain" });
        return;
      }
      case "scoutShip": s.ships.scout += 10; this.log(`Gain a Scout Ship (age ${s.ships.scout} years)`, { kind: "gain" }); return;
      case "merchantShip": s.ships.merchant += 10; this.log(`Gain a Merchant Ship (age ${s.ships.merchant} years)`, { kind: "gain" }); return;
      default: this.log(`${why}: no benefit`, { kind: "info" });
    }
  },

  /** Step 4: roll the mustering out benefits of a career (p.20-21). */
  *musterOut(career) {
    const plan = planMuster(career);
    this.log(`Mustering out of the ${career.name}: ${plan.rolls.length} roll(s)`, { kind: "head" });
    if (!plan.rolls.length) { if (career.forfeit) this.log("No mustering out benefits (criminal record).", { kind: "loss" }); return; }
    let tokens = plan.dmTokens;
    // BOOK: p.20 allows "a maximum of three rolls" on the Monetary table "for terms 2, 4, and 6" and
    // says nothing about bonus rolls (rank, events, regained). We let the player put a bonus roll on
    // the Monetary table while the career used fewer than three Monetary rolls (MONETARY_CAP). The D3
    // cash rolls from injuries (p.18) are extra and do not count.
    let cashUsed = 0;
    for (let i = 0; i < plan.rolls.length; i++) {
      const p = plan.rolls[i];
      let column = p.column;
      if (!column) {
        const opts = [{ value: "material", label: "Material Benefits", ask: true }];
        if (cashUsed < MONETARY_CAP) opts.push({ value: "cash", label: `Monetary Benefits (${MONETARY_CAP - cashUsed} left)`, ask: true });
        if (career.cashOnly) opts.shift();
        if (!opts.length) continue;
        column = yield* this.choose("muster-column", `Bonus mustering roll ${i + 1}: choose a table.`, opts, opts.at(-1).value);
      }
      if (column === "cash" && !p.d3 && cashUsed >= MONETARY_CAP) column = "material";
      if (column === "material" && career.cashOnly) continue;
      let dm = 0;
      const remaining = plan.rolls.length - i;
      if (tokens > 0 && !p.d3) {
        const auto = column === "cash" || remaining <= tokens ? "yes" : "no";
        const use = yield* this.choose("muster-dm", `Apply a +1 DM to this roll (${tokens} left)?`, askYesNo(), auto);
        if (use === "yes") { dm = 1; tokens -= 1; }
      }
      const mods = [{ label: "Muster DM", value: dm }];
      if (column === "cash") mods.push({ label: "Cash DM", value: career.cashDM });
      const label = `${column === "cash" ? "Monetary" : "Material"} Benefits (${p.d3 ? "D3" : "1D"})${p.reason ? `, ${p.reason}` : ""}`;
      const r = yield* this.roll({ id: "muster", label, n: 1, sides: p.d3 ? 3 : 6, mods });
      if (column === "cash") { this.cash(career.key, r.total, "Monetary benefit"); if (!p.d3) cashUsed += 1; }
      else yield* this.material(career.key, r.total, "Material benefit");
    }
  },

  /** Step 5: pensions (p.22), the optional psionic test (p.114), and the end of the run. */
  *finish() {
    const s = this.s;
    const sources = [];
    for (const c of s.careers) {
      if (c.key === "prison") continue;
      // BOOK: prison (p.24, p.26) forfeits the mustering out rolls of the career but says nothing about
      // the pension (p.22); we still pay the pension of a career with 5+ terms.
      const p = pensionFor(c.terms);
      if (p) sources.push({ career: c.name, terms: c.terms, ...p });
    }
    if (s.disability) sources.push({ career: "Disability", terms: 5, ...DISABILITY_PENSION });
    if (sources.length) {
      const monthly = sources.reduce((a, p) => a + p.monthly, 0);
      const yearly = sources.reduce((a, p) => a + p.yearly, 0);
      const mode = yield* this.choose("pension", "Pension: monthly deposits or a yearly lump sum?", [{ value: "monthly", label: `Monthly ${monthly}cr`, ask: true }, { value: "yearly", label: `Yearly ${yearly}cr`, ask: true }], "monthly");
      s.pension = { monthly, yearly, mode, sources };
    }
    if (s.options.psionics && s.psi === null) {
      const go = yield* this.choose("psionics", "Test your psionic potential?", askYesNo(), "yes");
      if (go === "yes") yield* this.psionicTest("Psionic test");
    }
    s.status = "done";
    this.log(`Character complete: UPP ${upp(s)}, age ${s.age}, ${s.terms} terms, ${s.credits}cr`, { kind: "head" });
  }
};
