/**
 * Solo oracle and random events (not from the book). Foundry glue around rules/oracle.mjs.
 */
import * as oracleRules from "./rules/oracle.mjs";
import { oracleCard, eventCard } from "./cards/oracle.mjs";
import { dice, postToolsCard, resolveWorld } from "./context.mjs";

/** Ask a yes/no question with a likelihood key of LIKELIHOOD. Posts a card. */
export async function oracle({ question = "", likelihood = "even", chat = true } = {}) {
  const r = oracleRules.askOracle(dice(), { question, likelihood });
  if (chat) await postToolsCard(oracleCard(r), { kind: "oracle", data: r });
  return r;
}

/** A random event with details from the book's tables, for the current world. Posts a card. */
export async function randomEvent({ chat = true } = {}) {
  const r = oracleRules.randomEvent(dice(), { world: resolveWorld(undefined) });
  if (chat) await postToolsCard(eventCard(r), { kind: "event", data: r });
  return r;
}
