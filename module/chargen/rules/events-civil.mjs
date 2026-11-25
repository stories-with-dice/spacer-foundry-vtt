/**
 * Non-Military Life Events (book p.26-27), for Scouts, Merchants, and Civilian terms.
 * Pure: no Foundry globals.
 */
import { LOCAL_HERO_CHAR } from "./careers.mjs";

/**
 * Non-military event steps, mixed into `Run` by engine.mjs. `this` is the run (see state.mjs).
 * Called by `event()` in events.mjs.
 */
export const civilEventSteps = {
  /** Resolve Non-Military Life Event `n` (1-12) for the career. */
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
        // BOOK: the -2 reenlistment DMs of On Strike and Secret (p.26) give no duration; we apply them to
        // the next reenlistment roll only. Only Major Injury lasts the whole career (p.18).
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
          else { this.nextReenlistPenalty(career); }
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
          else { this.nextReenlistPenalty(career); this.relation("Rival"); }
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
        // BOOK: "Result of 2" (p.26) on the modified total (with the lawyer DM); see Court Martial.
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
};
