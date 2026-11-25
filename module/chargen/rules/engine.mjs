/**
 * Lifepath character creation engine (book p.16-29, p.114). Pure and deterministic: no Foundry
 * globals. The procedure is a generator that yields a request each time it needs input:
 *
 *   { type: "choice", id, prompt, options: [{ value, label, hint? }], auto }   the player picks
 *   { type: "roll", id, label, dice, mods: [{ label, value }], target }       the player rolls
 *
 * `Lifepath` drives the generator. It records every response and every die on a tape, so it can
 * undo a step by replaying the tape. Inject `dice(sides) -> 1..sides` to script rolls in tests.
 */
import {
  CHARS, PHYSICAL, CHAR_LABEL, SPECIALTIES, CAREERS, CAREER_KEYS, DRAFT_SKILL, SKILL_TABLES, TABLE_KEYS,
  tableRows, civilianSkills, parseSkill, INJURY, rankMusterRolls, commissionMusterDMs, agingChecks, MATERIAL,
  MONETARY, MONETARY_CAP, BENEFIT_ITEMS, pensionFor, DISABILITY_PENSION, MILITARY_EVENTS, CIVIL_EVENTS,
  UNIQUE_EVENTS, WAR_HERO_CHAR, LOCAL_HERO_CHAR, PRISON_EVENTS, charDM, hex
} from "./careers.mjs";

export const MAX_SKILL_RANK = 5;
const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

/** Default dice: Math.random. */
export function randomDice(sides) { return 1 + Math.floor(Math.random() * sides); }

/** A seeded dice function (mulberry32), for reproducible runs. */
export function seededDice(seed = 1) {
  let a = seed >>> 0;
  return sides => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return 1 + Math.floor(r * sides);
  };
}

/** Fresh character state. */
export function newState() {
  return {
    options: { events: false, psionics: false },
    chars: { str: 0, dex: 0, end: 0, int: 0, edu: 0, soc: 0 },
    rolled: null,
    psi: null,
    age: 18,
    terms: 0,
    careers: [],
    skills: {},
    credits: 0,
    debt: 0,
    items: [],
    relations: [],
    shipShares: 0,
    ships: { scout: 0, merchant: 0 },
    sss: false,
    pension: { monthly: 0, yearly: 0, mode: "", sources: [] },
    disability: false,
    bans: { military: false, militaryEnlist: false, retired: false, careers: [] },
    status: "active",
    deathCause: "",
    log: []
  };
}

/* ------------------------------------------------------------------ skills */

export function skillKey(skill, specialty = "") { return specialty ? `${skill} (${specialty})` : skill; }
export function splitSkillKey(key) {
  const m = String(key).match(/^(.*?)\s*\((.*)\)$/);
  return m ? { skill: m[1], specialty: m[2] } : { skill: key, specialty: "" };
}
export function isSpecialised(skill) { return !!SPECIALTIES[skill]; }

