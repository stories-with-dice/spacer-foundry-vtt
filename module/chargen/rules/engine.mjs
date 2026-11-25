/**
 * Lifepath character creation engine (book p.16-29, p.114). Pure and deterministic: no Foundry
 * globals. The procedure is a generator that yields a request each time it needs input:
 *
 *   { type: "choice", id, prompt, options: [{ value, label, hint? }], auto }   the player picks
 *   { type: "roll", id, label, dice, mods: [{ label, value }], target }       the player rolls
 *
 * `Lifepath` drives the generator. It records every response and every die on a tape, so it can
 * undo a step by replaying the tape. Inject `dice(sides) -> 1..sides` (a die from
 * module/shared/dice.mjs) to script rolls in tests.
 *
 * The steps live in one file per part of the procedure:
 *   state.mjs            state, base run class (rolls, choices, checks, connections)
 *   skills.mjs           skill keys and skill gains
 *   terms.mjs            career choice, enlist/draft, terms, survival, promotion, aging, injury, reenlist
 *   events*.mjs          life events (military, non-military, unique), psionics, prison
 *   muster.mjs           mustering out, pensions, finish
 *   summary.mjs          summary, actor data, history HTML, validation
 */
import { randomDie, seededDie } from "../../shared/dice.mjs";
import { CHARS, CHAR_LABEL } from "./careers.mjs";
import { RunBase, upp, askYesNo } from "./state.mjs";
import { skillSteps } from "./skills.mjs";
import { termSteps } from "./terms.mjs";
import { eventSteps } from "./events.mjs";
import { militaryEventSteps } from "./events-military.mjs";
import { civilEventSteps } from "./events-civil.mjs";
import { musterSteps } from "./muster.mjs";

export { MAX_SKILL_RANK, newState, upp } from "./state.mjs";
export { skillKey, splitSkillKey, isSpecialised, skillList, skillText } from "./skills.mjs";
export { planMuster } from "./muster.mjs";
export { benefitItems, rollText, historyHTML, summary, actorData, validate } from "./summary.mjs";
export { CAREERS, CAREER_KEYS, SKILL_TABLES, MATERIAL, MONETARY, INJURY } from "./careers.mjs";

/** Random die (1..sides) from the shared dice helpers. Kept under the old name for callers. */
export const randomDice = randomDie();
/** Seeded die factory (mulberry32) from the shared dice helpers. Kept under the old name for tests. */
export const seededDice = seededDie;

/** One run of the procedure: the base class plus every step file. */
class Run extends RunBase {
  /** The whole procedure (p.16): options, characteristics, careers, mustering out, finish. */
  *main() {
    const s = this.s;
    s.options.events = (yield* this.choose("opt-events", "Use the optional life events (p.24-27)?", askYesNo(), "no")) === "yes";
    s.options.psionics = (yield* this.choose("opt-psionics", "Allow a psionic potential test at the end (p.114)?", askYesNo(), "no")) === "yes";

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
}
Object.assign(Run.prototype, skillSteps, termSteps, eventSteps, militaryEventSteps, civilEventSteps, musterSteps);

/**
 * Drives a run. Each response (choice value or roll) is one step; `undo()` removes the last step.
 * Used by the wizard (wizard.mjs), the browser test, and the node tests.
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

  /** Start over with a new character (new dice). */
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
