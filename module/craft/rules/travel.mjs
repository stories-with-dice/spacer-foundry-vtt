/**
 * Travel times: interplanetary, to a jump point, and jumps (book p.66-67, p.71).
 * Pure functions, no Foundry globals. Times are in hours.
 */
import { jumpFuel } from "./drives.mjs";

const m = n => n / 60;
const d = n => n * 24;

/** Interplanetary Travel Table (book p.67): hours by M-1 .. M-6. */
export const INTERPLANETARY = [
  { key: "orbit", km: 10_000, hours: [m(30), m(15), m(8), m(4), m(2), m(1)] },
  { key: "satellite", km: 100_000, hours: [4, 2, 1, m(30), m(15), m(8)] },
  { key: "moon", km: 500_000, hours: [18, 9, 6, 3, 1.5, m(45)] },
  { key: "station", km: 1_000_000, hours: [36, 18, 9, 6, 3, 1.5] },
  { key: "closePlanet", km: 50_000_000, hours: [d(3.5), 36, 18, 9, 6, 3] },
  { key: "farPlanet", km: 100_000_000, hours: [d(7), d(3.5), 36, 18, 9, 6] },
  { key: "gasGiant", km: 500_000_000, hours: [d(15), d(7), d(3.5), 36, 18, 9] },
  { key: "remoteGasGiant", km: 1_000_000_000, hours: [d(30), d(15), d(7), d(3.5), 36, 18] }
];

/**
 * Jump Point Travel Table (book p.67): hours from orbit to the jump point (100 diameters) by planet
 * size code 0-10 and gas giant, for M-1 .. M-6. Values as printed in the book.
 */
export const JUMP_POINT = {
  0: [2, 1.25, 1, m(50), m(45), m(40)],
  1: [2.25, 1.5, 1.15, 1, 1.25, 1],
  2: [3.25, 2.25, 1.75, 1.5, 1.5, 1.25],
  3: [4, 2.75, 2.25, 2, 1.75, 1.5],
  4: [4.5, 3, 2.5, 2.25, 2.25, 1.75],
  5: [5, 3.5, 3, 2.5, 2.5, 2],
  6: [5.5, 4, 3.25, 2.75, 2.5, 2.25],
  7: [6, 4.25, 3.5, 3, 2.75, 2.5],
  8: [6.5, 4.5, 3.5, 3.25, 2.75, 2.5],
  9: [6.75, 4.75, 4, 3.5, 3, 2.75],
  10: [7, 5, 4, 3.5, 3.5, 3],
  gasGiant: [19.5, 13.75, 11.25, 9.75, 8.75, 8]
};

/** Planet diameters by size code for the jump point table (book p.67). */
export const PLANET_DIAMETER_KM = { 0: 1000, 1: 1600, 2: 3200, 3: 4800, 4: 6400, 5: 8000, 6: 9600, 7: 11200, 8: 12800, 9: 14400, 10: 16000, gasGiant: 120500 };

function thrustColumn(thrust) {
  const t = Math.floor(Number(thrust) || 0);
  if (t <= 0) return -1;
  return Math.min(6, t) - 1;
}

/** Interplanetary travel time in hours for a table row (key or index) and thrust. null if no thrust. */
export function interplanetaryHours(row, thrust) {
  const r = typeof row === "number" ? INTERPLANETARY[row] : INTERPLANETARY.find(x => x.key === row);
  const c = thrustColumn(thrust);
  if (!r || c < 0) return null;
  return r.hours[c];
}

/**
 * Hours to the jump point. `size` is the world size code (0-10, hex letter "A" = 10) or "gasGiant".
 * Sizes above 10 use the size 10 row. null if the ship has no thrust.
 */
export function jumpPointHours(size, thrust) {
  const c = thrustColumn(thrust);
  if (c < 0) return null;
  let key = size;
  if (key !== "gasGiant") {
    key = typeof size === "string" && /^[A-Z]$/i.test(size) ? 10 + "ABCDEFGH".indexOf(size.toUpperCase()) : Number(size) || 0;
    key = Math.max(0, Math.min(10, key));
  }
  return JUMP_POINT[key][c];
}

/** Jump distance needed to stay outside 100 diameters (book p.67). */
export function jumpPointDistanceKm(size) {
  return 100 * (PLANET_DIAMETER_KM[size] ?? PLANET_DIAMETER_KM[10]);
}

/** A jump takes one week whatever the jump rating (book p.67). */
export const JUMP_HOURS = 168;

/**
 * Check a jump (book p.67, p.76, p.85).
 * @param {{parsecs:number, jumpRating:number, fuel:number}} o
 * @returns {{possible:boolean, reason:string, fuel:number, hours:number}}
 */
export function planJump({ parsecs, jumpRating, fuel }) {
  const p = Math.max(1, Math.floor(Number(parsecs) || 1));
  const need = jumpFuel(p);
  if ((Number(jumpRating) || 0) <= 0) return { possible: false, reason: "noJumpDrive", fuel: need, hours: JUMP_HOURS };
  if (p > jumpRating) return { possible: false, reason: "tooFar", fuel: need, hours: JUMP_HOURS };
  if ((Number(fuel) || 0) < need) return { possible: false, reason: "fuel", fuel: need, hours: JUMP_HOURS };
  return { possible: true, reason: "", fuel: need, hours: JUMP_HOURS };
}

/** Format hours as "1d 6h 15m". */
export function formatHours(hours) {
  if (hours === null || hours === undefined) return "-";
  let mins = Math.round(hours * 60);
  const days = Math.floor(mins / 1440); mins -= days * 1440;
  const h = Math.floor(mins / 60); mins -= h * 60;
  return [days && `${days}d`, h && `${h}h`, mins && `${mins}m`].filter(Boolean).join(" ") || "0m";
}

/** Gas giant skimming: 10T per hour, fuel scoops needed (book p.71). */
export function skimmingHours(tons) {
  return Math.ceil(Math.max(0, Number(tons) || 0) / 10);
}
/** Ocean refuelling: 10T per hour of skimming plus 1 hour of processing per 10T (book p.71). */
export function oceanRefuelHours(tons) {
  return 2 * Math.ceil(Math.max(0, Number(tons) || 0) / 10);
}
/** Refinery module: 5T per hour per refinery (book p.77). */
export function refiningHours(tons, refineries = 1) {
  return Math.ceil(Math.max(0, Number(tons) || 0) / (5 * Math.max(1, refineries)));
}
/** Gravitational slingshot bonus G by world size code (book p.71). */
export function slingshotBonus(size) {
  const s = typeof size === "string" && /^[A-Z]$/i.test(size) ? 10 + "ABCDEFGH".indexOf(size.toUpperCase()) : Number(size) || 0;
  if (s <= 2) return 0;
  if (s <= 6) return 1;
  if (s <= 12) return 2;
  return 3;
}

/** Spacing procedure step durations (book p.66), as book dice. */
export const PROCEDURE = {
  prepare: "1D",            // hours: load cargo, passengers, mail, refuel
  departure: "1D*10",       // minutes per skill check
  arrival: "1D",            // hours: customs, unload
  encounterTarget: 6        // per day: 1D 6+
};
