/**
 * Solo oracle. NOT from the book: a yes/no question on 2D with likelihood DMs, and a random
 * event focus whose details use the book's own tables (NPC table and demeanour p.56,
 * information p.57, job complications p.55, patrons p.50). Pure.
 */
import { rollDemeanour, rollNpcType, INFORMATION } from "./npc.mjs";
import { rollComplication, PATRONS } from "./patron.mjs";

/** Likelihood DMs, centred on the 2D 8+ task target. */
export const LIKELIHOOD = {
  certain: { label: "Nearly certain", dm: 4 },
  likely: { label: "Likely", dm: 2 },
  even: { label: "50/50", dm: 0 },
  unlikely: { label: "Unlikely", dm: -2 },
  impossible: { label: "Nearly impossible", dm: -4 }
};

/**
 * Ask a yes/no question: 2D + DM, 8+ is yes. A natural 12 is "Yes, and...", a natural 2
 * "No, and...". A total of exactly 7 or 8 adds "but..." / "and..." nuance. Doubles trigger a
 * random event.
 */
export function askOracle(dice, { likelihood = "even", question = "" } = {}) {
  const l = LIKELIHOOD[likelihood] ?? LIKELIHOOD.even;
  const a = dice.d6();
  const b = dice.d6();
  const natural = a + b;
  const total = natural + l.dm;
  let answer;
  if (natural === 12) answer = "Yes, and…";
  else if (natural === 2) answer = "No, and…";
  else if (total >= 8) answer = total === 8 ? "Yes, but…" : "Yes";
  else answer = total === 7 ? "No, but…" : "No";
  const out = { kind: "oracle", question, likelihood: l.label, dm: l.dm, dice: [a, b], natural, total, answer, yes: answer.startsWith("Yes") };
  if (a === b) out.event = randomEvent(dice);
  return out;
}

/** Event focus, 1D. */
export const EVENT_FOCUS = [
  { focus: "A remote event", detail: "rumour" },
  { focus: "An NPC acts", detail: "npc" },
  { focus: "A new NPC appears", detail: "npc" },
  { focus: "A complication hits the current job", detail: "complication" },
  { focus: "A lead or opportunity", detail: "lead" },
  { focus: "A patron reaches out", detail: "patron" }
];

/** A random event: a focus, then details from the book's tables. */
export function randomEvent(dice, { world = null } = {}) {
  const r = dice.d6();
  const f = EVENT_FOCUS[r - 1];
  const out = { roll: r, focus: f.focus };
  if (f.detail === "npc") {
    const t = rollNpcType(dice, world);
    out.detail = `${t.type} (${t.quality}), ${rollDemeanour(dice).label.toLowerCase()}`;
  } else if (f.detail === "complication") {
    const c = rollComplication(dice);
    out.detail = `Who: ${c.who}; What: ${c.what}; Why: ${c.why}; How: ${c.how}`;
  } else if (f.detail === "lead" || f.detail === "rumour") {
    const row = f.detail === "lead" ? INFORMATION[dice.d6() <= 3 ? 0 : 3] : INFORMATION[dice.d6() <= 3 ? 4 : 5];
    const d = dice.roll(row.die);
    out.detail = `${row.type}: ${row.details[d - 1]}`;
  } else {
    const code = dice.d66();
    out.detail = `${PATRONS[code]}, ${rollDemeanour(dice).label.toLowerCase()}`;
  }
  return out;
}