/** Sorted skill list: [{ skill, specialty, rank, key }]. */
export function skillList(s) {
  return Object.entries(s.skills).map(([key, rank]) => ({ ...splitSkillKey(key), rank, key }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** "Melee Combat 0 (Blade 1), Pilot 1" */
export function skillText(s) {
  const groups = new Map();
  for (const e of skillList(s)) {
    if (!groups.has(e.skill)) groups.set(e.skill, { base: null, specs: [] });
    const g = groups.get(e.skill);
    if (e.specialty) g.specs.push(`${e.specialty} ${e.rank}`); else g.base = e.rank;
  }
  return [...groups.entries()].map(([name, g]) => {
    const base = g.base === null ? name : `${name} ${g.base}`;
    return g.specs.length ? `${base} (${g.specs.join(", ")})` : base;
  }).join(", ");
}

export function upp(s) { return CHARS.map(c => hex(s.chars[c])).join(""); }

/* ------------------------------------------------------------------ engine */

class Run {
  constructor(draw) {
    this.draw = draw;
    this.s = newState();
  }

  /* ---------- helpers */

  get career() { return this.s.careers.at(-1) ?? null; }

  log(text, extra = {}) { this.s.log.push({ term: this.s.terms, age: this.s.age, text, ...extra }); }

  /** Roll `n` dice of `sides`, with optional pause for the player. Returns { faces, natural, total, success }. */
  *roll({ id, label, n = 2, sides = 6, mods = [], target = null, mult = 1, pause = true, note = "" }) {
    const diceLabel = `${n === 1 && sides === 3 ? "D3" : `${n}D${sides === 6 ? "" : sides}`}${mult !== 1 ? ` x ${mult}` : ""}`;
    mods = mods.filter(m => m && m.value);
    if (pause) yield { type: "roll", id, label, dice: diceLabel, mods, target };
    const faces = [];
    for (let i = 0; i < n; i++) faces.push(this.draw(sides));
    const natural = faces.reduce((a, b) => a + b, 0);
    const total = natural * mult + mods.reduce((a, m) => a + m.value, 0);
    const success = target === null ? null : total >= target;
    this.log(label, { kind: "roll", roll: { dice: diceLabel, faces, natural, mods, total, target, success, note } });
    return { faces, natural, total, success };
  }

  /** A player choice. `options`: [{ value, label, hint }]. Returns the chosen value. */
  *choose(id, prompt, options, auto) {
    if (!options.length) throw new Error(`No options for ${id}`);
    if (options.length === 1 && !options[0].ask) return options[0].value;
    const value = yield { type: "choice", id, prompt, options, auto: auto ?? options[0].value };
    const opt = options.find(o => o.value === value);
    if (!opt) throw new Error(`Invalid choice "${value}" for ${id}`);
    this.log(`${prompt} ${opt.label}`, { kind: "choice" });
    return value;
  }

  /** 2D + characteristic DM >= target (book p.24 "Roll 8+ on a STR check"). */
  *check(id, label, char, target = 8, extra = []) {
    return yield* this.roll({ id, label: `${label} (${CHAR_LABEL[char]} ${target}+)`, mods: [{ label: `${CHAR_LABEL[char]} DM`, value: charDM(this.s.chars[char]) }, ...extra], target });
  }

  changeChar(char, delta, why = "") {
    const before = this.s.chars[char];
    this.s.chars[char] = Math.max(0, before + delta);
    this.log(`${CHAR_LABEL[char]} ${delta >= 0 ? "+" : ""}${delta}${why ? ` (${why})` : ""}: ${before} -> ${this.s.chars[char]}`, { kind: "char" });
  }

  relation(type, note = "") {
    this.s.relations.push({ type, note });
    this.log(`Gain ${type === "Ally" || type === "Enemy" ? "an" : "a"} ${type}${note ? ` (${note})` : ""}`, { kind: "gain" });
  }

  *loseAllyOrContact() {
    const types = ["Ally", "Contact"].filter(t => this.s.relations.some(r => r.type === t));
    if (!types.length) return false;
    const type = yield* this.choose("lose-relation", "Lose which?", types.map(t => ({ value: t, label: t })), types.at(-1));
    const i = this.s.relations.findIndex(r => r.type === type);
    this.s.relations.splice(i, 1);
    this.log(`Lose a ${type}`, { kind: "loss" });
    return true;
  }

  addItem(item) {
    const found = this.s.items.find(i => i.name === item.name);
    if (found) found.quantity += 1;
    else this.s.items.push({ type: "gear", quantity: 1, lookup: [item.name], ...item });
    this.log(`Gain ${item.name}`, { kind: "gain" });
  }

  /**
   * Gain a skill (p.18, p.28). mode "zero": rank 0 (basic training, enlistment). mode "plus": rank 1 or
   * +1. A specialised skill gained past rank 0 needs a specialty: the player picks one of `specs`.
   */
  *gainSkill(skill, specs = null, mode = "plus", why = "") {
    const sk = this.s.skills;
    if (mode === "zero") {
      const min = skill === "Jack-of-All-Trades" ? 1 : 0;   // JoAT starts at rank 1 (p.29)
      if (sk[skill] === undefined || sk[skill] < min) {
        sk[skill] = min;
        this.log(`Gain ${skill} ${min}${why ? ` (${why})` : ""}`, { kind: "gain" });
      } else this.log(`Already has ${skill} ${sk[skill]}${why ? ` (${why})` : ""}`, { kind: "info" });
      return skill;
    }
    if (isSpecialised(skill)) {
      const all = SPECIALTIES[skill];
      const opts = (specs?.length ? specs : all).filter(sp => (sk[skillKey(skill, sp)] ?? 0) < MAX_SKILL_RANK);
      const pool = opts.length ? opts : (specs?.length ? specs : all);
      const auto = [...pool].sort((a, b) => (sk[skillKey(skill, b)] ?? -1) - (sk[skillKey(skill, a)] ?? -1))[0];
      const spec = yield* this.choose("specialty", `${skill}: choose a specialty.`,
        pool.map(sp => ({ value: sp, label: sp, hint: sk[skillKey(skill, sp)] !== undefined ? `now ${sk[skillKey(skill, sp)]}` : "new" })), auto);
      if (sk[skill] === undefined) sk[skill] = 0;
      const key = skillKey(skill, spec);
      sk[key] = Math.min(MAX_SKILL_RANK, sk[key] === undefined ? 1 : sk[key] + 1);
      this.log(`Gain ${skill} (${spec}) ${sk[key]}${why ? ` (${why})` : ""}`, { kind: "gain" });
      return key;
    }
    sk[skill] = Math.min(MAX_SKILL_RANK, sk[skill] === undefined ? 1 : sk[skill] + 1);
    this.log(`Gain ${skill} ${sk[skill]}${why ? ` (${why})` : ""}`, { kind: "gain" });
    return skill;
  }

  /** Apply a skill table row: a characteristic increase or a skill. */
  *applyGain(g, mode, why) {
    if (g.char) { this.changeChar(g.char, g.amount, why); return; }
    yield* this.gainSkill(g.skill, g.specs, mode, why);
  }

  /** Increase one known skill by +1 (events). `filter` picks which known skills qualify. */
  *improveKnown(why, filter = null) {
    const known = skillList(this.s).filter(e => e.rank < MAX_SKILL_RANK || isSpecialised(e.skill));
    let pool = filter ? filter(known) : known;
    if (!pool.length) pool = known;
    if (!pool.length) return;
    const auto = [...pool].sort((a, b) => b.rank - a.rank)[0].key;
    const key = yield* this.choose("improve-skill", "Choose a skill to improve.",
      pool.map(e => ({ value: e.key, label: `${e.key} ${e.rank}` })), auto);
    const { skill, specialty } = splitSkillKey(key);
    if (isSpecialised(skill) && !specialty) yield* this.gainSkill(skill, null, "plus", why);
    else {
      this.s.skills[key] = Math.min(MAX_SKILL_RANK, this.s.skills[key] + 1);
      this.log(`Gain ${key} ${this.s.skills[key]} (${why})`, { kind: "gain" });
    }
  }

  promote(career, why) {
    if (!career.ranks) { this.log(`${why}: no ranks in this career`, { kind: "info" }); return; }
    if (career.rank >= career.ranks.length - 1) { this.log(`${why}: already at the top rank`, { kind: "info" }); return; }
    career.rank += 1;
    career.rankTitle = career.ranks[career.rank];
    this.log(`Promoted to rank ${career.rank}, ${career.rankTitle} (${why})`, { kind: "gain" });
  }

  sendToPrison(career, why) {
    career.ended = "prison";
    career.forfeit = true;
    career.prison = true;
    this.log(`${why}: sent to prison. No mustering out benefits from ${career.name}.`, { kind: "loss" });
  }

  discharge(career, how = "discharged", why = "") {
    if (!career || career.key === "prison") return;
    if (!career.ended) career.ended = how;
    this.log(`${why ? `${why}: ` : ""}${how === "fired" ? "fired from" : "discharged from"} ${career.name}`, { kind: "loss" });
  }

  /* ---------- procedure */

  *main() {
    const s = this.s;
    s.options.events = (yield* this.choose("opt-events", "Use the optional life events (p.24-27)?", YES_NO.map(o => ({ ...o, ask: true })), "no")) === "yes";
    s.options.psionics = (yield* this.choose("opt-psionics", "Allow a psionic potential test at the end (p.114)?", YES_NO.map(o => ({ ...o, ask: true })), "no")) === "yes";

    // Step 1: characteristics, 2D each (p.16).
    yield { type: "roll", id: "characteristics", label: "Characteristics (2D each)", dice: "2D x 6", mods: [], target: null };
    for (const c of CHARS) {
      const r = yield* this.roll({ id: `char-${c}`, label: CHAR_LABEL[c], pause: false });
      s.chars[c] = r.total;
    }
    s.rolled = { ...s.chars };
    this.log(`UPP ${upp(s)}`, { kind: "head" });

    let mode = "first";   // first | forced | free
    let exclude = null;
    while (true) {
      const key = yield* this.chooseCareer(mode, exclude);
      if (key === "stop") break;
      const career = yield* this.enlist(key, exclude);
      yield* this.serve(career);
      if (s.status === "dead") return;
      if (career.prison) {
        const sentence = yield* this.roll({ id: "sentence", label: "Prison sentence (D3 terms)", n: 1, sides: 3 });
        yield* this.prison(sentence.total, career);
        if (s.status === "dead") return;
      }
      yield* this.musterOut(career);
      if (s.bans.retired || career.ended === "stop") break;
      if (career.ended === "failed") { mode = "forced"; exclude = career.key; }
      else if (career.ended === "leave") { mode = "forced"; exclude = null; }
      else { mode = "free"; exclude = null; }
    }
    yield* this.finish();
  }

  careerHint(key) {
    const c = CAREERS[key];
    const dm = charDM(this.s.chars[c.enlist.dm]);
    return `enlist ${c.enlist.target}+ (INT DM ${dm >= 0 ? "+" : ""}${dm}), survival ${c.survival.target}+ ${CHAR_LABEL[c.survival.dm]}`;
  }

  enlistChance(key) {
    const c = CAREERS[key];
    const p = (target, dm) => { let n = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + dm >= target) n++; return n / 36; };
    return p(c.enlist.target, charDM(this.s.chars[c.enlist.dm])) * p(c.survival.target, charDM(this.s.chars[c.survival.dm]));
  }

  *chooseCareer(mode, exclude) {
    const s = this.s;
    const keys = CAREER_KEYS.filter(k => k !== exclude && !(CAREERS[k].military && (s.bans.military || s.bans.militaryEnlist)));
    const options = keys.map(k => ({ value: k, label: CAREERS[k].name, hint: this.careerHint(k) }));
    if (mode === "free") options.push({ value: "stop", label: "Start spacing", hint: "finish character creation" });
    if (!keys.length) return "stop";
    const auto = mode === "free" ? "stop" : [...keys].sort((a, b) => this.enlistChance(b) - this.enlistChance(a))[0];
    const prompt = mode === "forced" ? "Choose a new career for at least one term." : mode === "first" ? "Choose a career." : "Choose a new career, or start spacing.";
    return yield* this.choose("career", prompt, options.map(o => ({ ...o, ask: true })), auto);
  }

  newCareer(key, drafted) {
    const c = CAREERS[key];
    const rec = {
      key, name: c.name, military: c.military, ranks: c.ranks, terms: 0, rank: 0, rankTitle: c.ranks ? c.ranks[0] : "",
      commissioned: false, drafted, commissionTried: false, survivalDM: 0, reenlistDM: 0, musterDMs: 0, cashDM: 0,
      extraMuster: 0, cashRolls: 0, forfeit: false, regained: 0, cashOnly: false, autoReenlist: false, ended: null, prison: false
    };
    this.s.careers.push(rec);
    return rec;
  }

  /** Step 2A: enlist, or be drafted on a failure (p.17-18). */
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
  }

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
      const r = yield* this.roll({ id: "reenlist", label: `Reenlist in the ${career.name}`, mods: [{ label: "Event DM", value: career.reenlistDM }], target: CAREERS[career.key].reenlist });
      if (!r.success) { career.ended = "failed"; this.log(`Failed to reenlist: must start a new career`, { kind: "loss" }); return; }
    }
  }

  /** One four-year term in a career (p.16 steps 2B-2E). */
  *term(career) {
    const s = this.s;
    const c = CAREERS[career.key];
    s.terms += 1;
    career.terms += 1;
    career.autoReenlist = false;
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
        const firstTerm = career.terms === (career.drafted ? 2 : 1);
        if (c.commission && !career.commissioned && !career.commissionTried && firstTerm) {
          const go = yield* this.choose("commission-try", `Attempt a commission (${c.commission.target}+, ${CHAR_LABEL[c.commission.dm]} DM)? Only one attempt per career.`, YES_NO.map(o => ({ ...o, ask: true })), "yes");
          if (go === "yes") {
            career.commissionTried = true;
            const r = yield* this.roll({ id: "commission", label: `Commission (${c.commission.target}+)`, target: c.commission.target, mods: [{ label: `${CHAR_LABEL[c.commission.dm]} DM`, value: charDM(s.chars[c.commission.dm]) }] });
            if (r.success) { career.commissioned = true; this.log("Commissioned as an officer", { kind: "gain" }); }
          }
        }
      }
    }

    // 2E: age four years; aging checks from age 34 (term 4).
    yield* this.ageTerm();
  }

  *ageTerm() {
    this.s.age += 4;
    for (const a of agingChecks(this.s.age)) {
      const r = yield* this.roll({ id: "aging", label: `Aging: ${CHAR_LABEL[a.char]} (${a.target}+)`, target: a.target });
      if (!r.success) this.changeChar(a.char, -a.loss, "aging");
    }
  }

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

  /* ---------- life events (p.24-27) */

  *event(career) {
    const military = career.military;
    const r = yield* this.roll({ id: "event", label: `${military ? "Military" : "Non-Military"} Life Event (1D)`, n: 1, mods: [{ label: "Term DM", value: career.terms - 1 }] });
    const n = Math.min(13, Math.max(1, r.total));
    const name = (military ? MILITARY_EVENTS : CIVIL_EVENTS)[n];
    this.log(`Event: ${name}`, { kind: "event" });
    if (n === 13) return yield* this.unique(career);
    return military ? yield* this.militaryEvent(n, career) : yield* this.civilEvent(n, career);
  }

  *ptsd() {
    const w = yield* this.roll({ id: "ptsd", label: "PTSD: characteristic (D3: INT, EDU, SOC)", n: 1, sides: 3, pause: false });
    const d = yield* this.roll({ id: "ptsd-d3", label: "PTSD loss (D3)", n: 1, sides: 3, pause: false });
    this.changeChar(["int", "edu", "soc"][w.total - 1], -d.total, "PTSD");
  }

  /** Lawyer for a trial (p.24, p.26): 1D x 1000cr, +D3 DM. Must have the money. */
  *lawyer() {
    if (this.s.credits < 1000) return 0;
    const go = yield* this.choose("lawyer", `Hire a lawyer for 1D x 1000cr (you have ${this.s.credits}cr)? Gives +D3 DM.`, YES_NO.map(o => ({ ...o, ask: true })), "yes");
    if (go !== "yes") return 0;
    const cost = yield* this.roll({ id: "lawyer-cost", label: "Lawyer cost (1D x 1000cr)", n: 1, mult: 1000, pause: false });
    if (cost.total > this.s.credits) { this.log("You cannot pay the lawyer.", { kind: "info" }); return 0; }
    this.s.credits -= cost.total;
    const bonus = yield* this.roll({ id: "lawyer-dm", label: "Lawyer DM (D3)", n: 1, sides: 3, pause: false });
    return bonus.total;
  }

  *militaryEvent(n, career) {
    const s = this.s;
    switch (n) {
      case 1: // Chewed Up and Spat Out
        this.discharge(career, "discharged", "Chewed Up and Spat Out");
        s.bans.militaryEnlist = true;
        this.log("You can only enter military service again if drafted.", { kind: "info" });
        return;
      case 2: { // Voluntold
        const go = yield* this.choose("voluntold", "Volunteer for the hard labour mission? (No: -2 DM to reenlist)", YES_NO.map(o => ({ ...o, ask: true })), "no");
        if (go === "no") { career.reenlistDM -= 2; this.log("Reenlistment -2 DM", { kind: "loss" }); return; }
        const r = yield* this.check("event-check", "Voluntold", "str");
        if (r.success) this.changeChar("str", 1, "Voluntold");
        else { const i = yield* this.roll({ id: "injury", label: "Injury Table (D3+3)", n: 1, sides: 3, mods: [{ label: "+3", value: 3 }] }); yield* this.injury(i.total, career); }
        return;
      }
      case 3: { // Up for Promotion
        const was = career.rank;
        this.promote(career, "Up for Promotion");
        if (was >= 1 && !career.commissioned && career.ranks) { career.commissioned = true; this.log("Automatically commissioned", { kind: "gain" }); }
        return;
      }
      case 4: { // Espionage
        const go = yield* this.choose("espionage", "Leak secrets for money? (INT 8+; failure means prison)", YES_NO.map(o => ({ ...o, ask: true })), "no");
        if (go === "no") { this.log("You refuse the offer.", { kind: "info" }); return; }
        const r = yield* this.check("event-check", "Espionage", "int");
        if (r.success) {
          const cash = yield* this.roll({ id: "cash", label: "Payment (2D x 2000cr)", mult: 2000, pause: false });
          s.credits += cash.total;
          this.log(`Gain ${cash.total}cr`, { kind: "gain" });
          this.relation("Contact", "espionage client");
        } else this.sendToPrison(career, "Espionage");
        return;
      }
      case 5: { // Warzone
        const r = yield* this.check("event-check", "Warzone", "dex");
        if (r.total >= 12) { this.promote(career, "heroism"); yield* this.improveKnown("Warzone"); }
        else if (r.total >= 8) yield* this.improveKnown("Warzone");
        else if (r.total >= 3) {
          const i = yield* this.roll({ id: "injury", label: "Injury Table (1D+1)", n: 1, mods: [{ label: "+1", value: 1 }] });
          yield* this.injury(i.total, career);
          yield* this.improveKnown("Warzone");
          this.discharge(career, "discharged", "Warzone");
          if (!s.bans.careers.includes(career.key)) s.bans.careers.push(career.key);
        } else {
          s.status = "dead";
          s.deathCause = `Killed in battle (${career.name}, term ${s.terms}); posthumous promotion, buried with honours.`;
          this.log(s.deathCause, { kind: "loss" });
        }
        return;
      }
      case 6: { // Honor Duel
        const r = yield* this.check("event-check", "Honor Duel", "dex");
        if (r.total >= 12) { this.promote(career, "Honor Duel"); this.relation("Enemy", "the officer you injured"); }
        else if (r.total >= 8) { this.promote(career, "Honor Duel"); this.relation("Rival", "the defeated officer"); }
        else if (r.total >= 3) {
          const i = yield* this.roll({ id: "injury", label: "Injury Table (D3+3)", n: 1, sides: 3, mods: [{ label: "+3", value: 3 }] });
          yield* this.injury(i.total, career);
          this.relation("Rival", "the officer who beat you");
        } else {
          const i = yield* this.roll({ id: "injury", label: "Injury Table (D3)", n: 1, sides: 3 });
          yield* this.injury(i.total, career);
          if (s.status !== "dead") this.relation("Enemy", "the officer who beat you");
        }
        return;
      }
      case 7: { // Extracurricular Training
        const r = yield* this.check("event-check", "Extracurricular Training", "edu");
        if (r.success) {
          yield* this.improveKnown("Extracurricular Training", known => { const min = Math.min(...known.map(e => e.rank)); return known.filter(e => e.rank === min); });
        } else {
          yield* this.improveKnown("Extracurricular Training");
          if (!(yield* this.loseAllyOrContact())) this.relation("Rival");
        }
        return;
      }
      case 8: { // Peacekeeper
        const r = yield* this.check("event-check", "Peacekeeper", "edu");
        if (r.success) {
          const list = civilianSkills();
          const auto = list.find(k => s.skills[k] === undefined) ?? list[0];
          const skill = yield* this.choose("civilian-skill", "Peacekeeper: earn a Civilian skill at rank 0, or +1 to one you have.", list.map(k => ({ value: k, label: k, hint: s.skills[k] !== undefined ? `now ${s.skills[k]}` : "new at 0", ask: true })), auto);
          yield* this.gainSkill(skill, null, s.skills[skill] === undefined ? "zero" : "plus", "Peacekeeper");
        } else {
          const i = yield* this.roll({ id: "injury", label: "Injury Table (1D)", n: 1 });
          yield* this.injury(i.total, career);
        }
        return;
      }
      case 9: { // Court Martial
        const bonus = yield* this.lawyer();
        const r = yield* this.check("event-check", "Court Martial trial", "soc", 8, [{ label: "Lawyer", value: bonus }]);
        if (r.success) { career.autoReenlist = true; this.log("Cleared: automatic reenlistment next term", { kind: "gain" }); }
        else if (r.total <= 2) { s.status = "dead"; s.deathCause = `Executed without honours (${career.name}, term ${s.terms}).`; this.log(s.deathCause, { kind: "loss" }); }
        else this.sendToPrison(career, "Court Martial");
        return;
      }
      case 10: { // Shell-Shocked
        yield* this.loseAllyOrContact();
        const r = yield* this.check("event-check", "Shell-Shocked", "end");
        if (r.success) this.changeChar("end", 1, "Shell-Shocked");
        else {
          yield* this.ptsd();
          this.discharge(career, "discharged", "Medical discharge");
          s.bans.military = true;
          this.log("You cannot enlist in any military career.", { kind: "info" });
        }
        return;
      }
      case 11: { // War Hero
        const char = career.commissioned ? "edu" : WAR_HERO_CHAR[career.key];
        const r = yield* this.check("event-check", "War Hero", char);
        this.promote(career, "War Hero");
        if (r.success) { career.musterDMs += 1; this.log("+1 DM to one mustering out roll", { kind: "gain" }); }
        else { const i = yield* this.roll({ id: "injury", label: "Injury Table (D3)", n: 1, sides: 3 }); yield* this.injury(i.total, career); }
        return;
      }
      case 12: { // Career Soldier
        const how = yield* this.choose("orders", "Follow orders (INT 8+) or defy orders (SOC 8+)?", [{ value: "follow", label: "Follow orders", ask: true }, { value: "defy", label: "Defy orders", ask: true }], "follow");
        if (how === "follow") {
          const r = yield* this.check("event-check", "Follow orders", "int");
          this.promote(career, "Career Soldier");
          if (r.success) { this.relation("Enemy", "a surviving comrade"); this.relation("Contact", "high command"); }
          else { const i = yield* this.roll({ id: "injury", label: "Injury Table (D3)", n: 1, sides: 3 }); yield* this.injury(i.total, career); }
        } else {
          const r = yield* this.check("event-check", "Defy orders", "soc");
          if (r.success) { this.promote(career, "Career Soldier"); career.reenlistDM -= 2; this.log("Reenlistment -2 DM", { kind: "loss" }); this.relation("Rival", "the demoted superior"); }
          else {
            const t = yield* this.check("event-check", "Court Martial", "soc");
            if (t.success) this.discharge(career, "discharged", "Court Martial");
            else this.sendToPrison(career, "Dishonourable discharge");
            this.relation("Ally", "a former comrade");
            this.relation("Enemy", "the demoted officer");
          }
        }
        return;
      }
    }
  }

  *civilEvent(n, career) {
    const s = this.s;
    switch (n) {
      case 1: { // Severe Illness
        const r = yield* this.check("event-check", "Severe Illness", "end");
        if (!r.success) this.discharge(career, "fired", "Severe Illness");
        return;
      }
      case 2: { // Inheritance
        const k = yield* this.roll({ id: "inherit-kind", label: "Inheritance: odd material (Merchant), even cash (Civilian)", n: 1 });
        const r = yield* this.roll({ id: "inherit", label: "Inheritance (1D+1)", n: 1, mods: [{ label: "+1", value: 1 }] });
        if (k.total % 2) yield* this.material("merchants", r.total, "Inheritance");
        else this.cash("civilian", r.total, "Inheritance");
        return;
      }
      case 3: { // Management
        const r = yield* this.check("event-check", "Management", "int");
        if (r.success) { career.musterDMs += 1; this.log("+1 DM to one mustering out roll", { kind: "gain" }); }
        else this.discharge(career, "fired", "Management");
        return;
      }
      case 4: { // Romantic Interest
        const r = yield* this.check("event-check", "Romantic Interest", "edu");
        if (r.success) { this.changeChar("soc", 1, "Romantic Interest"); this.relation("Ally", "partner"); }
        else { this.changeChar("soc", -1, "Romantic Interest"); this.relation("Enemy", "former partner"); }
        return;
      }
      case 5: { // On Strike
        const how = yield* this.choose("strike", "Labour strike: refuse to strike (DEX 8+) or join the struggle (SOC 8+)?", [{ value: "refuse", label: "Refuse to strike", ask: true }, { value: "join", label: "Join the struggle", ask: true }], "join");
        if (how === "refuse") {
          const r = yield* this.check("event-check", "Not caught", "dex");
          if (r.success) {
            const cash = yield* this.roll({ id: "cash", label: "Pay (1D x 2000cr)", n: 1, mult: 2000, pause: false });
            s.credits += cash.total;
            this.log(`Gain ${cash.total}cr`, { kind: "gain" });
            career.musterDMs += 1;
            career.autoReenlist = true;
            if (career.ranks) this.promote(career, "On Strike");
            this.relation("Rival", "strike leadership");
          } else this.log("You are caught crossing the picket line; nothing gained.", { kind: "info" });
        } else {
          this.relation("Ally", "a fellow worker");
          const r = yield* this.check("event-check", "Contract negotiation", "soc");
          if (r.success) { career.cashDM += 1; this.log("+1 to all cash benefit rolls from this career", { kind: "gain" }); }
          else { career.reenlistDM -= 2; this.log("Reenlistment -2 DM", { kind: "loss" }); }
        }
        return;
      }
      case 6: { // Secret
        const how = yield* this.choose("secret", "Management shake-up: do nothing (SOC 8+) or tell the manager (INT 8+)?", [{ value: "nothing", label: "Do nothing", ask: true }, { value: "tell", label: "Tell the manager", ask: true }], "nothing");
        if (how === "nothing") {
          const r = yield* this.check("event-check", "Keep your head down", "soc");
          if (!r.success) this.discharge(career, "fired", "Secret");
        } else {
          const r = yield* this.check("event-check", "Tell the manager", "int");
          if (r.success) { career.autoReenlist = true; this.log("Automatic reenlistment next term", { kind: "gain" }); this.relation("Ally", "the manager"); }
          else { career.reenlistDM -= 2; this.log("Reenlistment -2 DM", { kind: "loss" }); this.relation("Rival"); }
        }
        return;
      }
      case 7: { // Made Redundant
        const r = yield* this.check("event-check", "Made Redundant", "soc");
        if (r.success) { career.autoReenlist = true; this.log("Automatic reenlistment next term", { kind: "gain" }); }
        else { career.cashOnly = true; this.discharge(career, "fired", "Made Redundant"); this.log("Only cash benefits from this career", { kind: "loss" }); }
        return;
      }
      case 8: { // Heated Rivalry
        const how = yield* this.choose("rivalry", "Heated rivalry: pass the task along, or compete (EDU 8+)?", [{ value: "pass", label: "Pass it along", ask: true }, { value: "compete", label: "Compete", ask: true }], "compete");
        if (how === "pass") { this.discharge(career, "fired", "Heated Rivalry"); this.relation("Ally", "your former rival"); return; }
        const r = yield* this.check("event-check", "Heated Rivalry", "edu");
        career.musterDMs += 1;
        this.log("+1 DM to one mustering out roll", { kind: "gain" });
        if (r.success) { career.autoReenlist = true; this.log("Automatic reenlistment next term", { kind: "gain" }); this.relation("Enemy", "the fired coworker"); }
        else { this.discharge(career, "fired", "Heated Rivalry"); this.relation("Rival", "your coworker"); }
        return;
      }
      case 9: { // Legal Trouble
        const bonus = yield* this.lawyer();
        const r = yield* this.check("event-check", "Legal Trouble trial", "soc", 8, [{ label: "Lawyer", value: bonus }]);
        if (r.success) return;
        if (r.total <= 2) { this.sendToPrison(career, "Legal Trouble"); return; }
        const fine = yield* this.roll({ id: "fine", label: "Fine (2D x 5000cr)", mult: 5000, pause: false });
        const paid = Math.min(s.credits, fine.total);
        s.credits -= paid;
        s.debt += fine.total - paid;
        this.log(`Fined ${fine.total}cr${fine.total > paid ? ` (${fine.total - paid}cr as debt)` : ""}`, { kind: "loss" });
        return;
      }
      case 10: { // Tragedy
        yield* this.loseAllyOrContact();
        const r = yield* this.check("event-check", "Tragedy", "end");
        if (r.success) this.changeChar("end", 1, "Tragedy");
        else { yield* this.ptsd(); this.discharge(career, "discharged", "Medical discharge"); }
        return;
      }
      case 11: { // Local Hero
        const r = yield* this.check("event-check", "Local Hero", LOCAL_HERO_CHAR[career.key]);
        if (r.success) yield* this.gainSkill("Jack-of-All-Trades", null, "plus", "Local Hero");
        else { const i = yield* this.roll({ id: "injury", label: "Injury Table (1D)", n: 1 }); yield* this.injury(i.total, career); }
        return;
      }
      case 12: { // Married to the Job
        const r = yield* this.check("event-check", "Married to the Job", "soc");
        if (r.success) this.relation("Ally", "friend or partner");
        else { this.changeChar("soc", -1, "Married to the Job"); career.extraMuster += 1; this.log("+1 mustering out roll for this career", { kind: "gain" }); }
        return;
      }
    }
  }

  *unique(career) {
    const s = this.s;
    const r = yield* this.roll({ id: "unique", label: "Unique Event (1D)", n: 1, mods: [{ label: "Terms past 8", value: Math.max(0, s.terms - 8) }] });
    const n = Math.min(6, r.total);
    this.log(`Unique event: ${UNIQUE_EVENTS[n]}`, { kind: "event" });
    switch (n) {
      case 1: {
        this.relation("Ally", "non-human");
        const skill = yield* this.choose("sophont-skill", "Gain Linguistics 1 or Science 1 (+1 if you have it).", [{ value: "Linguistics", label: "Linguistics", ask: true }, { value: "Science", label: "Science", ask: true }], "Linguistics");
        yield* this.gainSkill(skill, null, "plus", "Life Among Sophonts");
        return;
      }
      case 2: yield* this.psionicTest("Psionic Encounter"); return;
      case 3: this.relation("Contact", "influential, in the largest government of the subsector"); return;
      case 4: this.addItem({ name: "Ancient Artefact", type: "gear", description: "An ancient artefact of unknown value. Find a specialist to learn its worth (p.25)." }); return;
      case 5: if (!(yield* this.loseAllyOrContact())) { const d = yield* this.roll({ id: "isolation", label: "SOC loss (D3)", n: 1, sides: 3, pause: false }); this.changeChar("soc", -d.total, "Social Isolation"); } return;
      case 6: s.bans.retired = true; this.log("Forced retirement: you may not reenlist in any career.", { kind: "loss" }); return;
    }
  }

  /** Psionic potential (p.114): 2D, -1 DM per term after the first. Capped at 15 and at STR+DEX+END+INT. */
  *psionicTest(why) {
    const s = this.s;
    if (s.psi !== null) { this.log(`${why}: psionic potential already tested (PSI ${s.psi})`, { kind: "info" }); return; }
    const r = yield* this.roll({ id: "psionics", label: "Psionic potential (2D)", mods: [{ label: "Terms after the first", value: -Math.max(0, s.terms - 1) }] });
    s.psi = Math.max(0, Math.min(r.total, 15, s.chars.str + s.chars.dex + s.chars.end + s.chars.int));
    this.log(s.psi > 0 ? `Psionic: PSI ${s.psi}` : "No psionic potential", { kind: s.psi > 0 ? "gain" : "info" });
  }

  /* ---------- prison (p.27) */

  *prison(sentence, fromCareer) {
    const s = this.s;
    const rec = this.newCareer("civilian", false);
    Object.assign(rec, { key: "prison", name: "Prison", military: false, ranks: null, rankTitle: "" });
    this.log(`Prison sentence: ${sentence} term(s)`, { kind: "head" });
    for (let t = 1; t <= sentence; t++) {
      s.terms += 1;
      rec.terms += 1;
      this.log(`Term ${s.terms}: Prison, term ${rec.terms} (age ${s.age})`, { kind: "head" });
      const r = yield* this.roll({ id: "prison", label: "Prison Event (1D)", n: 1 });
      const ev = PRISON_EVENTS[r.total];
      this.log(`Prison: ${ev.name}`, { kind: "event" });
      const options = ev.skills.map(l => ({ value: l, label: l, ask: true }));
      const pick = yield* this.choose("prison-skill", `${ev.name}: choose a skill.`, options, ev.skills[0]);
      const g = parseSkill(pick);
      yield* this.gainSkill(g.skill, g.specs, "plus", "prison");
      const c = yield* this.check("event-check", ev.name, ev.check);
      if (c.success) {
        if (ev.success === "contact") this.relation("Contact", "prison");
        else if (ev.success === "ally") this.relation("Ally", "prison");
        else if (ev.success === "jack") yield* this.gainSkill("Jack-of-All-Trades", null, "plus", "Poor Conditions");
        else if (ev.success === "release") {
          fromCareer.regained = 1;
          this.log(`Released early; regain one mustering out roll from the ${fromCareer.name}`, { kind: "gain" });
          yield* this.ageTerm();
          rec.ended = "released";
          return;
        }
      } else {
        const i = yield* this.roll({ id: "injury", label: `Injury Table (${ev.injury})`, n: 1, sides: ev.injury === "D3" ? 3 : 6 });
        yield* this.injury(i.total, rec);
        if (s.status === "dead") return;
      }
      yield* this.ageTerm();
    }
    rec.ended = "released";
  }

  /* ---------- mustering out (p.20-21) */

  cash(key, row, why) {
    const r = Math.max(1, Math.min(7, row));
    const amount = MONETARY[key][r - 1];
    this.s.credits += amount;
    this.log(`${why}: ${amount}cr`, { kind: "gain" });
  }

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
  }

  /** Plan the mustering out rolls of a career. Exported for tests through `planMuster`. */
  planMuster(career) {
    return planMuster(career);
  }

  *musterOut(career) {
    const s = this.s;
    const plan = planMuster(career);
    this.log(`Mustering out of the ${career.name}: ${plan.rolls.length} roll(s)`, { kind: "head" });
    if (!plan.rolls.length) { if (career.forfeit) this.log("No mustering out benefits (criminal record).", { kind: "loss" }); return; }
    let tokens = plan.dmTokens;
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
        const use = yield* this.choose("muster-dm", `Apply a +1 DM to this roll (${tokens} left)?`, YES_NO.map(o => ({ ...o, ask: true })), auto);
        if (use === "yes") { dm = 1; tokens -= 1; }
      }
      const mods = [{ label: "Muster DM", value: dm }];
      if (column === "cash") mods.push({ label: "Cash DM", value: career.cashDM });
      const label = `${column === "cash" ? "Monetary" : "Material"} Benefits (${p.d3 ? "D3" : "1D"})${p.reason ? `, ${p.reason}` : ""}`;
      const r = yield* this.roll({ id: "muster", label, n: 1, sides: p.d3 ? 3 : 6, mods });
      if (column === "cash") { this.cash(career.key, r.total, "Monetary benefit"); if (!p.d3) cashUsed += 1; }
      else yield* this.material(career.key, r.total, "Material benefit");
    }
  }

  /* ---------- end */

  *finish() {
    const s = this.s;
    const sources = [];
    for (const c of s.careers) {
      if (c.key === "prison") continue;
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
      const go = yield* this.choose("psionics", "Test your psionic potential?", YES_NO.map(o => ({ ...o, ask: true })), "yes");
      if (go === "yes") yield* this.psionicTest("Psionic test");
    }
    s.status = "done";
    this.log(`Character complete: UPP ${upp(s)}, age ${s.age}, ${s.terms} terms, ${s.credits}cr`, { kind: "head" });
  }
}

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
 * Drives a run. Each response (choice value or roll) is one step; `undo()` removes the last step.
 */
