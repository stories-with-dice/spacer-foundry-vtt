/**
 * Freight, passengers, and mail (p.62). Foundry glue around rules/trade.mjs. The speculative
 * trade window is apps/trade.mjs.
 */
import * as tradeRules from "./rules/trade.mjs";
import * as cards from "./cards/trade.mjs";
import { dice, postToolsCard, resolveWorld } from "./context.mjs";

/** Freight lots (p.62) for the destination world (default: the current world). Posts a card. */
export async function freight({ destination, chat = true } = {}) {
  const w = resolveWorld(destination);
  const r = tradeRules.rollFreight(dice(), { destinationPop: w?.pop ?? 5 });
  if (chat) await postToolsCard(cards.freightCard(r, { destination: w?.name }), { kind: "freight", data: r });
  return r;
}

/** Passengers (p.62) from `origin` to `destination` (default: the current world). Posts a card. */
export async function passengers({ origin, destination, chat = true } = {}) {
  const o = resolveWorld(origin);
  const d = destination ? resolveWorld(destination) : o;
  const r = tradeRules.rollPassengers(dice(), { originPop: o?.pop ?? 6, destinationPop: d?.pop ?? 6, zone: d?.zone ?? "" });
  if (chat) await postToolsCard(cards.passengersCard(r), { kind: "passengers", data: r });
  return r;
}

/** A mail contract negotiation (p.62). Posts a card. */
export async function mail({ subsidised = false, chat = true } = {}) {
  const r = tradeRules.rollMail(dice(), { subsidised });
  if (chat) await postToolsCard(cards.mailCard(r), { kind: "mail", data: r });
  return r;
}
