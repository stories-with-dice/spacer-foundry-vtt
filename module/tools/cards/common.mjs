/**
 * Small helpers shared by the chat card builders in module/tools/cards/. Pure: no Foundry globals.
 *
 * A card is the data of templates/tools/card.hbs:
 * `{ title, subtitle, icon, headline, sections: [{ heading, rows, list, text }], buttons, footer }`.
 */
import { signed } from "../../shared/dice.mjs";

export { signed };

/** Credits as text: 1234567 -> "1,234,567cr". */
export const cr = n => `${Math.round(Number(n) || 0).toLocaleString("en-US")}cr`;

/** One card row. An empty value shows as an em dash, so a row never prints "undefined". */
export const row = (label, value, note) => ({ label, value: value === undefined || value === null || value === "" ? "—" : String(value), note });

/** A demeanour or reaction result as text: "Friendly (+1 DM; 2D 9)". */
export const reactionText = r => (r ? `${r.label} (${signed(r.dm)} DM; 2D ${r.roll})` : "—");

/** HTML-escape a value for journal pages built as strings. */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** A D66 code as two digits: 4 -> "04". */
export const code2 = n => String(n).padStart(2, "0");

/** The "Create NPC actor" button of the random NPC cards. */
export const CREATE_RANDOM_NPC = { action: "tools-create-randomnpc", label: "Create NPC actor", icon: "fa-solid fa-user-plus" };
