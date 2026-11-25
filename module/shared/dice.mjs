/**
 * Dice helpers shared by every area. Pure: no Foundry globals, so `node --test` can load it.
 *
 * A "die" is a function `die(sides)` that returns an integer from 1 to `sides`.
 * Rules code takes a die (or a `dice` object from `makeDice(die)`) as a parameter:
 * production passes `randomDie()`, tests pass `scriptedDie([...])` or `seededDie(seed)`.
 */

/**
 * The random source in [0, 1): Foundry's `CONFIG.Dice.randomUniform` when it exists (so a module
 * that replaces Foundry's RNG also drives our dice), else `Math.random`.
 */
export function uniform() {
  const f = globalThis.CONFIG?.Dice?.randomUniform;
  return typeof f === "function" ? f() : Math.random();
}

/**
 * A die function backed by a random source in [0, 1). It maps u to a face the same way Foundry's
 * DiceTerm#mapRandomFace does, ceil((1 - u) * sides), so a fixed CONFIG.Dice.randomUniform gives the
 * same faces for our dice and for Foundry Roll dice (u = 0 -> highest face, u near 1 -> 1).
 */
export function randomDie(rng = uniform) {
  return sides => Math.max(1, Math.min(sides, Math.ceil((1 - rng()) * sides)));
}

/** One random 1D (1-6) from the default source. */
export const d6 = () => randomDie()(6);

/** A seeded die (mulberry32), for reproducible runs. */
export function seededDie(seed = 1) {
  let a = seed >>> 0;
  return sides => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return 1 + Math.floor(r * sides);
  };
}

/** A die function that returns the given faces in order (for tests). Throws when it runs out. */
export function scriptedDie(faces) {
  const queue = [...faces];
  const die = sides => {
    if (!queue.length) throw new Error("scriptedDie: no faces left");
    const v = queue.shift();
    if (v < 1 || v > sides) throw new Error(`scriptedDie: face ${v} is not valid for a d${sides}`);
    return v;
  };
  die.remaining = () => queue.length;
  return die;
}

/** Clamp a number into [min, max]. */
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Parse book dice notation into terms. Supports "2D", "D3", "1D3", "2D6", "D66", "D36", "D16",
 * "3D+3", "2D-7", "1D3+3", and plain integers, joined with + or -.
 */
export function parseBookDice(expr) {
  const s = String(expr).replace(/\s+/g, "").replace(/[–—]/g, "-").toUpperCase();
  if (!s) throw new Error("empty dice expression");
  const terms = [];
  const re = /([+-]?)(\d*)D(66|36|16|\d+)?|([+-]?)(\d+)/gy;
  let m;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m || m.index !== pos) throw new Error(`bad dice expression "${expr}"`);
    if (m[0].includes("D")) {
      const sign = m[1] === "-" ? -1 : 1;
      const faces = m[3];
      if (faces === "66" || faces === "36" || faces === "16") {
        terms.push({ sign, kind: `d${faces}`, count: Number(m[2] || 1) });
      } else {
        terms.push({ sign, kind: "dice", count: Number(m[2] || 1), sides: Number(faces || 6) });
      }
    } else {
      terms.push({ sign: m[4] === "-" ? -1 : 1, kind: "const", value: Number(m[5]) });
    }
    pos = re.lastIndex;
  }
  return terms;
}

/** Build the dice object used by every rules module. */
export function makeDice(die = randomDie()) {
  const dice = {
    die,
    /** Sum of `n` dice with `sides` faces. */
    nd(n, sides = 6) { let t = 0; for (let i = 0; i < n; i++) t += die(sides); return t; },
    d6() { return die(6); },
    d3() { return die(3); },
    twoD() { return die(6) + die(6); },
    /** D66: tens die then ones die, as a number 11-66. `tensDM` shifts the tens die (book p.56, p.60). */
    d66(tensDM = 0, { minTens = 1, maxTens = 6 } = {}) {
      const tens = clamp(die(6) + tensDM, minTens, maxTens);
      return tens * 10 + die(6);
    },
    /** D36: tens 1-3 (a D3), ones 1-6. */
    d36(tensDM = 0, { minTens = 1, maxTens = 3 } = {}) {
      const tens = clamp(die(3) + tensDM, minTens, maxTens);
      return tens * 10 + die(6);
    },
    /** D16: tens is always 1, ones 1-6. */
    d16() { return 10 + die(6); },
    /** A D66 roll with the tens digit uniform in [lo, hi] (for "11-26" style ranges). */
    d66Range(loTens, hiTens) {
      const tens = loTens + die(hiTens - loTens + 1) - 1;
      return tens * 10 + die(6);
    },
    /** Roll a book dice expression ("2D-7", "D3+3", "D66") and return the total. */
    roll(expr) {
      let total = 0;
      for (const t of parseBookDice(expr)) {
        let v;
        if (t.kind === "const") v = t.value;
        else if (t.kind === "dice") v = dice.nd(t.count, t.sides);
        else if (t.kind === "d66") { v = 0; for (let i = 0; i < t.count; i++) v += dice.d66(); }
        else if (t.kind === "d36") { v = 0; for (let i = 0; i < t.count; i++) v += dice.d36(); }
        else { v = 0; for (let i = 0; i < t.count; i++) v += dice.d16(); }
        total += t.sign * v;
      }
      return total;
    },
    /** Pick a random element of an array. */
    pick(arr) { return arr[die(arr.length) - 1]; }
  };
  return dice;
}

/** Find the row of a banded 2D table: rows are `[min, max, value]` (inclusive, open ends allowed). */
export function band(rows, total) {
  for (const r of rows) {
    const [min, max] = r;
    if ((min === null || total >= min) && (max === null || total <= max)) return r[2];
  }
  return rows[total < (rows[0][0] ?? 0) ? 0 : rows.length - 1][2];
}

/** Signed DM as text: +2, -1, +0. */
export const signed = n => (n >= 0 ? `+${n}` : `${n}`);
