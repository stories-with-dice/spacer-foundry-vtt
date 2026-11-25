/**
 * NPC procedures (p.56-59): notable NPCs, random NPCs, information and rumours, demeanour, and
 * NPC actors. Foundry glue around rules/npc.mjs.
 */
import { CHARACTERISTICS } from "../config.mjs";
import * as npcRules from "./rules/npc.mjs";
import * as cards from "./cards/npcs.mjs";
import { esc, signed } from "./cards/common.mjs";
import { NPC_FOLDER, actorOption, dice, ensureFolder, postToolsCard, resolveWorld, socDMOf } from "./context.mjs";

/**
 * Create an NPC actor in "Spacer: NPCs" (or `folder`) from a generated NPC: characteristics,
 * role, demeanour, quantity, and a short biography. The generated data goes to
 * flags.spacer.<flagKey>. Called by the generators (`create: true`) and the card buttons.
 */
export async function createNpcActor(npc, { name = null, folder = NPC_FOLDER, role = null, notes = "", flagKey = "npc", flagData = null } = {}) {
  const f = await ensureFolder(folder, "Actor");
  const characteristics = {};
  for (const k of CHARACTERISTICS) characteristics[k] = { value: npc.characteristics[k], max: npc.characteristics[k] };
  const bio = [
    npc.type ? `<p><strong>${esc(npc.type)}</strong>${npc.quality ? ` (${esc(npc.quality)})` : ""}</p>` : "",
    npc.weapon ? `<p>Weapon: ${esc(npc.weapon)}</p>` : "",
    npc.armour ? `<p>Armour: ${esc(npc.armour)}</p>` : "",
    npc.attack !== undefined ? `<p>Attack DM: ${signed(npc.attack)}</p>` : "",
    npc.avoid ? `<p>Avoid: ${npc.avoid}+</p>` : "",
    notes
  ].join("");
  return Actor.create({
    name: name ?? npc.type ?? npc.who ?? "NPC",
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    folder: f.id,
    system: {
      characteristics,
      role: role ?? npc.type ?? npc.who ?? "",
      demeanour: npc.demeanour?.label ?? npc.reaction?.label ?? "",
      quantity: npc.count ?? 1,
      biography: bio
    },
    flags: { spacer: { [flagKey]: flagData ?? npc } }
  });
}

/** A notable NPC (p.56) for the world, with the actor's SOC DM on the demeanour. Posts a card; `create` makes the actor. */
export async function generateNpc({ world, actor, create = false, chat = true } = {}) {
  const speaker = await actorOption(actor);
  const r = npcRules.generateNpc(dice(), { world: resolveWorld(world), socDM: socDMOf(speaker) });
  if (chat) await postToolsCard(cards.npcCard(r), { kind: "npc", data: r, actor: speaker });
  if (create) r.actor = await createNpcActor(r);
  return r;
}

/** A random NPC encounter (p.59); `range` is "31-56", "D36", or null. Posts a card; `create` makes the actor. */
export async function randomNpc({ range = null, actor, create = false, chat = true } = {}) {
  const speaker = await actorOption(actor);
  const r = npcRules.rollRandomNpc(dice(), { range: typeof range === "string" ? npcRules.parseRange(range) : range, socDM: socDMOf(speaker) });
  r.characteristics = npcRules.rollCharacteristics(dice(), { hits: r.hits });
  if (chat) await postToolsCard(cards.randomNpcCard(r), { kind: "randomnpc", data: r, actor: speaker });
  if (create) r.actor = await createNpcActor(r, { name: r.who });
  return r;
}

/** Information and rumours (p.57) with the actor's SOC DM. Posts a card. */
export async function rumours({ actor, chat = true } = {}) {
  const speaker = await actorOption(actor);
  const r = npcRules.rollInformation(dice(), { socDM: socDMOf(speaker) });
  if (chat) await postToolsCard(cards.informationCard(r), { kind: "information", data: r, actor: speaker });
  return r;
}

/** NPC demeanour (p.56): 2D + `dm`, or + the actor's SOC DM. Posts a card. */
export async function demeanour({ actor, dm = null, chat = true } = {}) {
  const speaker = await actorOption(actor);
  const r = npcRules.rollDemeanour(dice(), dm ?? socDMOf(speaker));
  if (chat) await postToolsCard(cards.demeanourCard(r), { kind: "demeanour", data: r, actor: speaker });
  return r;
}

/** Chat card buttons of the NPC cards (registered by register.mjs). */
export const npcChatActions = {
  "tools-create-npc": async (event, button, message) => {
    const a = await createNpcActor(message.flags.spacer.tools.data);
    a?.sheet?.render(true);
  },
  "tools-create-randomnpc": async (event, button, message) => {
    const data = message.flags.spacer?.tools?.data;
    if (!data?.who) return;
    const npc = { ...data, characteristics: data.characteristics ?? npcRules.rollCharacteristics(dice(), { hits: data.hits }) };
    const a = await createNpcActor(npc, { name: data.who });
    a?.sheet?.render(true);
  }
};
