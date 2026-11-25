/**
 * Links from world codes to their definitions in the "25a World Codes" journal entry of the rules
 * compendium. Pure: builds Foundry content-link text (`@UUID[...]{label}`), which Foundry enriches
 * in journal text pages and in chat messages. Called by cards/worlds.mjs and cards/world-pages.mjs.
 *
 * Anchor scheme: each code has a heading with the id `<kind>-<code>`, the code as the world
 * profile shows it (UWP hex digits A-G, trade codes as "Ag", temperatures as "Frozen"). The ids
 * come from the generated rules/world-code-links.mjs.
 */
import { toHex } from "../../config.mjs";
import { WORLD_CODES_UUID, WORLD_CODE_PAGES } from "../rules/world-code-links.mjs";

/**
 * Link text to the definition of one code: `codeLink("government", "7")` returns
 * `@UUID[Compendium.spacer.rules.JournalEntry.<id>.JournalEntryPage.<id>#government-7]{7}`.
 * `label` defaults to the code. A code without an anchor returns the label alone.
 */
export function codeLink(kind, code, label = code) {
  const page = WORLD_CODE_PAGES[kind];
  const text = String(label ?? "").replace(/[[\]{}]/g, "");
  if (!page || !page.codes.includes(String(code))) return text;
  return `@UUID[${WORLD_CODES_UUID}.JournalEntryPage.${page.page}#${kind}-${code}]{${text}}`;
}

/** Link to a hex-coded value (size, atmosphere, ...): `hexLink("size", 10)` links "A". */
export const hexLink = (kind, n) => codeLink(kind, toHex(n));

/** The zone code of a world as `[code, label]`: "" is Green. */
export const zoneOf = zone => (zone === "A" ? ["A", "Amber"] : zone === "R" ? ["R", "Red"] : ["G", "Green"]);

/**
 * The UWP of a world with each character linked: "BA6A743-9" becomes nine links and a dash.
 * Called by the world journal page and the subsector overview.
 */
export function uwpLinks(w) {
  return [
    codeLink("starport", w.starport), hexLink("size", w.size), hexLink("atmosphere", w.atmosphere),
    hexLink("hydrographics", w.hydrographics), hexLink("population", w.population), hexLink("government", w.government),
    hexLink("law", w.law), "-", hexLink("tech", Math.min(16, w.tl))
  ].join("");
}

/** Base codes ("N", "S", ...) as links, joined by `sep`. */
export const basesLinks = (bases, sep = "") => (bases ?? []).map(c => codeLink("base", c)).join(sep);

/** Trade codes as links, joined by `sep`. */
export const tradeLinks = (codes, sep = " ") => (codes ?? []).map(c => codeLink("trade", c)).join(sep);

/**
 * The world line with links: "Name 0205 BA6A743-9 N Ri Wa A", where the UWP characters, bases,
 * trade codes, and zone link to their definitions. Returns `{ name, hex, uwp, bases, trade, zone }`
 * so the caller can escape the plain parts.
 */
export function worldLineParts(w) {
  return {
    name: w.name ?? "", hex: w.hex ?? "", uwp: uwpLinks(w), bases: basesLinks(w.bases),
    trade: tradeLinks(w.tradeCodes), zone: w.zone ? codeLink("zone", w.zone) : ""
  };
}
