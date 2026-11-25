/**
 * Campaign clock (book p.15): a world setting with the elapsed seconds and a short log.
 * Crossing a month boundary posts the monthly reminders.
 */
import { INTERVALS, intervalSeconds, formatDate, formatDuration, monthsCrossed, monthlyReminders, toDate, dayPart } from "./rules/time.mjs";
import { SYSTEM_ID, localizer, setting } from "../shared/foundry.mjs";
import { clockCard } from "./cards/clock.mjs";
import { dice as foundryDice, postToolsCard } from "./context.mjs";

/** World setting of the clock: `{ seconds, startYear, log }`. */
export const CLOCK_SETTING = "toolsClock";
const LOG_SIZE = 30;
const L = localizer("SPACER.Tools");

/** Register the clock setting. Called by registerTools; `onChange` re-renders the tools apps. */
export function registerClockSetting(onChange) {
  game.settings.register(SYSTEM_ID, CLOCK_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { seconds: 0, startYear: 1, log: [] },
    onChange
  });
}

/** The clock: `{ seconds, startYear, log }` with safe defaults. */
export function getClock() {
  const c = setting(CLOCK_SETTING, {}) ?? {};
  return { seconds: Number(c.seconds) || 0, startYear: Number(c.startYear) || 1, log: Array.isArray(c.log) ? c.log : [] };
}

/** Display data of the clock for the Toolkit: date, time, day part, intervals, recent log. */
export function clockView() {
  const c = getClock();
  const d = toDate(c.seconds, c.startYear);
  return {
    ...c,
    date: formatDate(c.seconds, c.startYear),
    dateShort: `Y${d.year} M${d.month} D${d.day}`,
    time: `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`,
    dayPart: dayPart(c.seconds),
    totalDays: d.totalDays,
    intervals: INTERVALS.map(i => ({ key: i.key, label: i.label, examples: i.examples })),
    recent: c.log.slice(-6).reverse().map(e => ({ ...e, when: formatDate(e.at, c.startYear) }))
  };
}

/**
 * Advance the clock by an interval key ("6h", "1Dd", ...) or a number of seconds.
 * Returns { seconds, delta, date, months }. Posts a chat card when `chat` is true or a month
 * starts. GM only. Called by the Toolkit, survival tasks, and game.spacer.tools.clock.advance.
 */
export async function advanceClock(by, { label = "", dice = foundryDice(), chat = true } = {}) {
  if (!game.user.isGM) { ui.notifications.warn(L("Clock.GMOnly")); return null; }
  const c = getClock();
  let delta;
  let what = label;
  if (typeof by === "number") delta = Math.floor(by);
  else {
    const r = intervalSeconds(by, dice);
    delta = r.seconds;
    what = label || r.label;
  }
  const before = c.seconds;
  const after = Math.max(0, before + delta);
  const log = [...c.log, { at: after, delta, label: what || formatDuration(delta) }].slice(-LOG_SIZE);
  await game.settings.set(SYSTEM_ID, CLOCK_SETTING, { ...c, seconds: after, log });
  const months = monthsCrossed(before, after);
  const date = formatDate(after, c.startYear);
  if (months.length) {
    const ships = game.actors.filter(a => a.type === "ship" && a.hasPlayerOwner).map(a => ({ name: a.name, finances: a.system.finances }));
    await postToolsCard(clockCard({ date, label: what, delta: formatDuration(delta), reminders: monthlyReminders(months.at(-1), ships) }), { kind: "clock" });
  } else if (chat) {
    await postToolsCard(clockCard({ date, label: what, delta: formatDuration(delta) }), { kind: "clock" });
  }
  return { seconds: after, delta, date, months };
}

/** Set the clock to an absolute second count (and optionally the start year). Keeps the log. GM only. */
export async function setClock({ seconds = null, startYear = null } = {}) {
  if (!game.user.isGM) return null;
  const c = getClock();
  const next = { ...c };
  if (seconds !== null) next.seconds = Math.max(0, Math.floor(seconds));
  if (startYear !== null) next.startYear = Math.floor(startYear);
  await game.settings.set(SYSTEM_ID, CLOCK_SETTING, next);
  return next;
}

/** "Year 1, Month 3, Day 12 · ..." for a second count (default: now). */
export function formatClock(seconds = null) {
  const c = getClock();
  return formatDate(seconds ?? c.seconds, c.startYear);
}
