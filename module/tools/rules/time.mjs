/**
 * Time as a resource (book p.15). Pure clock arithmetic.
 *
 * The campaign clock counts seconds from the campaign start. The book's "universal month" is
 * 30 days (p.22), so a year here is 12 months of 30 days (360 days).
 */

/** One second (the clock unit). */
export const SECOND = 1;
/** Seconds in a minute. */
export const MINUTE = 60;
/** Seconds in an hour. */
export const HOUR = 3600;
/** Seconds in a day. */
export const DAY = 86400;
/** Seconds in a week. */
export const WEEK = 7 * DAY;
/** Seconds in a universal month of 30 days (p.22). */
export const MONTH = 30 * DAY;
/** Seconds in a year of 12 universal months. */
export const YEAR = 12 * MONTH;

/** The Activity Time intervals of p.15 plus week and month. `dice` marks the rolled 1D days step. */
export const INTERVALS = [
  { key: "10s", label: "10 s", seconds: 10, examples: "Combat round (p.40)" },
  { key: "10m", label: "10 min", seconds: 10 * MINUTE, examples: "Non-combat skill, room search, put on a vaccsuit" },
  { key: "1h", label: "1 h", seconds: HOUR, examples: "Search a cargo container, repair 1 hull point" },
  { key: "6h", label: "6 h", seconds: 6 * HOUR, examples: "Rumours, overland travel, build shelter, repair a vehicle hit" },
  { key: "1d", label: "1 day", seconds: DAY, examples: "Repair a ship system in a starport" },
  { key: "1Dd", label: "1D days", seconds: null, dice: "1D", unit: DAY, examples: "Track down a job (p.50)" },
  { key: "1w", label: "1 week", seconds: WEEK, examples: "One jump" },
  { key: "1mo", label: "1 month", seconds: MONTH, examples: "Loan, crew, and life support payments" }
];

/** Seconds for an interval key. Rolls the 1D days step with `dice`. */
export function intervalSeconds(key, dice) {
  const i = INTERVALS.find(x => x.key === key);
  if (!i) throw new Error(`unknown interval ${key}`);
  if (i.seconds !== null) return { seconds: i.seconds, label: i.label };
  const n = dice.roll(i.dice);
  return { seconds: n * i.unit, label: `${n} day${n === 1 ? "" : "s"} (1D)` };
}

/** Split a second count into a calendar date. Day, month, and year count from 1. */
export function toDate(seconds, startYear = 1) {
  const s = Math.max(0, Math.floor(seconds));
  const totalDays = Math.floor(s / DAY);
  const rest = s - totalDays * DAY;
  const year = startYear + Math.floor(totalDays / 360);
  const dayOfYear = totalDays % 360;
  return {
    totalDays: totalDays + 1,
    year,
    month: Math.floor(dayOfYear / 30) + 1,
    day: (dayOfYear % 30) + 1,
    hour: Math.floor(rest / HOUR),
    minute: Math.floor((rest % HOUR) / MINUTE),
    second: rest % MINUTE,
    week: Math.floor(totalDays / 7) + 1,
    monthIndex: Math.floor(totalDays / 30)
  };
}

const pad = n => String(n).padStart(2, "0");

/** "Year 1, Month 3, Day 12 · 14:30:00 (Day 72)" */
export function formatDate(seconds, startYear = 1) {
  const d = toDate(seconds, startYear);
  return `Year ${d.year}, Month ${d.month}, Day ${d.day} · ${pad(d.hour)}:${pad(d.minute)}:${pad(d.second)} (Day ${d.totalDays})`;
}

/** Planetside interval of the day (p.96): Morning, Afternoon, Evening, Night. */
export function dayPart(seconds) {
  const h = toDate(seconds).hour;
  if (h < 6) return "Night";
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

/** Short duration text: "1 month, 2 days, 6 h". */
export function formatDuration(seconds) {
  let s = Math.abs(Math.floor(seconds));
  const parts = [];
  const take = (size, one, many = `${one}s`) => {
    const n = Math.floor(s / size);
    if (n) { parts.push(`${n} ${n === 1 ? one : many}`); s -= n * size; }
  };
  take(MONTH, "month");
  take(DAY, "day");
  take(HOUR, "h", "h");
  take(MINUTE, "min", "min");
  if (s) parts.push(`${s} s`);
  return (seconds < 0 ? "-" : "") + (parts.join(", ") || "0 s");
}

/**
 * Month boundaries crossed when moving from `before` to `after` seconds.
 * Returns the new month indexes (0-based), e.g. [1, 2] when two months started.
 */
export function monthsCrossed(before, after) {
  const a = Math.floor(Math.max(0, before) / MONTH);
  const b = Math.floor(Math.max(0, after) / MONTH);
  const out = [];
  for (let m = a + 1; m <= b; m++) out.push(m);
  return out;
}

/**
 * Reminders for the start of a new month (p.22 pensions, p.68-72 ship loan, operating costs,
 * crew salaries, yearly maintenance). `ships` are `{ name, finances }` with the ShipData finances.
 */
export function monthlyReminders(monthIndex, ships = []) {
  const items = [
    "Pay the ship loan (monthly payment, p.68).",
    "Pay crew salaries (p.66).",
    "Pay life support and operating costs: 2000cr per stateroom per month (p.70).",
    "Ship fuel for systems: 1T per 100T of ship per month (p.76).",
    "Collect monthly pensions at an A or B starport (p.22)."
  ];
  if (monthIndex > 0 && monthIndex % 12 === 0) items.push("Yearly maintenance is due: two weeks, 0.1% of the ship's new price (p.70).");
  const shipLines = ships.map(s => {
    const f = s.finances ?? {};
    const total = ["mortgage", "maintenance", "crewSalaries", "lifeSupport", "fuelCost"].reduce((t, k) => t + (Number(f[k]) || 0), 0);
    return { name: s.name, total, ...f };
  });
  return { items, ships: shipLines };
}