export class Lifepath {
  constructor({ dice = randomDice } = {}) {
    this.dice = dice;
    this.responses = [];
    this.tape = [];
    this.marks = [];
    this.#replay();
  }

  #replay() {
    let pos = 0;
    const draw = sides => {
      if (pos < this.tape.length) return this.tape[pos++];
      const v = this.dice(sides);
      if (!Number.isInteger(v) || v < 1 || v > sides) throw new Error(`dice(${sides}) returned ${v}`);
      this.tape.push(v);
      pos++;
      return v;
    };
    this.run = new Run(draw);
    this.gen = this.run.main();
    this.marks = [];
    let step = this.gen.next();
    for (let i = 0; ; i++) {
      if (step.done) break;
      this.marks.push(pos);
      if (i >= this.responses.length) break;
      step = this.gen.next(this.responses[i]);
    }
    this.current = step.done ? null : step.value;
  }

  get state() { return this.run.s; }
  get log() { return this.run.s.log; }
  get done() { return this.run.s.status === "done"; }
  get dead() { return this.run.s.status === "dead"; }
  get canUndo() { return this.responses.length > 0; }

  /** The pending request, or { type: "done" } / { type: "dead", options, auto }. */
  get pending() {
    if (this.current) return this.current;
    if (this.dead) return { type: "dead", prompt: this.run.s.deathCause, options: [{ value: "restart", label: "Start a new character" }], auto: "restart" };
    return { type: "done" };
  }

  /** Answer the pending request: the option value for a choice, nothing for a roll. */
  respond(value) {
    const p = this.pending;
    if (p.type === "done") throw new Error("Character creation is complete");
    if (p.type === "dead") { this.restart(); return this.pending; }
    if (p.type === "choice" && !p.options.some(o => o.value === value)) throw new Error(`Invalid choice "${value}" for ${p.id}`);
    const v = p.type === "roll" ? null : value;
    this.responses.push(v);
    const step = this.gen.next(v);
    this.marks.push(this.tape.length);
    this.current = step.done ? null : step.value;
    return this.pending;
  }

  /** Undo the last step. Rolls made after it are discarded and rolled again. */
  undo() {
    if (!this.responses.length) return false;
    this.responses.pop();
    this.tape.length = this.marks[this.responses.length] ?? 0;
    this.#replay();
    return true;
  }

  restart() {
    this.responses = [];
    this.tape = [];
    this.#replay();
  }

  /**
   * Resolve every pending request with `policy(request, lifepath) -> value` (default: the request's
   * `auto` value) until done. Death restarts unless `stopOnDeath`. Returns the number of steps.
   */
  autoRun({ policy = null, stopOnDeath = false, maxSteps = 20000 } = {}) {
    let n = 0;
    while (n < maxSteps) {
      const p = this.pending;
      if (p.type === "done") return n;
      if (p.type === "dead" && stopOnDeath) return n;
      const v = p.type === "roll" ? null : policy ? policy(p, this) : p.auto;
      this.respond(v);
      n++;
    }
    throw new Error("autoRun: too many steps");
  }
}

