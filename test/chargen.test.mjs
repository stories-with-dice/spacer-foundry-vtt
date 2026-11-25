import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Lifepath, seededDice, validate, summary, actorData, planMuster, historyHTML, skillText, upp
} from "../module/chargen/rules/engine.mjs";
import {
  parseSkill, CAREERS, SKILL_TABLES, MATERIAL, MONETARY, agingChecks, pensionFor, rankMusterRolls,
  commissionMusterDMs, civilianSkills, tableRows
} from "../module/chargen/rules/careers.mjs";

/**
 * Drive a run with scripted input. `plan[id]` is a list consumed in order: choice values for
 * choice requests, dice arrays for roll requests (the array also feeds the unpaused rolls that
 * follow, such as D3 losses). Unscripted dice roll 4 (D6) or 2 (D3); unscripted choices use `auto`.
 */
function drive(plan = {}, { stopOnDeath = true, max = 5000 } = {}) {
  const queue = [];
  const lp = new Lifepath({ dice: sides => queue.length ? queue.shift() : (sides === 3 ? 2 : 4) });
  const seen = [];
  for (let i = 0; i < max; i++) {
    const p = lp.pending;
    if (p.type === "done" || (p.type === "dead" && stopOnDeath)) break;
    seen.push(p);
    const list = plan[p.id];
    let v = null;
    if (p.type === "roll") { if (list?.length) queue.push(...list.shift()); }
    else {
      v = list?.length ? list.shift() : p.auto;
      if (!p.options.some(o => o.value === v)) v = p.auto;
    }
    lp.respond(v);
  }
  return { lp, s: lp.state, seen, texts: lp.log.map(e => e.text) };
}
const twelve = (...v) => [v.flatMap(x => [Math.ceil(x / 2), Math.floor(x / 2)])];
const base = (extra = {}) => ({ "opt-events": ["no"], "opt-psionics": ["no"], ...extra });

test("parseSkill maps book labels to p.28-29 names", () => {
  assert.deepEqual(parseSkill("+1 END"), { label: "+1 END", char: "end", amount: 1 });
  assert.equal(parseSkill("Vacc Suit").skill, "Vaccsuit");
  assert.deepEqual(parseSkill("Melee Combat (H2H)").specs, ["Hand-to-Hand"]);
  assert.deepEqual(parseSkill("Melee (Blade)"), { label: "Melee (Blade)", skill: "Melee Combat", specs: ["Blade"] });
  assert.deepEqual(parseSkill("Drive (Any Non-Military)").specs, ["Civilian", "Grav", "Industrial", "Marine", "Misc"]);
  assert.deepEqual(parseSkill("Drive (And non-military)").specs, ["Civilian", "Grav", "Industrial", "Marine", "Misc"]);
  assert.deepEqual(parseSkill("Ranged (Short or Archaic)"), { label: "Ranged (Short or Archaic)", skill: "Ranged Combat", specs: ["Short", "Archaic"] });
  assert.deepEqual(parseSkill("Tactics (Starship or Vehicles)").specs, ["Starship", "Vehicle"]);
  assert.equal(parseSkill("Ranged Combat (Any)").specs, null);
  assert.equal(parseSkill("Melee (any)").skill, "Melee Combat");
  assert.equal(parseSkill("Computer").skill, "Computers");
  assert.equal(parseSkill("Engineer").skill, "Engineering");
  assert.equal(parseSkill("Knowledge").skill, "Knowledge");
  assert.equal(parseSkill("Drive (Military)").specs[0], "Military");
});

