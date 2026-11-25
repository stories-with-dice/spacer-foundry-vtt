/**
 * Chat card of the campaign clock (p.15) and the monthly reminders. Pure. Called by
 * module/tools/clock.mjs.
 */
import { cr } from "./common.mjs";

/** Card data of a clock change: the new `date`, the `label` and `delta` of the step, and the month `reminders`. */
export function clockCard({ date, label, delta, reminders = null }) {
  const sections = [];
  if (reminders) {
    sections.push({ heading: "Monthly reminders", list: reminders.items });
    if (reminders.ships.length) sections.push({ heading: "Ship costs per month", list: reminders.ships.map(s => `${s.name}: ${cr(s.total)}`) });
  }
  return { title: reminders ? "New month" : "Time passes", subtitle: label ? `${label} (+${delta})` : "", icon: "fa-solid fa-clock", headline: date, sections };
}
