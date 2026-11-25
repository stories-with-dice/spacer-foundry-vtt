/**
 * Courier routes of a subsector scene (p.88, p.92). Pure. Called by module/tools/scene/scene.mjs.
 */
import { ROUTE_POPULATION, hexDistance } from "../../rules/subsector.mjs";

/**
 * Reach of a route in parsecs: a world within this distance of a route world is "near a main
 * travel route" (p.92). rules/subsector.mjs `subsectorPopDMs` uses the same distance.
 */
export const ROUTE_REACH = 1;

/** Longest route segment we draw, in parsecs: twice the reach (see `selectRoutes`). */
export const ROUTE_MAX = 2 * ROUTE_REACH;

/**
 * The route segments between the worlds of population 6+ (p.88). `worlds` are `{ name, col, row,
 * population }`. Returns `[{ from, to, distance }]` (world names): a minimum spanning forest of
 * the route worlds over links of at most `max` parsecs, shortest links first, ties by hex.
 */
// BOOK: p.88 says every subsector has main courier routes between worlds of population 6+ and the
// referee maps them, but gives no length or shape; p.92 gives +1 population "within one parsec of
// a main travel route". The generator counts a world as near a route when it is within 1 parsec
// of a route world. We link route worlds at most 2 parsecs apart: every hex on such a link is
// then within 1 parsec of a route world, so the drawn routes match the DMs the generator used.
// To keep the map readable we draw one network per group of linked worlds (a spanning tree), not
// every possible link. p.88 also says routes "do not need to be mapped out between adjacent
// parsec hexes"; we still draw those short links, so the network reads as one.
export function selectRoutes(worlds, { population = ROUTE_POPULATION, max = ROUTE_MAX } = {}) {
  const hubs = worlds.filter(w => (w.population ?? 0) >= population).sort((a, b) => hexKey(a) - hexKey(b));
  const links = [];
  for (let i = 0; i < hubs.length; i++) {
    for (let k = i + 1; k < hubs.length; k++) {
      const d = hexDistance(hubs[i], hubs[k]);
      if (d >= 1 && d <= max) links.push({ i, k, d });
    }
  }
  links.sort((a, b) => a.d - b.d || a.i - b.i || a.k - b.k);
  const parent = hubs.map((_, n) => n);
  const root = n => (parent[n] === n ? n : (parent[n] = root(parent[n])));
  const out = [];
  for (const { i, k, d } of links) {
    const a = root(i), b = root(k);
    if (a === b) continue;
    parent[a] = b;
    out.push({ from: hubs[i].name, to: hubs[k].name, distance: d });
  }
  return out;
}

const hexKey = w => w.col * 100 + w.row;

/**
 * A segment from `a` to `b` (pixel points) shortened by `trim` pixels at both ends, so the line
 * stops at the world rings. Returns `[x1, y1, x2, y2]`, or null when the points are too close.
 */
export function trimSegment(a, b, trim) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= 2 * trim) return null;
  const ux = dx / len, uy = dy / len;
  return [a.x + ux * trim, a.y + uy * trim, b.x - ux * trim, b.y - uy * trim].map(Math.round);
}
