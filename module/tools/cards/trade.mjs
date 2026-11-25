/**
 * Chat cards of trade and transport (p.62-65): freight, passengers, mail, goods on offer, prices,
 * and negotiation. Pure. Called by module/tools/trade.mjs and the trade calculator.
 */
import { cr, row, signed } from "./common.mjs";

/** Card data of a `rollFreight` result (rules/trade.mjs). */
export function freightCard(r, { destination = "" } = {}) {
  return { title: "Freight", subtitle: `${destination ? `To ${destination} · ` : ""}p.62`, icon: "fa-solid fa-boxes-stacked",
    headline: `${r.lots.length} shipments, ${r.totalTons} tons, ${cr(r.totalPay)}`,
    sections: [{ list: r.lots.map((l, i) => `Shipment ${i + 1}: ${l.tons} tons, ${cr(l.pay)} (cannot be split)`) }] };
}

/** Card data of a `rollPassengers` result (rules/trade.mjs). */
export function passengersCard(r) {
  return { title: "Passengers", subtitle: `p.62 · DM ${signed(r.dm)}`, icon: "fa-solid fa-person-walking-luggage",
    headline: `Up to ${cr(r.total)}`,
    sections: [{ rows: ["high", "middle", "low"].map(k => row(`${k[0].toUpperCase()}${k.slice(1)} passage`, `${r[k].count} x ${cr(r[k].fare)}`, r[k].formula)) }] };
}

/** Card data of a `rollMail` result (rules/trade.mjs). */
export function mailCard(r) {
  return { title: "Mail contract", subtitle: "p.62", icon: "fa-solid fa-envelope",
    headline: r.success ? `Contract won: ${cr(r.pay)} per delivery` : "No contract this year",
    sections: [{ rows: [row("Negotiation", `2D ${r.natural} = ${r.total}`, `${r.target}+`)], text: r.note }] };
}

/** Card data of a `goodsAvailable` result (rules/trade.mjs) at the world `origin` ({ name, codes }). */
export function goodsCard(r, origin, title = "Goods on offer") {
  return {
    title, subtitle: `${origin.name} · ${origin.codes.join(" ") || "no trade codes"} (p.63-64)`,
    icon: "fa-solid fa-boxes-stacked",
    sections: [{ list: r.list.map(g => `${g.code} ${g.name}: ${g.tons} tons at ${cr(g.price)} base`) }],
    footer: `Extra stock from the d66 roll: ${r.extra.code} ${r.extra.name}`
  };
}

/** Card data of a rolled price `l` (the trade calculator's last price) with the negotiators `s`. */
export function priceCard(l, s) {
  return {
    title: l.mode === "purchase" ? "Purchase price" : "Sale price",
    subtitle: `${l.code} ${l.name} · ${l.world} (p.63)`,
    icon: "fa-solid fa-coins",
    headline: `${l.percent}% · ${l.perTonText} per ton · ${l.tons} tons = ${l.costText}`,
    sections: [{ rows: [
      row("Roll", `2D ${l.natural} + Broker ${s.broker} ${signed(l.goodDM)} trade DM${l.mode === "purchase" ? ` - seller ${s.sellerBroker}` : ""}${Number(s.hired) ? ` + hired ${s.hired}` : ""} = ${l.total}`),
      ...(l.fee ? [row("Hired broker fee", l.feeText)] : [])
    ] }]
  };
}

/** Card data of a `negotiate` result (rules/trade.mjs) for the price `l` and the Broker rank `broker`. */
export function negotiationCard(r, l, broker) {
  return {
    title: "Price negotiation", subtitle: `${l.code} ${l.name} (p.65)`, icon: "fa-solid fa-handshake-angle",
    headline: r.success ? `Deal at ${r.percent}%: ${cr(r.perTon)} per ton, ${cr(r.cost)}` : `No deal; the price stays at ${r.percent}%`,
    sections: [{ rows: [
      row("Trader's opinion", `${r.opinion.label} (${signed(r.opinion.dm)})`),
      row("Roll", `2D ${r.natural} + Broker ${broker} ${signed(r.opinion.dm)} opinion ${signed(r.stepDM)} steps = ${r.total}`, "8+")
    ] }]
  };
}