/* ------------------------------------------------------------------ output */

/** Material benefits and event items as item data for the actor. */
export function benefitItems(s) {
  const out = s.items.map(i => ({ name: i.name, type: i.type ?? "gear", lookup: i.lookup ?? [i.name], quantity: i.quantity ?? 1, description: i.description ?? "" }));
  if (s.sss) out.push({ name: "Spacer Support Service Membership", type: "gear", lookup: ["Spacer Support Service Membership", "SSS Membership"], quantity: 1, description: "Lifetime SSS (Triple-S) membership: hostel stay at type A or B starports once a month, up to 10,000cr a year for medical and legal support (p.21)." });
  if (s.shipShares) out.push({ name: `Ship Shares (${s.shipShares}%)`, type: "gear", lookup: [], quantity: 1, description: `${s.shipShares}% off the 20% downpayment on a starship (p.21).` });
  if (s.ships.scout) out.push({ name: "Scout Ship", type: "gear", lookup: [], quantity: 1, description: `Used 100T scout ship, ${s.ships.scout} years old. ${s.ships.scout >= 40 ? "Decommissioned: owned outright." : "On loan from the Scouts until it is 40 years old."} The owner pays maintenance, fuel, and operating costs, and is on call for the scout service (p.21, p.69).` });
  if (s.ships.merchant) out.push({ name: "Merchant Ship", type: "gear", lookup: [], quantity: 1, description: `Used 200T trader, ${s.ships.merchant} years old. ${s.ships.merchant >= 40 ? "Owned outright." : "Under commission of the service."} 150,000cr monthly loan payment for the rest of the loan period (p.21, p.69).` });
  return out;
}

