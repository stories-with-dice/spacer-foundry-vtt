/**
 * Starport (p.60-61), settlement (p.102-103), and space (p.80-82) encounters. Foundry glue around
 * rules/starport.mjs and rules/space.mjs.
 */
import * as starportRules from "./rules/starport.mjs";
import * as spaceRules from "./rules/space.mjs";
import { rollCharacteristics } from "./rules/npc.mjs";
import * as cards from "./cards/encounters.mjs";
import { actorOption, dice, postToolsCard, resolveWorld, socDMOf } from "./context.mjs";

/** The lowest SOC among the player characters (legal encounters, p.60), or 7 without any. */
function lowestSoc() {
  const pcs = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
  if (!pcs.length) return 7;
  return Math.min(...pcs.map(a => a.system.characteristics.soc.value));
}

/** A starport encounter (p.60-61) on the world (default: the current world). Posts a card. */
export async function starportEncounter({ world, actor, chat = true } = {}) {
  const speaker = await actorOption(actor);
  const r = starportRules.starportEncounter(dice(), { world: resolveWorld(world) ?? {}, lowestSoc: lowestSoc(), socDM: socDMOf(speaker) });
  if (r.npc) r.npc.characteristics = rollCharacteristics(dice(), { hits: r.npc.hits });
  if (chat) await postToolsCard(cards.starportCard(r), { kind: "starport", data: r.npc ?? r, actor: speaker });
  return r;
}

/** A settlement encounter (p.102-103); `checkLegal` rolls the daily legal check first. Posts a card. */
export async function settlementEncounter({ world, actor, checkLegal = false, chat = true } = {}) {
  const speaker = await actorOption(actor);
  const r = starportRules.settlementEncounter(dice(), { world: resolveWorld(world) ?? {}, socDM: socDMOf(speaker), checkLegal });
  if (r.npc) r.npc.characteristics = rollCharacteristics(dice(), { hits: r.npc.hits });
  if (chat) await postToolsCard(cards.settlementCard(r), { kind: "settlement", data: r.npc ?? r, actor: speaker });
  return r;
}

/** A space encounter check (p.80) at a location key of SPACE_LOCATIONS. Posts a card. */
export async function spaceEncounter({ location = "settled", jump = false, force = false, chat = true } = {}) {
  const r = spaceRules.spaceEncounter(dice(), { location, jump, force });
  if (chat) await postToolsCard(cards.spaceCard(r), { kind: "space", data: r });
  return r;
}

/** Ship communication or scan (p.82). Posts a card. */
export async function shipReaction({ scanning = false, militarySensors = false, dm = 0, chat = true } = {}) {
  const r = spaceRules.shipReaction(dice(), { scanning, militarySensors, dm });
  if (chat) await postToolsCard(cards.shipReactionCard(r, { scanning }), { kind: "ship", data: r });
  return r;
}
