/**
 * Patrons and jobs (p.50-55): the patron generator and the patron actor. Foundry glue around
 * rules/patron.mjs.
 */
import * as patronRules from "./rules/patron.mjs";
import { rollCharacteristics } from "./rules/npc.mjs";
import { patronCard } from "./cards/campaign.mjs";
import { esc } from "./cards/common.mjs";
import { PATRON_FOLDER, actorOption, dice, postToolsCard, rankOf, resolveWorld, socDMOf } from "./context.mjs";
import { createNpcActor } from "./npcs.mjs";

/**
 * Generate a patron and a job (p.50-55) for the actor: SOC DM on the terms, Broker on the
 * payment, Streetwise (criminal) or Carouse (carouse) on the search. The starport defaults to
 * the current world's. Posts a card and returns the rules result.
 */
export async function generatePatron({ location = "carouse", starport = null, actor, multipleObjectives = false, chat = true } = {}) {
  const speaker = await actorOption(actor);
  const w = resolveWorld(undefined);
  const findDM = location === "criminal" ? rankOf(speaker, "Streetwise") : location === "carouse" ? rankOf(speaker, "Carouse") : 0;
  const r = patronRules.generatePatron(dice(), {
    location, starport: starport ?? w?.starport ?? "C", socDM: socDMOf(speaker), brokerDM: rankOf(speaker, "Broker"), findDM, multipleObjectives
  });
  if (chat) await postToolsCard(patronCard(r), { kind: "patron", data: r, actor: speaker });
  return r;
}

/** Create the patron NPC actor (in "Spacer: Patrons") of a `generatePatron` result. */
export function createPatronActor(data) {
  const p = data.patron;
  const npc = { type: p.name, demeanour: p.demeanour, characteristics: rollCharacteristics(dice()) };
  const notes = `<p>Personality: ${esc(p.personality)}. Feature: ${esc(p.feature)}.</p><p>Job: ${esc(data.job.type)}: ${esc(data.job.objectives.map(o => o.text).join("; "))}</p>`;
  return createNpcActor(npc, { name: `${p.name} (patron)`, folder: PATRON_FOLDER, notes, flagKey: "patron", flagData: data });
}

/** Chat card buttons of the patron card (registered by register.mjs). */
export const campaignChatActions = {
  "tools-create-patron": async (event, button, message) => {
    const a = await createPatronActor(message.flags.spacer.tools.data);
    a?.sheet?.render(true);
  }
};
