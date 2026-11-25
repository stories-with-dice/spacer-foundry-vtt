/**
 * Chat cards of the solo oracle and random events (not from the book). Pure. Called by
 * module/tools/oracle.mjs.
 */
import { row, signed } from "./common.mjs";

/** Card data of an `askOracle` result (rules/oracle.mjs). */
export function oracleCard(r) {
  const sections = [{ rows: [row("Likelihood", `${r.likelihood} (${signed(r.dm)})`), row("Roll", `2D ${r.dice.join("+")} ${signed(r.dm)} = ${r.total}`, "8+ yes; 12 yes-and; 2 no-and")] }];
  if (r.event) sections.push({ heading: "Random event (doubles)", rows: [row("Focus", r.event.focus), row("Detail", r.event.detail)] });
  return { title: "Solo oracle (not from the book)", subtitle: r.question || "Yes/no question", icon: "fa-solid fa-eye", headline: r.answer, sections };
}

/** Card data of a `randomEvent` result (rules/oracle.mjs). */
export function eventCard(e) {
  return { title: "Random event (not from the book)", subtitle: "Details from the book's tables", icon: "fa-solid fa-bolt", headline: e.focus, sections: [{ rows: [row("Detail", e.detail)] }] };
}
