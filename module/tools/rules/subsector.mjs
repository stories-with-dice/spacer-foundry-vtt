/**
 * Subsector generator (book p.88 and p.92): world presence per hex, the capital, the population
 * DMs of Step 4, and the courier routes. Pure.
 */
import { DENSITY, generateStarSystem, randomName } from "./world.mjs";

/** Hex label "0305" for column 3, row 5. */
export const hexLabel = (col, row) => `${String(col).padStart(2, "0")}${String(row).padStart(2, "0")}`;

/** Distance in parsecs between two hexes `{ col, row }` on an odd-q layout (columns down, odd columns high). */
export function hexDistance(a, b) {
  const toCube = ({ col, row }) => {
    const x = col;
    const z = row - Math.floor((col + (col & 1)) / 2);
    return { x, z, y: -x - z };
  };
  const p = toCube(a), q = toCube(b);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z));
}

/** Population of a world on a main courier route (p.88): 6+. */
export const ROUTE_POPULATION = 6;

/**
 * Population DMs of Step 4 (p.92) for one hex. `capital` is the capital's hex `{ col, row }`;
 * `routeWorlds` are the worlds already generated with population 6+ (route ends). Returns the
 * parts, for example `{ capital: 1, route: 1, capitalInSubsector: 2 }`. The dense subsector DM
 * is added by `generateStarSystem`. Called by `generateSubsector`.
 */
export function subsectorPopDMs(cell, { capital, routeWorlds = [], primaryCapital = true } = {}) {
  const parts = {};
  if (capital && hexDistance(cell, capital) <= 1) parts.capital = 1;
  if (routeWorlds.some(w => hexDistance(cell, w) <= 1)) parts.route = 1;
  if (primaryCapital) parts.capitalInSubsector = 2;
  return parts;
}

/**
 * Subsector (p.88): 8 x 10 hexes. For each hex roll 1D + density DM: 4+ inhabited system,
 * 1-3 empty, 0 or less an uninhabited (red dwarf) star system. Called by `generateSubsector` in
 * module/tools/worlds.mjs. Returns `{ name, hexes, worlds, capital, courierWorlds, ... }`.
 *
 * The population DMs of p.92 need the capital and the travel routes before the populations
 * exist, so the generator works in this order:
 * 1. Roll world presence for every hex.
 * 2. Pick the capital among the inhabited hexes with one die roll.
 * 3. Generate the capital first, then the other worlds from the nearest to the farthest.
 *    Each world gets +1 within 1 parsec of the capital, +1 within 1 parsec of a world already
 *    generated with population 6+ (a courier route end, p.88), +1 in a dense subsector, and +2
 *    when `primaryCapital` is true.
 *
 * `primaryCapital` (default true): the capital of the interstellar society is in this subsector.
 */
// BOOK: p.88 makes the capital "the planet with the highest population and tech level, or as
// the referee determines", but p.92 needs the capital before any population is rolled. We pick
// the capital hex first, at random among the inhabited hexes, as the referee would; it can end
// with a lower population than another world. The capital counts as "within 1 parsec" of itself.
// BOOK: "+2 if the capital is in the subsector" refers to the society's primary capital (p.88
// tells primary and local capitals apart); a lone subsector holds it, so `primaryCapital` is
// true by default.
// BOOK: routes link worlds of population 6+ (p.88), which do not exist yet when a world is
// rolled; we count a world as near a route when it is within 1 parsec of a world already
// generated with population 6+.
export function generateSubsector(dice, { name = "", density = "typical", cols = 8, rows = 10, sizeMode = "standard", primaryCapital = true } = {}) {
  const dm = DENSITY[density]?.dm ?? 0;
  const hexes = [];
  for (let col = 1; col <= cols; col++) {
    for (let row = 1; row <= rows; row++) {
      const roll = dice.d6() + dm;
      const kind = roll >= 4 ? "inhabited" : roll >= 1 ? "empty" : "uninhabited";
      hexes.push({ hex: hexLabel(col, row), col, row, roll, kind });
    }
  }
  const inhabited = hexes.filter(h => h.kind === "inhabited");
  const capitalCell = inhabited.length ? inhabited[dice.die(inhabited.length) - 1] : null;
  const order = [...inhabited].sort((a, b) => hexDistance(a, capitalCell) - hexDistance(b, capitalCell) || a.hex.localeCompare(b.hex));
  const worlds = [];
  for (const cell of order) {
    const routeWorlds = worlds.filter(w => w.population >= ROUTE_POPULATION);
    const popDMs = subsectorPopDMs(cell, { capital: capitalCell, routeWorlds, primaryCapital });
    const popDM = Object.values(popDMs).reduce((t, v) => t + v, 0);
    const w = generateStarSystem(dice, { hex: cell.hex, density, sizeMode, popDM });
    w.col = cell.col;
    w.row = cell.row;
    w.popDMs = density === "dense" ? { ...popDMs, dense: 1 } : popDMs;
    if (cell === capitalCell) w.capital = true;
    cell.world = w.name;
    worlds.push(w);
  }
  worlds.sort((a, b) => a.hex.localeCompare(b.hex));
  const capital = worlds.find(w => w.capital) ?? null;
  const courierWorlds = worlds.filter(w => w.population >= ROUTE_POPULATION).map(w => w.name);
  return { kind: "subsector", name: name || `${randomName(dice)} Subsector`, density, cols, rows, hexes, worlds, capital: capital?.name ?? null, courierWorlds, primaryCapital };
}