test("service table targets match p.17", () => {
  const t = k => [CAREERS[k].enlist.target, CAREERS[k].survival.target, CAREERS[k].promotion?.target ?? null, CAREERS[k].commission?.target ?? null, CAREERS[k].reenlist];
  assert.deepEqual(t("navy"), [8, 5, 8, 10, 6]);
  assert.deepEqual(t("marines"), [9, 6, 9, 9, 6]);
  assert.deepEqual(t("army"), [5, 5, 6, 5, 7]);
  assert.deepEqual(t("scouts"), [7, 7, null, null, 3]);
  assert.deepEqual(t("merchants"), [7, 5, 10, 4, 4]);
  assert.deepEqual(t("civilian"), [3, 5, null, null, 5]);
  assert.deepEqual(["navy", "marines", "army", "scouts", "merchants", "civilian"].map(k => CAREERS[k].survival.dm), ["int", "end", "edu", "end", "int", "int"]);
  assert.equal(CAREERS.merchants.ranks.length, 6);
  assert.equal(CAREERS.navy.ranks[6], "Admiral");
  for (const t of ["personal", "service", "education", "advanced"]) for (const k of Object.keys(CAREERS)) assert.equal(tableRows(t, k).length, 6);
  assert.equal(SKILL_TABLES.officer.all.length, 6);
  for (const k of Object.keys(CAREERS)) { assert.equal(MATERIAL[k].length, 7); assert.equal(MONETARY[k].length, 7); }
  assert.equal(MONETARY.civilian[6], 100000);
  assert.ok(civilianSkills().includes("Streetwise"));
});

test("rank, commission, aging and pension tables", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(rankMusterRolls), [0, 1, 1, 2, 2, 3, 4]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(r => commissionMusterDMs(r, true)), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(commissionMusterDMs(6, false), 0);
  assert.deepEqual(agingChecks(30), []);
  assert.deepEqual(agingChecks(34).map(a => a.target), [8, 7, 8]);
  assert.deepEqual(agingChecks(50).map(a => a.target), [9, 8, 9]);
  assert.deepEqual(agingChecks(66).map(a => [a.char, a.loss]), [["str", 2], ["dex", 2], ["end", 2], ["int", 1]]);
  assert.equal(pensionFor(4), null);
  assert.deepEqual(pensionFor(5), { monthly: 400, yearly: 4000 });
  assert.deepEqual(pensionFor(9), { monthly: 800, yearly: 9000 });
});

test("enlisted Navy term: enlistment skill, basic training, promotion, commission", () => {
  const { s, texts } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 7, 7),
    career: ["navy"], enlist: [[5, 5]],
    "basic-service": ["4"], "basic-education": ["1"],
    survival: [[3, 4]], promotion: [[4, 4]], "commission-try": ["yes"], commission: [[5, 5]],
    continue: ["stop"], muster: [[2], [3]]
  }));
  assert.equal(s.status, "done");
  assert.deepEqual(s.chars, { str: 7, dex: 7, end: 7, int: 8, edu: 7, soc: 7 });   // Material 2 = +1 INT
  assert.equal(s.skills.Vaccsuit, 0);
  assert.equal(s.skills["Ranged Combat"], 0);          // "Ranged Combat (Short or Energy)" at rank 0 is the base skill
  assert.equal(s.skills.Gunner, 0);
  const navy = s.careers[0];
  assert.equal(navy.rank, 1);
  assert.equal(navy.rankTitle, "Ensign");
  assert.equal(navy.commissioned, true);
  assert.equal(s.age, 22);
  // 1 term + 1 rank roll; rank 1 commissioned gives no muster DM.
  assert.equal(planMuster(navy).rolls.length, 2);
  assert.ok(texts.includes("Gain Vaccsuit 0 (enlistment)"));
  assert.deepEqual(validate(s), []);
});

test("failed enlistment drafts by 1D; no promotion in the first drafted term; draft skill", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 7, 7),
    career: ["marines"], enlist: [[1, 1]], draft: [[3]],
    continue: ["stop"]
  }));
  const army = s.careers[0];
  assert.equal(army.key, "army");
  assert.equal(army.drafted, true);
  assert.equal(s.skills["Ranged Combat"], 0);
  assert.ok(!seen.some(p => p.id === "promotion"));
  assert.equal(s.skills["Melee Combat"], undefined);   // no Marines enlistment skill
});

