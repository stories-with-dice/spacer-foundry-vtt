/**
 * Life events (book p.24-27): the event roll, shared event steps (PTSD, lawyer), the Unique Event
 * table, the psionic test (p.114), and prison (p.27). Pure: no Foundry globals.
 * The military and non-military tables live in events-military.mjs and events-civil.mjs.
 */
import { MILITARY_EVENTS, CIVIL_EVENTS, UNIQUE_EVENTS, PRISON_EVENTS, parseSkill } from "./careers.mjs";
import { askYesNo } from "./state.mjs";

/**
 * Event steps, mixed into `Run` by engine.mjs. `this` is the run (see state.mjs).
 * `term()` in terms.mjs calls event(); `main()` in engine.mjs calls prison().
 */
export const eventSteps = {
  /** Roll 1D + (career terms - 1) on the event table of the career (p.24, p.26). 13+ is a Unique Event. */
  *event(career) {
    const military = career.military;
    const r = yield* this.roll({ id: "event", label: `${military ? "Military" : "Non-Military"} Life Event (1D)`, n: 1, mods: [{ label: "Term DM", value: career.terms - 1 }] });
    const n = Math.min(13, Math.max(1, r.total));
    const name = (military ? MILITARY_EVENTS : CIVIL_EVENTS)[n];
    this.log(`Event: ${name}`, { kind: "event" });
    if (n === 13) return yield* this.unique(career);
    return military ? yield* this.militaryEvent(n, career) : yield* this.civilEvent(n, career);
  },

  /** PTSD (p.24): roll D3 for INT, EDU, or SOC, then lose D3 from it. */
  *ptsd() {
    const w = yield* this.roll({ id: "ptsd", label: "PTSD: characteristic (D3: INT, EDU, SOC)", n: 1, sides: 3, pause: false });
    const d = yield* this.roll({ id: "ptsd-d3", label: "PTSD loss (D3)", n: 1, sides: 3, pause: false });
    this.changeChar(["int", "edu", "soc"][w.total - 1], -d.total, "PTSD");
  },

  /** Lawyer for a trial (p.24, p.26): 1D x 1000cr, +D3 DM. Must have the money. */
  *lawyer() {
    if (this.s.credits < 1000) return 0;
    const go = yield* this.choose("lawyer", `Hire a lawyer for 1D x 1000cr (you have ${this.s.credits}cr)? Gives +D3 DM.`, askYesNo(), "yes");
    if (go !== "yes") return 0;
    const cost = yield* this.roll({ id: "lawyer-cost", label: "Lawyer cost (1D x 1000cr)", n: 1, mult: 1000, pause: false });
    if (cost.total > this.s.credits) { this.log("You cannot pay the lawyer.", { kind: "info" }); return 0; }
    this.s.credits -= cost.total;
    const bonus = yield* this.roll({ id: "lawyer-dm", label: "Lawyer DM (D3)", n: 1, sides: 3, pause: false });
    return bonus.total;
  },

  /** Unique Event table (p.25, p.27): 1D + 1 per term past the 8th. */
  *unique(career) {
    const s = this.s;
    // BOOK: "+1 for every term served past term 8" (p.25); we count every term, prison terms too.
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
  },

  /** Psionic potential (p.114): 2D, -1 DM per term after the first. Capped at 15 and at STR+DEX+END+INT. */
  *psionicTest(why) {
    const s = this.s;
    if (s.psi !== null) { this.log(`${why}: psionic potential already tested (PSI ${s.psi})`, { kind: "info" }); return; }
    const r = yield* this.roll({ id: "psionics", label: "Psionic potential (2D)", mods: [{ label: "Terms after the first", value: -Math.max(0, s.terms - 1) }] });
    s.psi = Math.max(0, Math.min(r.total, 15, s.chars.str + s.chars.dex + s.chars.end + s.chars.int));
    this.log(s.psi > 0 ? `Psionic: PSI ${s.psi}` : "No psionic potential", { kind: s.psi > 0 ? "gain" : "info" });
  },

  /** Serve a prison sentence of `sentence` terms after `fromCareer` (p.27). */
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
};
