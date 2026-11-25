/**
 * Skills during character creation (p.18, p.28-29). Pure: no Foundry globals.
 *
 * The state stores skills as `{ "<key>": rank }`. The key is the skill name, or
 * "Skill (Specialty)" for a specialty of a specialised skill. A specialised skill at rank 0 covers
 * every specialty (p.28); past rank 0 the character raises one specialty, and the base stays at 0.
 */
import { SPECIALTIES } from "./careers.mjs";
import { MAX_SKILL_RANK } from "./state.mjs";

/** The state key of a skill: "Pilot" or "Pilot (Aircraft)". */
export function skillKey(skill, specialty = "") { return specialty ? `${skill} (${specialty})` : skill; }

/** Split a state key into `{ skill, specialty }` ("" for the base skill). */
export function splitSkillKey(key) {
  const m = String(key).match(/^(.*?)\s*\((.*)\)$/);
  return m ? { skill: m[1], specialty: m[2] } : { skill: key, specialty: "" };
}

/** True when the skill has specialties (p.28-29: Drive, Melee Combat, Pilot, Ranged Combat, Tactics). */
export function isSpecialised(skill) { return !!SPECIALTIES[skill]; }

/** Sorted skill list of a state: [{ skill, specialty, rank, key }]. Used by summary.mjs and the events. */
export function skillList(s) {
  return Object.entries(s.skills).map(([key, rank]) => ({ ...splitSkillKey(key), rank, key }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** The skills of a state as text: "Melee Combat 0 (Blade 1), Pilot 1". Used by summary(). */
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

/**
 * The skills and specialties at the lowest effective rank, for "increase one of your lowest ranked
 * Skills" (Extracurricular Training, p.24): [{ key, rank }]. A specialised skill at rank 0 covers
 * every specialty (p.28), so each specialty that the character has not raised counts at rank 0;
 * the base entry itself is not offered. Skills at MAX_SKILL_RANK are left out.
 * Called by improveLowest() and the tests.
 *
 * Example: { "Melee Combat": 0, "Melee Combat (Blade)": 2, "Pilot": 0, "Pilot (Starship)": 1, "Admin": 1 }
 * -> Melee Combat (Hand-to-Hand) 0, Melee Combat (Bludgeon) 0, Pilot (Aircraft) 0.
 */
export function lowestSkills(s) {
  const all = [];
  for (const [key, rank] of Object.entries(s.skills)) {
    const { skill, specialty } = splitSkillKey(key);
    if (isSpecialised(skill) && !specialty) {
      for (const sp of SPECIALTIES[skill]) if (s.skills[skillKey(skill, sp)] === undefined) all.push({ key: skillKey(skill, sp), rank });
    } else all.push({ key, rank });
  }
  const open = all.filter(e => e.rank < MAX_SKILL_RANK);
  if (!open.length) return [];
  const min = Math.min(...open.map(e => e.rank));
  return open.filter(e => e.rank === min).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Skill steps of a run, mixed into `Run` by engine.mjs. `this` is the run (see state.mjs).
 * Called by the term, event, and prison steps.
 */
export const skillSteps = {
  /**
   * Gain a skill (p.18, p.28). mode "zero": rank 0 (basic training, enlistment). mode "plus": rank 1 or
   * +1. A specialised skill gained past rank 0 needs a specialty: the player picks one of `specs`.
   * Returns the state key that changed.
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
  },

  /** Apply a skill table row (p.19): a characteristic increase or a skill. */
  *applyGain(g, mode, why) {
    if (g.char) { this.changeChar(g.char, g.amount, why); return; }
    yield* this.gainSkill(g.skill, g.specs, mode, why);
  },

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
  },

  /** +1 to one of the lowest ranked skills or specialties (see lowestSkills); raises exactly the chosen one. */
  *improveLowest(why) {
    const pool = lowestSkills(this.s);
    if (!pool.length) { this.log(`${why}: no skill to improve`, { kind: "info" }); return; }
    const key = yield* this.choose("improve-skill", "Choose one of your lowest ranked skills to improve.",
      pool.map(e => ({ value: e.key, label: `${e.key} ${e.rank}` })), pool[0].key);
    const rank = pool.find(e => e.key === key).rank + 1;
    this.s.skills[key] = rank;
    this.log(`Gain ${key} ${rank} (${why})`, { kind: "gain" });
  }
};