test("commission only in the first non-drafted term, once per career", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 7, 7),
    career: ["army"], enlist: [[1, 1]], draft: [[3]],
    continue: ["continue", "continue", "stop"], reenlist: [[6, 6], [6, 6]],
    promotion: [[6, 6], [6, 6]], commission: [[1, 1]]
  }));
  const army = s.careers[0];
  assert.equal(army.terms, 3);
  assert.equal(seen.filter(p => p.id === "promotion").length, 2);
  assert.equal(seen.filter(p => p.id === "commission").length, 1);   // term 2 only
  assert.equal(army.commissioned, false);
  assert.equal(army.rank, 2);
});

test("death on the Injury Table ends the character; restart starts over", () => {
  const { lp, s } = drive(base({ career: ["scouts"], survival: [[1, 1]], injury: [[1]] }));
  assert.equal(s.status, "dead");
  assert.equal(lp.pending.type, "dead");
  lp.respond("restart");
  assert.equal(lp.pending.id, "opt-events");
  assert.equal(lp.state.terms, 0);
});

test("detrimental injury: -D3 to all physical, discharged, two D3 cash rolls", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(9, 9, 9, 7, 7, 7),
    career: ["civilian"], survival: [[1, 1]], injury: [[2, 1, 2, 3]],
    "muster-column": [], muster: [[1], [3], [3]]
  }));
  assert.deepEqual([s.chars.str, s.chars.dex, s.chars.end], [8, 7, 6]);
  const civ = s.careers[0];
  assert.equal(civ.ended, "discharged");
  assert.ok(!seen.some(p => p.id === "continue"));
  const plan = planMuster(civ);
  assert.deepEqual(plan.rolls.map(r => [r.column, !!r.d3]), [["material", false], ["cash", true], ["cash", true]]);
  // Material 1 = Low Passage; D3 cash rolls of 3 on the Civilian column = 10000 each.
  assert.equal(s.credits, 20000);
  assert.ok(s.items.some(i => i.name === "Low Passage"));
});

test("major and minor injury add survival and reenlistment DMs", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(9, 9, 9, 7, 7, 7),
    career: ["civilian"], survival: [[1, 1], [1, 1]], injury: [[5], [6]], "injury-char": ["dex"],
    continue: ["continue", "stop"], reenlist: [[3, 4]]
  }));
  const civ = s.careers[0];
  assert.equal(civ.survivalDM, -2);
  assert.equal(civ.reenlistDM, -2);
  assert.deepEqual([s.chars.str, s.chars.dex, s.chars.end], [8, 7, 8]);
  const r = seen.find(p => p.id === "reenlist");
  assert.deepEqual(r.mods, [{ label: "Event DM", value: -2 }]);
  const survival2 = seen.filter(p => p.id === "survival")[1];
  assert.ok(survival2.mods.some(m => m.label === "Injury DM" && m.value === -1));
});

test("an injury that brings a characteristic to 0 gives a disability pension", () => {
  const { s } = drive(base({
    characteristics: twelve(2, 9, 9, 7, 7, 7),
    career: ["civilian"], survival: [[1, 1]], injury: [[4, 1, 3]]
  }));
  assert.equal(s.chars.str, 0);
  assert.equal(s.disability, true);
  assert.equal(s.pension.monthly, 400);
  assert.deepEqual(validate(s), []);
});

test("failed reenlistment forces a new career without the old one", () => {
  const { seen, s } = drive(base({
    career: ["navy", "army"], continue: ["continue", "stop"], reenlist: [[1, 1]], enlist: [[5, 5], [5, 5]]
  }));
  const second = seen.filter(p => p.id === "career")[1];
  assert.ok(!second.options.some(o => o.value === "navy"));
  assert.ok(!second.options.some(o => o.value === "stop"));
  assert.equal(s.careers[0].ended, "failed");
  assert.equal(s.careers[1].key, "army");
  assert.deepEqual(validate(s), []);
});

