/**
 * Career terms (book p.16-20): choose a career, enlist or draft, serve terms (skills, survival,
 * promotion, commission, aging), the Injury Table, and reenlistment. Pure: no Foundry globals.
 */
import {
  CHAR_LABEL, PHYSICAL, CAREERS, CAREER_KEYS, DRAFT_SKILL, SKILL_TABLES, TABLE_KEYS, INJURY,
  tableRows, agingChecks, charDM
} from "./careers.mjs";
import { askYesNo } from "./state.mjs";

/** Chance (0-1) that 2D + dm >= target. */
function chance2D(target, dm) {
  let n = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + dm >= target) n++;
  return n / 36;
}

/**
 * Term steps of a run, mixed into `Run` by engine.mjs. `this` is the run (see state.mjs).
 * `main()` in engine.mjs calls chooseCareer, enlist, and serve; serve calls term each term.
 */
export const termSteps = {
  /** Option hint for a career: enlistment and survival targets. */
  careerHint(key) {
    const c = CAREERS[key];
    const dm = charDM(this.s.chars[c.enlist.dm]);
    return `enlist ${c.enlist.target}+ (INT DM ${dm >= 0 ? "+" : ""}${dm}), survival ${c.survival.target}+ ${CHAR_LABEL[c.survival.dm]}`;
  },

  /** Chance to enlist and survive the first term; the auto choice picks the best career. */
  enlistChance(key) {
    const c = CAREERS[key];
    return chance2D(c.enlist.target, charDM(this.s.chars[c.enlist.dm])) * chance2D(c.survival.target, charDM(this.s.chars[c.survival.dm]));
  },

  /**
   * Step 2: choose a career (p.16-17). mode "first" | "forced" (after a failed reenlistment or a
   * "leave", p.20) | "free" (may also stop). `exclude` is the career that the character failed to
   * reenlist in. Returns a career key or "stop".
   */
  *chooseCareer(mode, exclude) {
    const s = this.s;
    // Banned: the failed career, military careers after some events, and careers with a ban on
    // reenlistment (Warzone discharge, p.24).
    const keys = CAREER_KEYS.filter(k => k !== exclude && !s.bans.careers.includes(k) && !(CAREERS[k].military && (s.bans.military || s.bans.militaryEnlist)));
    const options = keys.map(k => ({ value: k, label: CAREERS[k].name, hint: this.careerHint(k) }));
    if (mode === "free") options.push({ value: "stop", label: "Start spacing", hint: "finish character creation" });
    if (!keys.length) return "stop";
    const auto = mode === "free" ? "stop" : [...keys].sort((a, b) => this.enlistChance(b) - this.enlistChance(a))[0];
    const prompt = mode === "forced" ? "Choose a new career for at least one term." : mode === "first" ? "Choose a career." : "Choose a new career, or start spacing.";
    return yield* this.choose("career", prompt, options.map(o => ({ ...o, ask: true })), auto);
  },

  /** Add a new career record to the state and return it. Also used for the prison record. */
  newCareer(key, drafted) {
    const c = CAREERS[key];
    const rec = {
      key, name: c.name, military: c.military, ranks: c.ranks, terms: 0, rank: 0, rankTitle: c.ranks ? c.ranks[0] : "",
      commissioned: false, drafted, commissionTried: false, survivalDM: 0, reenlistDM: 0, nextReenlistDM: 0, musterDMs: 0, cashDM: 0,
      extraMuster: 0, cashRolls: 0, forfeit: false, regained: 0, cashOnly: false, autoReenlist: false, ended: null, prison: false
    };
    this.s.careers.push(rec);
    return rec;
  },

  /** Step 2A: enlist, or be drafted on a failure (p.17-18). Returns the new career record. */
  *enlist(key, exclude) {
    const s = this.s;
    const c = CAREERS[key];
    const r = yield* this.roll({ id: "enlist", label: `Enlist in the ${c.name}`, mods: [{ label: "INT DM", value: charDM(s.chars.int) }], target: c.enlist.target });
    if (r.success) {
      this.log(`Enlisted in the ${c.name}`, { kind: "head" });
      return this.newCareer(key, false);
    }
    // Draft: 1D on the Draft row. Reroll a career the character may not serve in.
    for (let i = 0; i < 50; i++) {
      const d = yield* this.roll({ id: "draft", label: "Draft (1D)", n: 1 });
      const dk = CAREER_KEYS.find(k => CAREERS[k].draft === d.total);
      if (dk === exclude || (CAREERS[dk].military && s.bans.military) || s.bans.careers.includes(dk)) {
        this.log(`Cannot be drafted into the ${CAREERS[dk].name}; roll again`, { kind: "info" });
        continue;
      }
      this.log(`Drafted into the ${CAREERS[dk].name}`, { kind: "head" });
      return this.newCareer(dk, true);
    }
    return this.newCareer("civilian", true);
  },

  /** Serve terms until the career ends; step 3 reenlistment after each term (p.20). */
  *serve(career) {
    const s = this.s;
    while (true) {
      yield* this.term(career);
      if (s.status === "dead" || career.ended) return;
      const options = [];
      const canReenlist = !s.bans.retired && !s.bans.careers.includes(career.key);
      if (canReenlist) options.push({ value: "continue", label: career.autoReenlist ? "Continue (automatic reenlistment)" : `Reenlist (${CAREERS[career.key].reenlist}+)`, ask: true });
      if (!s.bans.retired) options.push({ value: "leave", label: "Leave and start a new career", ask: true });
      options.push({ value: "stop", label: "Muster out and start spacing", ask: true });
      const auto = canReenlist && s.terms < 4 ? "continue" : "stop";
      const choice = yield* this.choose("continue", `End of term ${s.terms} (age ${s.age}).`, options, auto);
      if (choice !== "continue") { career.ended = choice; return; }
      if (career.autoReenlist) { career.autoReenlist = false; this.log("Automatic reenlistment", { kind: "info" }); continue; }
      // reenlistDM: Major Injury, for the rest of the career (p.18). nextReenlistDM: events, this roll only.
      const mods = [{ label: "Injury DM", value: career.reenlistDM }, { label: "Event DM", value: career.nextReenlistDM }];
      const r = yield* this.roll({ id: "reenlist", label: `Reenlist in the ${career.name}`, mods, target: CAREERS[career.key].reenlist });
      if (!r.success) { career.ended = "failed"; this.log(`Failed to reenlist: must start a new career`, { kind: "loss" }); return; }
    }
  },

  /** One four-year term in a career (p.16 steps 2B-2E). */
  *term(career) {
    const s = this.s;
    const c = CAREERS[career.key];
    s.terms += 1;
    career.terms += 1;
    career.autoReenlist = false;
    career.nextReenlistDM = 0;   // an event DM applies to the reenlistment roll of its own term only
    this.log(`Term ${s.terms}: ${career.name}, term ${career.terms} (age ${s.age})`, { kind: "head" });

    // 2A / 2B1: enlistment or draft skill, and basic training in the first term ever.
    if (career.terms === 1) {
      if (career.drafted) yield* this.gainSkill(DRAFT_SKILL, null, "zero", "drafted");
      else if (s.careers.filter(x => x.key !== "prison").length === 1) yield* this.gainSkill(c.enlistSkill, null, "zero", "enlistment");
    }
    if (s.terms === 1) {
      for (const table of ["service", "education"]) {
        const rows = tableRows(table, career.key);
        const opts = rows.map((g, i) => ({ value: String(i), label: g.label }));
        const i = Number(yield* this.choose(`basic-${table}`, `Basic training: choose a ${SKILL_TABLES[table].name} skill at rank 0.`, opts.map(o => ({ ...o, ask: true })), "0"));
        yield* this.applyGain(rows[i], "zero", "basic training");
      }
    } else {
      // 2B: one roll on a skill table.
      const tables = TABLE_KEYS.filter(t => {
        const T = SKILL_TABLES[t];
        if (T.minEdu && s.chars.edu < T.minEdu) return false;
        if (T.commissioned && !career.commissioned) return false;
        return true;
      });
      const auto = tables.includes("advanced") ? "advanced" : "service";
      const table = yield* this.choose("table", "Choose a skill table.", tables.map(t => ({ value: t, label: SKILL_TABLES[t].name, hint: tableRows(t, career.key).map(g => g.label).join(", "), ask: true })), auto);
      const r = yield* this.roll({ id: "skill", label: `${SKILL_TABLES[table].name} (1D)`, n: 1 });
      yield* this.applyGain(tableRows(table, career.key)[r.total - 1], "plus", SKILL_TABLES[table].name);
    }

    // 2C: survival.
    const surv = yield* this.roll({
      id: "survival", label: `Survival (${c.survival.target}+)`, target: c.survival.target,
      mods: [{ label: `${CHAR_LABEL[c.survival.dm]} DM`, value: charDM(s.chars[c.survival.dm]) }, { label: "Injury DM", value: career.survivalDM }]
    });
    if (!surv.success) {
      const r = yield* this.roll({ id: "injury", label: "Injury Table (1D)", n: 1 });
      yield* this.injury(r.total, career);
      if (s.status === "dead") return;
    } else if (s.options.events) {
      yield* this.event(career);
      if (s.status === "dead") return;
    }

    // 2D: promotion and commission. Not in the first drafted term; not after a failed survival roll.
    const ended = career.ended && career.ended !== "retired";
    if (surv.success && !ended && c.promotion && !(career.drafted && career.terms === 1) && career.rank < career.ranks.length - 1) {
      const p = yield* this.roll({ id: "promotion", label: `Promotion (${c.promotion.target}+)`, target: c.promotion.target, mods: [{ label: `${CHAR_LABEL[c.promotion.dm]} DM`, value: charDM(s.chars[c.promotion.dm]) }] });
      if (p.success) {
        this.promote(career, "promotion");
        // 2D1: commission, once per career, in the first non-drafted term of the career.
        // BOOK: p.20 says one commission check per career but not when; we offer it only after a
        // successful promotion roll (step 2D1 follows 2D on p.16).
        const firstTerm = career.terms === (career.drafted ? 2 : 1);
        if (c.commission && !career.commissioned && !career.commissionTried && firstTerm) {
          const go = yield* this.choose("commission-try", `Attempt a commission (${c.commission.target}+, ${CHAR_LABEL[c.commission.dm]} DM)? Only one attempt per career.`, askYesNo(), "yes");
          if (go === "yes") {
            career.commissionTried = true;
            const r = yield* this.roll({ id: "commission", label: `Commission (${c.commission.target}+)`, target: c.commission.target, mods: [{ label: `${CHAR_LABEL[c.commission.dm]} DM`, value: charDM(s.chars[c.commission.dm]) }] });
            if (r.success) { career.commissioned = true; this.log("Commissioned as an officer", { kind: "gain" }); }
          }
        }
      }
    }

    // 2E: age four years; aging checks from age 34 (the end of term 4).
    yield* this.ageTerm();
  },

  /**
   * Step 2E: age four years, then the aging checks of the new age (p.20).
   * BOOK: p.20 says aging starts "at term 4"; p.16 says "age 34 or higher when starting this career
   * term" (term 5). We follow p.20 and the Aging table: checks at the end of term 4 (age 34).
   */
  *ageTerm() {
    this.s.age += 4;
    for (const a of agingChecks(this.s.age)) {
      const r = yield* this.roll({ id: "aging", label: `Aging: ${CHAR_LABEL[a.char]} (${a.target}+)`, target: a.target });
      if (!r.success) this.changeChar(a.char, -a.loss, "aging");
    }
  },

  /** Injury Table (p.18). `career` is null or the prison record in prison. */
  *injury(result, career) {
    const s = this.s;
    const row = Math.max(1, Math.min(6, result));
    const inj = INJURY[row];
    this.log(`Injury ${row}: ${inj.name}. ${inj.text}`, { kind: "loss" });
    const inService = career && career.key !== "prison";
    if (inj.death) {
      s.status = "dead";
      if (inService && career.military) this.log("Posthumous honourable promotion.", { kind: "info" });
      if (inService && !career.military && career.terms > 2) this.log(`The ${career.name} covers the funeral expenses.`, { kind: "info" });
      s.deathCause = `Died in service (${career?.name ?? "prison"}, term ${s.terms}).`;
      this.log(s.deathCause, { kind: "loss" });
      return;
    }
    const before = { ...s.chars };
    if (inj.d3All) {
      for (const c of PHYSICAL) { const d = yield* this.roll({ id: "injury-d3", label: `${CHAR_LABEL[c]} loss (D3)`, n: 1, sides: 3, pause: false }); this.changeChar(c, -d.total, "injury"); }
    }
    // BOOK: Severe Injury "-D3 to two physical Characteristics" (p.18) does not say which two; we roll
    // D3 for the spared one (1 STR, 2 DEX, 3 END), like the D3 random characteristic of the table.
    if (inj.d3Two) {
      const spared = yield* this.roll({ id: "injury-spared", label: "Unaffected characteristic (D3: STR, DEX, END)", n: 1, sides: 3, pause: false });
      for (const c of PHYSICAL.filter((_, i) => i !== spared.total - 1)) { const d = yield* this.roll({ id: "injury-d3", label: `${CHAR_LABEL[c]} loss (D3)`, n: 1, sides: 3, pause: false }); this.changeChar(c, -d.total, "injury"); }
    }
    if (inj.d3Random) {
      const w = yield* this.roll({ id: "injury-which", label: "Characteristic (D3: STR, DEX, END)", n: 1, sides: 3, pause: false });
      const d = yield* this.roll({ id: "injury-d3", label: "Loss (D3)", n: 1, sides: 3, pause: false });
      this.changeChar(PHYSICAL[w.total - 1], -d.total, "injury");
    }
    if (inj.minusAll) for (const c of PHYSICAL) this.changeChar(c, -1, "injury");
    if (inj.minusChoice) {
      const auto = [...PHYSICAL].sort((a, b) => s.chars[b] - s.chars[a])[0];
      const c = yield* this.choose("injury-char", "Minor injury: lose 1 from which characteristic?", PHYSICAL.map(k => ({ value: k, label: `${CHAR_LABEL[k]} (${s.chars[k]})`, ask: true })), auto);
      this.changeChar(c, -1, "injury");
    }
    if (!inService) return;
    // Major Injury: the reenlistment DM stays for the rest of this career (p.18 "current career").
    if (inj.reenlistDM) career.reenlistDM += inj.reenlistDM;
    if (inj.survivalDM) career.survivalDM += inj.survivalDM;
    if (inj.cashRolls) { career.cashRolls += inj.cashRolls; this.log(`Gain ${inj.cashRolls} D3 cash mustering roll(s)`, { kind: "gain" }); }
    if (inj.discharge) this.discharge(career, "discharged", inj.name);
    // Disability (p.18): a characteristic at 0 after an injury.
    if (PHYSICAL.some(c => s.chars[c] <= 0 && before[c] > 0)) {
      s.disability = true;
      if (!career.ended) career.ended = "disability";
      this.log("Disability: a characteristic reached 0. Removed from service with a disability pension (as 5 terms).", { kind: "loss" });
    }
  }
};
