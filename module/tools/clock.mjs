/**
 * Campaign clock (book p.15): a world setting with the elapsed seconds and a short log.
 * Crossing a month boundary posts the monthly reminders.
 */
import { INTERVALS, intervalSeconds, formatDate, formatDuration, monthsCrossed, monthlyReminders, toDate, dayPart } from "./rules/time.mjs";
import { clockCard } from "./cards.mjs";
import { postCard } from "./chat.mjs";

export const CLOCK_SETTING = "toolsClock";
const LOG_SIZE = 30;

export function registerClockSetting(onChange) {
  game.settings.register("spacer", CLOCK_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { seconds: 0, startYear: 1, log: [] },
    onChange
  });
}

export function getClock() {
  const c = game.settings.get("spacer", CLOCK_SETTING) ?? {};
  return { seconds: Number(c.seconds) || 0, startYear: Number(c.startYear) || 1, log: Array.isArray(c.log) ? c.log : [] };
}

/** Display data of the clock. */
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
 * Returns { seconds, date, months }. Posts a chat card when `chat` is true or a month starts.
 */
export async function advanceClock(by, { label = "", dice, chat = true } = {}) {
  if (!game.user.isGM) { ui.notifications.warn(game.i18n.localize("SPACER.Tools.Clock.GMOnly")); return null; }
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
  await game.settings.set("spacer", CLOCK_SETTING, { ...c, seconds: after, log });
  const months = monthsCrossed(before, after);
  const date = formatDate(after, c.startYear);
  if (months.length) {
    const ships = game.actors.filter(a => a.type === "ship" && a.hasPlayerOwner).map(a => ({ name: a.name, finances: a.system.finances }));
    await postCard(clockCard({ date, label: what, delta: formatDuration(delta), reminders: monthlyReminders(months.at(-1), ships) }), { kind: "clock" });
  } else if (chat) {
    await postCard(clockCard({ date, label: what, delta: formatDuration(delta) }), { kind: "clock" });
  }
  return { seconds: after, delta, date, months };
}

/** Set the clock to an absolute second count (and optionally the start year). Clears no log. */
export async function setClock({ seconds = null, startYear = null } = {}) {
  if (!game.user.isGM) return null;
  const c = getClock();
  const next = { ...c };
  if (seconds !== null) next.seconds = Math.max(0, Math.floor(seconds));
  if (startYear !== null) next.startYear = Math.floor(startYear);
  await game.settings.set("spacer", CLOCK_SETTING, next);
  return next;
}