test("aging from term 4 lowers physical characteristics on failed rolls", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 7, 7),
    career: ["civilian"], continue: ["continue", "continue", "continue", "stop"],
    aging: [[1, 1], [6, 6], [1, 2]]
  }));
  assert.equal(s.terms, 4);
  assert.equal(s.age, 34);
  assert.equal(seen.filter(p => p.id === "aging").length, 3);
  assert.deepEqual([s.chars.str, s.chars.dex, s.chars.end], [6, 7, 6]);
});

test("mustering out: alternating tables, Monetary cap, rank rolls, commission DMs", () => {
  const career = { key: "navy", terms: 7, rank: 5, ranks: CAREERS.navy.ranks, commissioned: true, musterDMs: 1, extraMuster: 0, cashRolls: 0, forfeit: false, regained: 0, cashOnly: false };
  const plan = planMuster(career);
  assert.deepEqual(plan.rolls.slice(0, 7).map(r => r.column), ["material", "cash", "material", "cash", "material", "cash", "material"]);
  assert.equal(plan.rolls.length, 10);   // 7 terms + 3 rank rolls
  assert.equal(plan.dmTokens, 3);        // rank 5 commissioned: 2, event: 1
  assert.equal(planMuster({ ...career, forfeit: true }).rolls.length, 0);
  assert.equal(planMuster({ ...career, forfeit: true, regained: 1 }).rolls.length, 1);
  assert.ok(planMuster({ ...career, cashOnly: true }).rolls.every(r => r.column !== "material"));
});

test("bonus mustering rolls cannot exceed three Monetary rolls", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 10, 10),
    career: ["navy"], enlist: [[6, 6]],
    promotion: [[6, 6], [6, 6], [6, 6], [6, 6], [6, 6], [6, 6]], commission: [[6, 6]],
    continue: ["continue", "continue", "continue", "continue", "continue", "stop"],
    "muster-dm": ["no", "no", "no", "no", "no", "no", "no", "no", "no", "no"],
    muster: [[6], [6], [6], [6], [6], [6], [6], [6], [6], [6]]
  }));
  const navy = s.careers[0];
  assert.equal(navy.terms, 6);
  assert.equal(navy.rank, 6);
  const cols = seen.filter(p => p.id === "muster-column");
  assert.equal(cols.length, 4);
  for (const c of cols) assert.deepEqual(c.options.map(o => o.value), ["material"].concat([]).concat(c.options.length > 1 ? ["cash"] : []));
  assert.ok(cols.every(c => c.options.length === 1 || c.options.length === 2));
  const cashRolls = s.log.filter(e => e.kind === "roll" && /^Monetary/.test(e.text)).length;
  assert.ok(cashRolls <= 3);
  assert.equal(s.pension.monthly, 500);
});

test("specialised skills: rank 0 covers all, a second gain picks a specialty", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 7, 7),
    career: ["marines"], enlist: [[6, 6]],
    "basic-service": ["3"], "basic-education": ["1"],
    continue: ["continue", "continue", "stop"], reenlist: [[6, 6], [6, 6]],
    table: ["personal", "personal"], skill: [[6], [4]],
    specialty: []
  }));
  assert.equal(s.skills["Melee Combat"], 0);
  assert.equal(s.skills["Melee Combat (Hand-to-Hand)"], 1);
  assert.equal(s.skills["Melee Combat (Blade)"], 1);
  assert.ok(!seen.some(p => p.id === "specialty"));   // the table fixes the specialty
  assert.match(skillText(s), /Melee Combat 0 \(Blade 1, Hand-to-Hand 1\)/);
});

test("an open specialised skill asks for a specialty", () => {
  const { s, seen } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 7, 7),
    career: ["scouts"], continue: ["continue", "stop"],
    table: ["service"], skill: [[1]], specialty: ["Aircraft"]
  }));
  const p = seen.find(q => q.id === "specialty");
  assert.deepEqual(p.options.map(o => o.value), ["Starship", "Aircraft"]);
  assert.equal(s.skills.Pilot, 0);
  assert.equal(s.skills["Pilot (Aircraft)"], 1);
});