const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function rollText(r) {
  const mods = r.mods.map(m => `${m.value >= 0 ? "+" : ""}${m.value} ${m.label}`).join(" ");
  const faces = r.faces.length > 1 ? `[${r.faces.join(", ")}]` : `${r.faces[0]}`;
  const tgt = r.target !== null ? ` vs ${r.target}+ ${r.success ? "success" : "failure"}` : "";
  return `${r.dice} ${faces}${mods ? ` ${mods}` : ""} = ${r.total}${tgt}`;
}

/** The lifepath log as HTML for system.history. */
export function historyHTML(s) {
  const parts = [`<h2>Lifepath</h2><p><strong>UPP</strong> ${esc(upp(s))} · <strong>Age</strong> ${s.age} · <strong>Terms</strong> ${s.terms}</p>`];
  let list = [];
  const flush = () => { if (list.length) parts.push(`<ul>${list.join("")}</ul>`); list = []; };
  for (const e of s.log) {
    if (e.kind === "head") { flush(); parts.push(`<h3>${esc(e.text)}</h3>`); continue; }
    if (e.kind === "roll") list.push(`<li>${esc(e.text)}: ${esc(rollText(e.roll))}</li>`);
    else list.push(`<li>${esc(e.text)}</li>`);
  }
  flush();
  if (s.relations.length) parts.push(`<h3>Connections</h3><ul>${s.relations.map(r => `<li>${esc(r.type)}${r.note ? `: ${esc(r.note)}` : ""}</li>`).join("")}</ul>`);
  return parts.join("\n");
}

