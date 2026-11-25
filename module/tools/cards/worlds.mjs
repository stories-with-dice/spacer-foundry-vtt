/**
 * Chat cards of worlds and subsectors (p.88-95). Pure. Called by module/tools/worlds.mjs.
 * The journal pages are in cards/world-pages.mjs.
 */
import { toHex } from "../../config.mjs";
import { TRADE_CODES } from "../rules/trade.mjs";
import { cr, row } from "./common.mjs";

/** Rows of a world profile (UWP details), for the world card and the journal page. */
export function worldRows(w) {
  const d = w.details;
  return [
    row("Starport", `${w.starport}: ${d.starport.quality}`, `fuel ${d.starport.fuel}; ${d.starport.facilities}${w.highport ? "; highport" : ""}${d.starport.berthing ? `; berthing ${cr(d.starport.berthing)}` : ""}`),
    row("Size", `${toHex(w.size)}: ${d.size.diameter}`, `${d.size.gravity}${d.size.example ? `; e.g. ${d.size.example}` : ""}`),
    row("Atmosphere", `${toHex(w.atmosphere)}: ${d.atmosphere.name}`, d.atmosphere.gear ? `needs ${d.atmosphere.gear}` : ""),
    row("Hydrographics", `${toHex(w.hydrographics)}: ${d.hydrographics.percent}`, d.hydrographics.text),
    row("Population", `${toHex(w.population)}: ${d.population.inhabitants}`, d.population.text),
    row("Government", `${toHex(w.government)}: ${d.government.name}`),
    row("Law level", toHex(w.law)),
    row("Tech level", `${toHex(w.tl)}: ${d.tech}`, w.tlNote),
    row("Bases", w.bases.length ? w.bases.join(" ") : "None"),
    row("Trade codes", w.tradeCodes.length ? w.tradeCodes.map(c => `${c} (${TRADE_CODES[c] ?? c})`).join(", ") : "None"),
    row("Travel zone", w.zone === "A" ? "Amber" : w.zone === "R" ? "Red" : "Green"),
    row("Temperature", `${w.temperature.type} (${w.temperature.temp})`, w.temperature.text)
  ];
}

/** Card data of a generated world. `uuid` is the world journal; without it the card offers to create one. */
export function worldCard(w, { uuid = null } = {}) {
  const sys = w.system;
  const sections = [{ rows: worldRows(w) }];
  if (sys) sections.push({ heading: "Star system (p.88-89)", rows: [row("System code", sys.code), row("Primary star", `${sys.star.cls} (${sys.star.color}); HZ ${sys.star.hz}`), row("Other objects", sys.objects.map(o => o.type).join(", ") || "None")] });
  return {
    title: "World",
    subtitle: w.line,
    icon: "fa-solid fa-earth-americas",
    headline: `${w.name} ${w.uwp}`,
    sections,
    buttons: uuid ? [{ action: "tools-open", uuid, label: "Open journal", icon: "fa-solid fa-book-open" }] : [{ action: "tools-create-world", label: "Create journal", icon: "fa-solid fa-book" }]
  };
}

/** Card data of a generated subsector. `uuid` is the overview journal. */
export function subsectorCard(s, { uuid }) {
  return {
    title: "Subsector", subtitle: s.name, icon: "fa-solid fa-map",
    headline: `${s.worlds.length} worlds · capital ${s.capital ?? "none"}`,
    sections: [{ list: s.worlds.map(w => w.line) }],
    buttons: [{ action: "tools-open", uuid, label: "Open overview", icon: "fa-solid fa-book-open" }]
  };
}