test("Advanced Education needs EDU 8+, officer table needs a commission", () => {
  const { seen } = drive(base({
    characteristics: twelve(7, 7, 7, 7, 7, 7),
    career: ["scouts"], continue: ["continue", "stop"]
  }));
  assert.deepEqual(seen.find(p => p.id === "table").options.map(o => o.value), ["personal", "service", "education"]);
  const r2 = drive(base({
    characteristics: twelve(7, 7, 7, 7, 9, 7),
    career: ["navy"], enlist: [[6, 6]], promotion: [[6, 6]], commission: [[6, 6]], continue: ["continue", "stop"]
  }));
  assert.deepEqual(r2.seen.find(p => p.id === "table").options.map(o => o.value), ["personal", "service", "education", "advanced", "officer"]);
});

const ev = (extra) => ({ "opt-events": ["yes"], "opt-psionics": ["no"], characteristics: twelve(7, 7, 7, 7, 7, 7), ...extra });

test("Chewed Up and Spat Out: discharged, military only by draft", () => {
  const { s, seen } = drive(ev({ career: ["navy", "scouts"], enlist: [[6, 6], [6, 6]], event: [[1]], continue: ["stop"] }));
  assert.equal(s.careers[0].ended, "discharged");
  assert.equal(s.bans.militaryEnlist, true);
  const second = seen.filter(p => p.id === "career")[1];
  assert.deepEqual(second.options.map(o => o.value), ["scouts", "merchants", "civilian", "stop"]);
});

test("Up for Promotion promotes and commissions a rank 1 character", () => {
  const { s } = drive(ev({
    career: ["army"], enlist: [[6, 6]], event: [[5], [2]], "event-check": [[4, 4]], "improve-skill": [],
    promotion: [[6, 6], [1, 1]], commission: [[1, 1]], continue: ["continue", "stop"]
  }));
  const army = s.careers[0];
  // Term 1: Warzone success (8) and promotion to 1 (commission fails). Term 2: event 2+1 = 3 Up for Promotion.
  assert.equal(army.rank, 2);
  assert.equal(army.commissioned, true);
});

test("Espionage failure sends the character to prison and forfeits muster rolls", () => {
  const { s, texts } = drive(ev({
    career: ["navy"], enlist: [[6, 6]], event: [[4]], espionage: ["yes"], "event-check": [[1, 2], [6, 6], [6, 6]],
    sentence: [[2]], prison: [[1], [2]], "prison-skill": ["Athlete", "Gambling"], career2: []
  }));
  assert.equal(s.careers[0].forfeit, true);
  assert.equal(s.careers[1].key, "prison");
  assert.equal(s.careers[1].terms, 2);
  assert.equal(s.terms, 3);
  assert.equal(s.age, 30);
  assert.equal(s.skills.Athlete, 1);
  assert.equal(s.skills.Gambling, 1);
  assert.ok(texts.includes("No mustering out benefits (criminal record)."));
  assert.deepEqual(validate(s), []);
});

test("prison Hit the Books releases early and regains one muster roll", () => {
  const { s } = drive(ev({
    career: ["navy"], enlist: [[6, 6]], event: [[4]], espionage: ["yes"], "event-check": [[1, 2], [6, 6]],
    sentence: [[3]], prison: [[5]], "prison-skill": ["Mechanic"], "muster-column": ["cash"], muster: [[6]]
  }));
  assert.equal(s.careers[1].terms, 1);
  assert.equal(s.careers[0].regained, 1);
  assert.equal(s.credits, 50000);
  assert.equal(s.age, 26);
});

test("Warzone result of 2 kills the character", () => {
  const { s } = drive(ev({ characteristics: twelve(7, 4, 7, 7, 7, 7), career: ["army"], enlist: [[6, 6]], event: [[5]], "event-check": [[1, 2]] }));
  // DEX 4 gives -1: 3 - 1 = 2.
  assert.equal(s.status, "dead");
});