/** Short summary for the UI and the chat card. */
export function summary(s) {
  const careers = s.careers.map(c => ({
    key: c.key, name: c.name, terms: c.terms, rank: c.rank, rankTitle: c.ranks ? c.rankTitle : "",
    commissioned: c.commissioned, drafted: c.drafted, ended: c.ended
  }));
  return {
    upp: upp(s),
    chars: CHARS.map(k => ({ key: k, label: CHAR_LABEL[k], value: s.chars[k], hex: hex(s.chars[k]), dm: charDM(s.chars[k]) })),
    psi: s.psi,
    age: s.age,
    terms: s.terms,
    careers,
    skills: skillList(s),
    skillText: skillText(s),
    credits: s.credits,
    debt: s.debt,
    items: benefitItems(s),
    relations: s.relations,
    pension: s.pension,
    status: s.status
  };
}

/** Plain data to write to a character actor. The Foundry layer adds items from compendiums. */
export function actorData(s) {
  const characteristics = {};
  for (const k of CHARS) characteristics[k] = { value: s.chars[k], max: s.chars[k] };
  const pension = s.pension.mode === "yearly" ? s.pension.yearly : s.pension.monthly;
  return {
    system: {
      characteristics,
      psi: { value: s.psi ?? 0, max: s.psi ?? 0 },
      age: s.age,
      terms: s.terms,
      careers: s.careers.map(c => ({ career: c.key, terms: c.terms, rank: c.rank, rankTitle: c.ranks ? c.rankTitle : "", commissioned: c.commissioned, drafted: c.drafted })),
      credits: s.credits,
      debt: s.debt,
      pension,
      history: historyHTML(s),
      chargenComplete: true
    },
    skills: skillList(s).map(e => ({ skill: e.skill, specialty: e.specialty, rank: e.rank })),
    items: benefitItems(s),
    flags: { pensionMode: s.pension.mode, relations: s.relations, options: s.options }
  };
}

