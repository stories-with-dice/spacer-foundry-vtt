/**
 * The starfield of a subsector background: star points and faint nebula clouds, from a seeded
 * die so the same subsector name always gives the same picture. Pure (no canvas). The painter in
 * module/tools/scene/background.mjs draws what this returns.
 */
import { seededDie } from "../../../shared/dice.mjs";

/** Star colours, from red dwarfs to blue-white. */
const STAR_COLORS = ["#ffd2a1", "#fff4e8", "#ffffff", "#e8f0ff", "#cad8ff", "#ffe9c4"];
/** Nebula colours (drawn with a low alpha). */
const NEBULA_COLORS = ["#4b2a7a", "#1f4f7a", "#6a2448", "#1d5e5a"];

/**
 * Stars and nebulae for a `width` x `height` picture. `seed` is an integer (see layout `seedOf`).
 * Returns `{ stars: [{ x, y, r, alpha, color }], nebulae: [{ x, y, r, color, alpha }] }`.
 * About one star per 2500 square pixels; a few bright stars with r > 1.5.
 */
export function starfield(seed, width, height, { density = 1 / 2500, nebulae = 4 } = {}) {
  const die = seededDie(seed);
  const u = () => (die(100000) - 1) / 100000;
  const pick = arr => arr[die(arr.length) - 1];
  const stars = [];
  const count = Math.round(width * height * density);
  for (let n = 0; n < count; n++) {
    const bright = u() < 0.03;
    stars.push({
      x: Math.round(u() * width * 10) / 10,
      y: Math.round(u() * height * 10) / 10,
      r: bright ? 1.6 + u() * 1.4 : 0.4 + u() * 0.9,
      alpha: bright ? 0.8 + u() * 0.2 : 0.25 + u() * 0.55,
      color: pick(STAR_COLORS)
    });
  }
  const clouds = [];
  for (let n = 0; n < nebulae; n++) {
    clouds.push({
      x: Math.round(u() * width), y: Math.round(u() * height),
      r: Math.round(Math.min(width, height) * (0.25 + u() * 0.35)),
      color: pick(NEBULA_COLORS), alpha: 0.10 + u() * 0.12
    });
  }
  return { stars, nebulae: clouds };
}