test("Shell-Shocked failure: PTSD, medical discharge, no military careers", () => {
  // Event roll is 1D + (terms - 1). Terms 1-3 roll Up for Promotion (3), term 4 Espionage (declined), term 5 Shell-Shocked (10).
  const r = drive(ev({
    career: ["army", "civilian"], enlist: [[6, 6], [6, 6]],
    continue: ["continue", "continue", "continue", "continue"], reenlist: [[6, 6], [6, 6], [6, 6], [6, 6]],
    event: [[3], [2], [1], [1], [6]], espionage: ["no"], "event-check": [[1, 1, 1, 1]],
    promotion: [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1]],
    aging: Array(6).fill([6, 6])
  }));
  assert.equal(r.s.careers[0].terms, 5);
  assert.equal(r.s.careers[0].rank, 3);
  assert.equal(r.s.careers[0].commissioned, true);   // Up for Promotion at rank 1+
  assert.equal(r.s.careers[0].ended, "discharged");
  assert.equal(r.s.bans.military, true);
  assert.equal(r.s.chars.int, 6);   // PTSD D3=1 -> INT, loss D3=1
  const next = r.seen.filter(p => p.id === "career").at(-1);
  assert.ok(next.options.every(o => !["navy", "marines", "army"].includes(o.value)));
  assert.equal(r.s.pension.monthly, 400);   // 5 terms in the Army
});

test("Forced Retirement: no reenlistment in any career", () => {
  const r = drive(ev({
    career: ["civilian"], continue: Array(12).fill("continue"), reenlist: Array(12).fill([6, 6]),
    event: [[6], [6], [6], [6], [6], [6], [6], [6]], unique: [[6]], "event-check": Array(20).fill([6, 6]),
    aging: Array(30).fill([6, 6])
  }));
  assert.equal(r.s.bans.retired, true);
  const lastContinue = r.seen.filter(p => p.id === "continue").at(-1);
  assert.ok(lastContinue === undefined || r.s.status === "done");
  assert.equal(r.s.status, "done");
  assert.deepEqual(validate(r.s), []);
});

test("Inheritance (non-military 2) rolls 1D+1 on the Merchant or Civilian column", () => {
  const r = drive(ev({ career: ["civilian"], event: [[2]], "inherit-kind": [[2]], inherit: [[6]], continue: ["stop"] }));
  assert.ok(r.s.credits >= 100000);   // Civilian Monetary row 7
  const m = drive(ev({ career: ["civilian"], event: [[2]], "inherit-kind": [[1]], inherit: [[6]], continue: ["stop"] }));
  assert.ok(m.texts.includes("Gain a Merchant Ship (age 10 years)"));
});

test("Made Redundant failure gives only cash benefits", () => {
  const r = drive(ev({ career: ["civilian"], event: [[6], [6]], "event-check": [[6, 6], [1, 1]], continue: ["continue"], reenlist: [[6, 6]], secret: ["nothing"], muster: [[6]] }));
  // Term 1: Secret (6), success. Term 2: 6 + 1 = 7 Made Redundant, failure.
  const civ = r.s.careers[0];
  assert.equal(civ.cashOnly, true);
  assert.equal(civ.ended, "fired");
  assert.deepEqual(planMuster(civ).rolls.map(x => x.column), ["cash"]);
  assert.equal(r.s.credits, 50000);
  assert.equal(r.s.items.length, 0);
});

test("Legal Trouble fine goes into debt when the character cannot pay", () => {
  const r = drive(ev({
    career: ["civilian"], event: [[6], [6], [6]], "event-check": [[6, 6], [6, 6], [2, 2]],
    continue: ["continue", "continue", "stop"], reenlist: [[6, 6], [6, 6]], secret: ["nothing"], rivalry: [], fine: []
  }));
  // Term 2: 7 Made Redundant success. Term 3: 6 + 2 = 8 Heated Rivalry (compete, success).
  assert.equal(r.s.careers[0].musterDMs, 1);
  const l = drive(ev({
    career: ["civilian"], event: [[6], [6], [6], [6]], "event-check": [[6, 6], [6, 6], [6, 6], [2, 2, 1, 1]],
    continue: ["continue", "continue", "continue", "stop"], reenlist: [[6, 6], [6, 6], [6, 6]], secret: ["nothing"], rivalry: ["compete"],
    aging: [[6, 6], [6, 6], [6, 6]]
  }));
  // Term 4: 6 + 3 = 9 Legal Trouble: SOC 7 total 4 -> fine 2D(1+1) x 5000 = 10000.
  assert.equal(l.s.debt, 10000);
  assert.ok(l.texts.some(t => /^Fined 10000cr/.test(t)));
});

