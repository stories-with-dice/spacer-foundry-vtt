/**
 * Pure injury rules: damage to persons (book p.43), creature hits (p.110), and armour that
 * negates a hit (p.34). No Foundry globals: tested with node:test.
 */
import { d6 } from "../../shared/dice.mjs";

/**
 * Apply damage to a person's physical characteristics (p.43).
 * - END is hit first. When END reaches 0, the rest of this hit is split equally between DEX and STR
 *   (an odd point goes to a random one of the two).
 * - Later hits, while END is already 0, go to STR (1D odd) or DEX (1D even).
 * - Damage that would take STR or DEX below 0 spills into the other one.
 * @param {{str: number, dex: number, end: number}} chars  current values
 * @param {number} amount
 * @param {() => number} [roll1d]  returns 1-6
 * @returns {{after: {str: number, dex: number, end: number}, loss: {str: number, dex: number, end: number}, randomTo: string|null, wasted: number}}
 */
export function distributeDamage(chars, amount, roll1d = d6) {
  const after = { str: Math.max(0, chars.str), dex: Math.max(0, chars.dex), end: Math.max(0, chars.end) };
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  let randomTo = null;

  const hit = (key, n) => {
    const take = Math.min(after[key], n);
    after[key] -= take;
    return n - take;
  };
  /** Put n points on `first`, spilling the rest on the other of STR/DEX. Returns what is left. */
  const spill = (first, n) => hit(first === "str" ? "dex" : "str", hit(first, n));

  if (left > 0 && after.end > 0) {
    left = hit("end", left);
    if (left > 0) {
      const half = Math.floor(left / 2);
      let toStr = half, toDex = half;
      if (left % 2) { if (roll1d() % 2) toStr += 1; else toDex += 1; }
      left = spill("str", toStr) + spill("dex", toDex);
    }
  } else if (left > 0) {
    randomTo = roll1d() % 2 ? "str" : "dex";
    left = spill(randomTo, left);
  }

  const loss = { str: Math.max(0, chars.str) - after.str, dex: Math.max(0, chars.dex) - after.dex, end: Math.max(0, chars.end) - after.end };
  return { after, loss, randomTo, wasted: left };
}

/** Injury state from physical characteristics (p.43). */
export function injuryState({ str, dex, end }) {
  const zeros = [str, dex, end].filter(v => v <= 0).length;
  if (zeros >= 3) return "dead";
  if (zeros >= 2) return "unconscious";
  if (end <= 0) return "wounded";
  return "healthy";
}

/** Creature injury state from hits (p.110): pinned at 1/2 taken, unconscious at 3/4, dead at all. */
export function creatureState(value, max) {
  if (value <= 0) return "dead";
  const taken = max - value;
  if (taken >= max * 0.75) return "unconscious";
  if (taken >= max * 0.5) return "pinned";
  return "healthy";
}

/** Damage dice an Ablat or Reflec armour can stop: 2D to 6D (p.34). */
export const NEGATED_DICE = { min: 2, max: 6 };

/**
 * How the target's armour reacts to a hit (p.34). Called by applyDamage in module/play/damage.mjs.
 * - Absorbing (Ablat): negates the first hit of 2D-6D damage, then is destroyed.
 * - Reflective (Reflec): deflects an energy weapon hit of 2D-6D damage, then is downgraded to Jack.
 * @param {{traits?: string[], damaged?: boolean}|null} armour  equipped armour
 * @param {{energy?: boolean, dice?: number}} hit  energy weapon, and number of damage dice
 * @returns {{negated: boolean, damageArmour: boolean, trait: string|null}}
 */
export function armourReaction(armour, { energy = false, dice = 0 } = {}) {
  const none = { negated: false, damageArmour: false, trait: null };
  if (!armour || armour.damaged) return none;
  const traits = (armour.traits ?? []).map(t => String(t).toLowerCase());
  const inRange = dice >= NEGATED_DICE.min && dice <= NEGATED_DICE.max;
  if (traits.includes("absorbing") && inRange) return { negated: true, damageArmour: true, trait: "Absorbing" };
  // BOOK: p.34 "deflecting 2D-6D damage"; the armour table (p.43) says only "deflects lasers".
  // We use the 2D-6D limit for every energy weapon, the same check as Ablat.
  if (traits.includes("reflective") && energy && inRange) return { negated: true, damageArmour: true, trait: "Reflective" };
  return none;
}
