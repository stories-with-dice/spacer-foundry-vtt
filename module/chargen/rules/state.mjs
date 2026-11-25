/**
 * Character state and the base class of a lifepath run (book p.16-27). Pure: no Foundry globals.
 *
 * `RunBase` holds the state and the small steps that every procedure file uses: dice rolls, player
 * choices, characteristic checks, connections, items, promotions, prison, and discharge. The
 * procedure steps live in skills.mjs, terms.mjs, events*.mjs, and muster.mjs; engine.mjs mixes them
 * into one `Run` class.
 */
import { CHARS, CHAR_LABEL, charDM, hex } from "./careers.mjs";

/** Highest skill rank a character can reach (p.28). */
export const MAX_SKILL_RANK = 5;

/** The two options of a yes/no player choice. Used by every procedure file. */
export const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

/** `YES_NO` with `ask: true`, so the wizard asks even when the player could skip the question. */
export const askYesNo = () => YES_NO.map(o => ({ ...o, ask: true }));

/**
 * A fresh character state. Called by `RunBase` at the start of each run.
 * @returns {object} the state that the procedure writes and summary.mjs reads.
 */
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

/**
 * The UPP string (six hex digits, p.16) of a state, e.g. "7A8977".
 * Called by the engine log, summary(), and historyHTML().
 */
export function upp(s) { return CHARS.map(c => hex(s.chars[c])).join(""); }

/**
 * Base of a lifepath run. `draw(sides)` returns one die face; the `Lifepath` driver in engine.mjs
 * passes a function that records every face on its tape. Methods marked with `*` are generators:
 * they yield requests (`{ type: "roll" | "choice", ... }`) to the driver.
 */
export class RunBase {
  constructor(draw) {
    this.draw = draw;
    this.s = newState();
  }

  /** The current (last) career record, or null. */
  get career() { return this.s.careers.at(-1) ?? null; }

  /** Add a line to the lifepath log. `extra.kind` sets the style (head, roll, gain, loss, ...). */
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

  /** Change a characteristic by `delta` (never below 0) and log it. */
  changeChar(char, delta, why = "") {
    const before = this.s.chars[char];
    this.s.chars[char] = Math.max(0, before + delta);
    this.log(`${CHAR_LABEL[char]} ${delta >= 0 ? "+" : ""}${delta}${why ? ` (${why})` : ""}: ${before} -> ${this.s.chars[char]}`, { kind: "char" });
  }

  /** Gain a connection (Ally, Contact, Rival, Enemy). */
  relation(type, note = "") {
    this.s.relations.push({ type, note });
    this.log(`Gain ${type === "Ally" || type === "Enemy" ? "an" : "a"} ${type}${note ? ` (${note})` : ""}`, { kind: "gain" });
  }

  /** Lose one Ally or Contact (the player picks the type). Returns false when there is none. */
  *loseAllyOrContact() {
    const types = ["Ally", "Contact"].filter(t => this.s.relations.some(r => r.type === t));
    if (!types.length) return false;
    const type = yield* this.choose("lose-relation", "Lose which?", types.map(t => ({ value: t, label: t })), types.at(-1));
    const i = this.s.relations.findIndex(r => r.type === type);
    this.s.relations.splice(i, 1);
    this.log(`Lose a ${type}`, { kind: "loss" });
    return true;
  }

  /** Add a benefit item, or +1 quantity when the character has it. */
  addItem(item) {
    const found = this.s.items.find(i => i.name === item.name);
    if (found) found.quantity += 1;
    else this.s.items.push({ type: "gear", quantity: 1, lookup: [item.name], ...item });
    this.log(`Gain ${item.name}`, { kind: "gain" });
  }

  /**
   * -2 DM to the next reenlistment roll of the career only (Voluntold, Career Soldier, On Strike,
   * Secret; p.24-26). serve() in terms.mjs reads it and term() clears it each term.
   */
  nextReenlistPenalty(career) {
    career.nextReenlistDM -= 2;
    this.log("Next reenlistment roll -2 DM", { kind: "loss" });
  }

  /** Promote one rank in the career (nothing at the top rank or in a career without ranks). */
  promote(career, why) {
    if (!career.ranks) { this.log(`${why}: no ranks in this career`, { kind: "info" }); return; }
    if (career.rank >= career.ranks.length - 1) { this.log(`${why}: already at the top rank`, { kind: "info" }); return; }
    career.rank += 1;
    career.rankTitle = career.ranks[career.rank];
    this.log(`Promoted to rank ${career.rank}, ${career.rankTitle} (${why})`, { kind: "gain" });
  }

  /** End the career in prison (p.27): the career forfeits its mustering out rolls. */
  sendToPrison(career, why) {
    career.ended = "prison";
    career.forfeit = true;
    career.prison = true;
    this.log(`${why}: sent to prison. No mustering out benefits from ${career.name}.`, { kind: "loss" });
  }

  /** End the career with `how` ("discharged" or "fired"), unless it already ended. */
  discharge(career, how = "discharged", why = "") {
    if (!career || career.key === "prison") return;
    if (!career.ended) career.ended = how;
    this.log(`${why ? `${why}: ` : ""}${how === "fired" ? "fired from" : "discharged from"} ${career.name}`, { kind: "loss" });
  }
}