test("undo returns to the previous step and keeps earlier dice", () => {
  const lp = new Lifepath({ dice: seededDice(42) });
  lp.respond("no"); lp.respond("no"); lp.respond(null);
  const uppBefore = upp(lp.state);
  const pending = lp.pending;
  lp.respond(pending.auto);
  const after = lp.pending;
  assert.ok(lp.undo());
  assert.equal(upp(lp.state), uppBefore);
  assert.deepEqual(lp.pending, pending);
  lp.respond(pending.auto);
  assert.equal(lp.pending.id, after.id);
  while (lp.canUndo) lp.undo();
  assert.equal(lp.pending.id, "opt-events");
});

test("same seed gives the same character", () => {
  const a = new Lifepath({ dice: seededDice(5) }); a.autoRun();
  const b = new Lifepath({ dice: seededDice(5) }); b.autoRun();
  assert.deepEqual(a.state, b.state);
});

test("output: actor data, summary, and history HTML", () => {
  const lp = new Lifepath({ dice: seededDice(11) });
  lp.autoRun();
  const d = actorData(lp.state);
  assert.equal(d.system.chargenComplete, true);
  assert.equal(d.system.characteristics.str.max, lp.state.chars.str);
  assert.equal(d.system.age, lp.state.age);
  assert.ok(d.skills.every(x => typeof x.skill === "string" && Number.isInteger(x.rank)));
  assert.match(historyHTML(lp.state), /<h2>Lifepath<\/h2>/);
  assert.equal(summary(lp.state).upp.length, 6);
});

/** Random policy: any option. Covers every branch the dice reach. */
function randomRuns(n, events, psionics) {
  const counts = { dead: 0, prison: 0, drafted: 0, commissioned: 0, retired: 0, events: new Set() };
  for (let i = 0; i < n; i++) {
    const rnd = seededDice(1000 + i * 7919 + (events ? 1 : 0));
    const lp = new Lifepath({ dice: seededDice(i + 1 + (events ? 50000 : 0)) });
    lp.autoRun({
      policy: p => {
        if (p.id === "opt-events") return events ? "yes" : "no";
        if (p.id === "opt-psionics") return psionics ? "yes" : "no";
        if (p.type === "dead") { counts.dead++; return "restart"; }
        // Keep careers short most of the time so runs end.
        if (p.id === "continue" && rnd(6) <= 2) return p.options.at(-1).value;
        return p.options[rnd(p.options.length) - 1].value;
      }
    });
    const s = lp.state;
    assert.deepEqual(validate(s), [], `run ${i}: ${validate(s).join("; ")}`);
    assert.ok(actorData(s).system.history.length > 0);
    if (s.careers.some(c => c.key === "prison")) counts.prison++;
    if (s.careers.some(c => c.drafted)) counts.drafted++;
    if (s.careers.some(c => c.commissioned)) counts.commissioned++;
    if (s.bans.retired) counts.retired++;
    for (const e of s.log) if (e.kind === "event") counts.events.add(e.text);
  }
  return counts;
}

test("2000 random full runs always end with a valid character", () => {
  const a = randomRuns(1000, false, true);
  const b = randomRuns(1000, true, true);
  assert.ok(a.drafted > 0 && a.commissioned > 0);
  assert.ok(b.prison > 0, "some runs reach prison");
  assert.ok(b.events.size >= 20, `events seen: ${b.events.size}`);
});
