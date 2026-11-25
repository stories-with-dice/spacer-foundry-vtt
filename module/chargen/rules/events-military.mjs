/**
 * Military Life Events (book p.24-25), for Army, Navy, and Marines terms. Pure: no Foundry globals.
 */
import { WAR_HERO_CHAR, civilianSkills } from "./careers.mjs";
import { askYesNo } from "./state.mjs";

/**
 * Military event steps, mixed into `Run` by engine.mjs. `this` is the run (see state.mjs).
 * Called by `event()` in events.mjs.
 */
export const militaryEventSteps = {
  /** Resolve Military Life Event `n` (1-12) for the career. */
  *militaryEvent(n, career) {
    const s = this.s;
    switch (n) {
      case 1: // Chewed Up and Spat Out
        this.discharge(career, "discharged", "Chewed Up and Spat Out");
        s.bans.militaryEnlist = true;
        this.log("You can only enter military service again if drafted.", { kind: "info" });
        return;
      case 2: { // Voluntold
        // BOOK: "If you say no, incur -2DM to reenlistment" (p.24) gives no duration; we apply it to the
        // next reenlistment roll only, like the other event DMs. Only Major Injury lasts the whole career.
        const go = yield* this.choose("voluntold", "Volunteer for the hard labour mission? (No: -2 DM to reenlist)", askYesNo(), "no");
        if (go === "no") { this.nextReenlistPenalty(career); return; }
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
        // BOOK: the offer (p.24) has no "refuse" branch; we let the player refuse, and nothing happens.
        const go = yield* this.choose("espionage", "Leak secrets for money? (INT 8+; failure means prison)", askYesNo(), "no");
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
        // BOOK: the failures say "Roll D3+3 / D3 on the Survival Table" (p.24); there is no such table,
        // so we roll on the Injury Table (p.18), as the other events do. Same for Peacekeeper.
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
          yield* this.improveLowest("Extracurricular Training");
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
          // BOOK: "Roll 1D on the survival table" (p.24); we use the Injury Table (see Honor Duel).
          const i = yield* this.roll({ id: "injury", label: "Injury Table (1D)", n: 1 });
          yield* this.injury(i.total, career);
        }
        return;
      }
      case 9: { // Court Martial
        const bonus = yield* this.lawyer();
        const r = yield* this.check("event-check", "Court Martial trial", "soc", 8, [{ label: "Lawyer", value: bonus }]);
        if (r.success) { career.autoReenlist = true; this.log("Cleared: automatic reenlistment next term", { kind: "gain" }); }
        // BOOK: "Result of 2: You are executed" (p.24) does not say natural or modified; we use the
        // modified total (with the lawyer DM), as Warzone "Failure of 2" and Legal Trouble do.
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
          if (r.success) { this.promote(career, "Career Soldier"); this.nextReenlistPenalty(career); this.relation("Rival", "the demoted superior"); }
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
};