/** Check a finished state: used by tests. Returns a list of problems (empty when valid). */
export function validate(s) {
  const bad = [];
  if (s.status !== "done") bad.push(`status ${s.status}`);
  for (const k of CHARS) if (!Number.isInteger(s.chars[k]) || s.chars[k] < 0) bad.push(`${k}=${s.chars[k]}`);
  if (s.age !== 18 + 4 * s.terms) bad.push(`age ${s.age} != 18 + 4 x ${s.terms}`);
  if (s.terms !== s.careers.reduce((a, c) => a + c.terms, 0)) bad.push("terms do not add up");
  if (!s.careers.length) bad.push("no career");
  for (const [key, rank] of Object.entries(s.skills)) {
    if (!Number.isInteger(rank) || rank < 0 || rank > MAX_SKILL_RANK) bad.push(`skill ${key}=${rank}`);
    const { skill, specialty } = splitSkillKey(key);
    if (specialty) {
      if (!SPECIALTIES[skill]?.includes(specialty)) bad.push(`bad specialty ${key}`);
      if (s.skills[skill] !== 0) bad.push(`specialty ${key} without base 0`);
    } else if (isSpecialised(skill) && rank !== 0) bad.push(`specialised base ${key}=${rank}`);
  }
  for (const c of s.careers) {
    if (c.ranks && (c.rank < 0 || c.rank >= c.ranks.length)) bad.push(`rank ${c.name} ${c.rank}`);
    if (!c.ranks && c.rank !== 0) bad.push(`rank in rankless ${c.name}`);
  }
  if (!Number.isFinite(s.credits) || s.credits < 0) bad.push(`credits ${s.credits}`);
  if (s.psi !== null && (s.psi < 0 || s.psi > 15)) bad.push(`psi ${s.psi}`);
  return bad;
}

export { CAREERS, CAREER_KEYS, SKILL_TABLES, MATERIAL, MONETARY, INJURY };
