/**
 * Output of a lifepath run (book p.16-22): benefit items, the summary for the wizard and the chat
 * card, the data written to the actor, the history HTML, and a validity check. Pure: no Foundry
 * globals. The wizard, apply.mjs, and the tests call these functions.
 */
import { CHARS, CHAR_LABEL, SPECIALTIES, charDM, hex } from "./careers.mjs";
import { MAX_SKILL_RANK, upp } from "./state.mjs";
import { skillList, skillText, splitSkillKey, isSpecialised } from "./skills.mjs";

/**
 * Material benefits and event items of a state as item data for the actor:
 * [{ name, type, lookup, quantity, description }]. Called by summary() and actorData().
 */
export function benefitItems(s) {
  const out = s.items.map(i => ({ name: i.name, type: i.type ?? "gear", lookup: i.lookup ?? [i.name], quantity: i.quantity ?? 1, description: i.description ?? "" }));
  if (s.sss) out.push({ name: "Spacer Support Service Membership", type: "gear", lookup: ["Spacer Support Service Membership", "SSS Membership"], quantity: 1, description: "Lifetime SSS (Triple-S) membership: hostel stay at type A or B starports once a month, up to 10,000cr a year for medical and legal support (p.21)." });
  if (s.shipShares) out.push({ name: `Ship Shares (${s.shipShares}%)`, type: "gear", lookup: [], quantity: 1, description: `${s.shipShares}% off the 20% downpayment on a starship (p.21).` });
  if (s.ships.scout) out.push({ name: "Scout Ship", type: "gear", lookup: [], quantity: 1, description: `Used 100T scout ship, ${s.ships.scout} years old. ${s.ships.scout >= 40 ? "Decommissioned: owned outright." : "On loan from the Scouts until it is 40 years old."} The owner pays maintenance, fuel, and operating costs, and is on call for the scout service (p.21, p.69).` });
  if (s.ships.merchant) out.push({ name: "Merchant Ship", type: "gear", lookup: [], quantity: 1, description: `Used 200T trader, ${s.ships.merchant} years old. ${s.ships.merchant >= 40 ? "Owned outright." : "Under commission of the service."} 150,000cr monthly loan payment for the rest of the loan period (p.21, p.69).` });
  return out;
}

const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** One roll log entry as text: "2D [3, 4] +1 INT DM = 8 vs 8+ success". Used by the wizard and historyHTML(). */
export function rollText(r) {
  const mods = r.mods.map(m => `${m.value >= 0 ? "+" : ""}${m.value} ${m.label}`).join(" ");
  const faces = r.faces.length > 1 ? `[${r.faces.join(", ")}]` : `${r.faces[0]}`;
  const tgt = r.target !== null ? ` vs ${r.target}+ ${r.success ? "success" : "failure"}` : "";
  return `${r.dice} ${faces}${mods ? ` ${mods}` : ""} = ${r.total}${tgt}`;
}

/** The lifepath log of a state as HTML for `system.history`. Called by actorData() and apply.mjs. */
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

/**
 * Short summary of a state: UPP, characteristics, careers, skills, money, items, connections.
 * Called by the wizard (side panel) and postSummary() in apply.mjs (chat card).
 */
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

/**
 * Plain data to write to a character actor: { system, skills, items, flags }. The Foundry layer
 * (applyToActor in apply.mjs) adds items from compendiums.
 */
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

/** Check a finished state; used by the tests. Returns a list of problems (empty when valid). */
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
