/**
 * Chat card of the patron and job generator (p.50-55). Pure. Called by module/tools/campaign.mjs.
 */
import { cr, row, reactionText, signed } from "./common.mjs";

/** Card data of a `generatePatron` result (rules/patron.mjs). */
export function patronCard(r) {
  const j = r.job;
  const sections = [
    {
      heading: "Finding a patron (p.50)",
      rows: [
        row("Location", `${r.location.label} (patron table ${r.location.range}, pay x${r.location.multiplier})`),
        row("Days searching", `${r.search.days} (starport ${r.search.starport})`),
        row("Check", `2D ${r.search.natural} ${signed(r.search.dm)} = ${r.search.roll}: ${r.search.found ? "patron found" : "no patron yet"}`, "8+")
      ]
    },
    {
      heading: "Patron (p.50-51)",
      rows: [
        row("Patron", `${r.patron.name} (${r.patron.code})`),
        row("Personality", r.patron.personality),
        row("Feature", r.patron.feature),
        row("Demeanour", reactionText(r.patron.demeanour))
      ]
    },
    {
      heading: `Job: ${j.type} (p.52-53)`,
      list: j.objectives.map(o => `${o.text} (2D ${o.roll})`),
      text: j.note
    },
    {
      heading: "Negotiations (p.54)",
      rows: [
        row("Time to complete", `${j.terms.time} (${j.terms.weeks} weeks)`),
        row("Location", `${j.terms.location}${j.terms.parsecs ? `: ${j.terms.parsecs} parsecs` : ""}`),
        row("Payment terms", j.paymentTerms.text),
        row("Job begins", j.start),
        row("Payment", j.payment.total !== null && j.payment.total !== undefined ? cr(j.payment.total) : "See below", j.payment.text),
        ...(j.payment.upFront ? [row("Paid up front", cr(j.payment.upFront))] : [])
      ]
    },
    {
      heading: "Destination (p.54-55)",
      rows: [
        row("Destination", `${j.destination.name}${j.destination.tl ? ` (TL ${j.destination.tl})` : ""}`),
        ...(j.destination.settlement ? [row("Settlement", `${j.destination.settlement.type}; ${j.destination.settlement.distance}`)] : []),
        ...(j.destination.colony ? [row("Colony", `Run by ${j.destination.colony.runner}; ${j.destination.colony.age} old; population ${j.destination.colony.population.toLocaleString("en-US")}`)] : [])
      ]
    },
    {
      heading: "If a complication occurs (p.55)",
      rows: [row("Who", j.complication.who), row("What", j.complication.what), row("Why", j.complication.why), row("How", j.complication.how)]
    }
  ];
  return {
    title: "Patron & job",
    subtitle: `${r.patron.name} · ${j.type}`,
    icon: "fa-solid fa-handshake",
    headline: j.objectives[0]?.text,
    sections,
    buttons: [{ action: "tools-create-patron", label: "Create patron NPC", icon: "fa-solid fa-user-plus" }]
  };
}
