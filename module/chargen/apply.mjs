/** Write a finished lifepath to a character actor. Foundry layer: uses compendiums and documents. */
import { actorData, summary, historyHTML } from "./rules/engine.mjs";
import { SKILL_ALIASES } from "./rules/careers.mjs";

const norm = s => String(s ?? "").trim().toLowerCase();

/** Find a document in the spacer packs by name. Returns the compendium document or null. */
async function findInPacks(packNames, names) {
  for (const name of names) {
    for (const p of packNames) {
      const pack = game.packs.get(`spacer.${p}`);
      if (!pack) continue;
      const index = await pack.getIndex();
      const hit = index.find(e => norm(e.name) === norm(name));
      if (hit) return pack.getDocument(hit._id);
    }
  }
  return null;
}

/** Index the skills compendium by base skill name (system.skill or the item name). */
async function skillIndex() {
  const pack = game.packs.get("spacer.skills");
  const map = new Map();
  if (!pack) return map;
  const docs = await pack.getDocuments();
  for (const d of docs) {
    if (d.type !== "skill" || d.system.specialty) continue;
    map.set(norm(d.system.skill || d.name), d);
    map.set(norm(d.name), d);
  }
  return map;
}

function skillItemData(entry, source) {
  const name = entry.specialty ? `${entry.skill} (${entry.specialty})` : entry.skill;
  const data = source ? game.items.fromCompendium(source) : { type: "skill", system: {} };
  data.name = name;
  data.type = "skill";
  data.system = { ...(data.system ?? {}), skill: entry.skill, specialty: entry.specialty, rank: entry.rank };
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { spacer: { chargen: true } });
  return data;
}

/**
 * Apply the state to the actor: characteristics, age, terms, careers, credits, pension, debt,
 * PSI, history, skills (from spacer.skills when found), and benefit items. Replaces skills and
 * items from an earlier run of the wizard.
 */
export async function applyToActor(actor, state) {
  const d = actorData(state);
  const old = actor.items.filter(i => i.type === "skill" || i.getFlag("spacer", "chargen"));
  if (old.length) await actor.deleteEmbeddedDocuments("Item", old.map(i => i.id));

  await actor.update({ system: d.system, "flags.spacer.chargen": d.flags });

  const skills = await skillIndex();
  const items = [];
  for (const e of d.skills) {
    const src = skills.get(norm(e.skill)) ?? skills.get(norm(SKILL_ALIASES[e.skill])) ?? null;
    items.push(skillItemData(e, src));
  }
  for (const b of d.items) {
    const src = b.lookup?.length ? await findInPacks(b.type === "weapon" ? ["weapons", "gear", "armor"] : ["gear", "weapons", "armor"], b.lookup) : null;
    const data = src ? game.items.fromCompendium(src) : { name: b.name, type: "gear", system: { description: b.description ? `<p>${b.description}</p>` : "" } };
    if (src && b.name !== src.name) data.name = src.name;
    data.system ??= {};
    if ("quantity" in (src?.system ?? { quantity: 1 })) data.system.quantity = b.quantity ?? 1;
    data.flags = foundry.utils.mergeObject(data.flags ?? {}, { spacer: { chargen: true, benefit: b.name } });
    items.push(data);
  }
  if (items.length) await actor.createEmbeddedDocuments("Item", items);
  return actor;
}

/** Post a summary chat card. */
export async function postSummary(actor, state) {
  const s = summary(state);
  const content = await foundry.applications.handlebars.renderTemplate("systems/spacer/templates/chargen/chat-card.hbs", {
    name: actor.name, img: actor.img, ...s,
    careers: s.careers.map(c => ({ ...c, label: `${c.name} ${c.terms}${c.rankTitle ? `, ${c.rankTitle}` : ""}${c.commissioned ? " (officer)" : ""}` })),
    pensionText: s.pension.mode ? `${s.pension.mode === "yearly" ? s.pension.yearly : s.pension.monthly}cr ${s.pension.mode}` : ""
  });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { spacer: { chargen: true } } });
}

export { historyHTML };
