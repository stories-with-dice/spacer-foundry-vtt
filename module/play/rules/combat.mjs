/**
 * Pure personal combat rules (book p.33-34 and p.40-44). No Foundry globals: tested with node:test.
 */

/** Range bands, shortest first (p.43). "distant" is 501m-1km. */
export const RANGE_BANDS = ["close", "short", "medium", "long", "veryLong", "distant"];

/** Upper distance limit in metres of each band (p.40 and p.43). */
export const RANGE_LIMITS = { close: 1, short: 5, medium: 50, long: 250, veryLong: 500, distant: 1000 };

/**
 * Weapon range table (p.43): rows = the weapon's attack range, columns = the target distance band.
 * null = the weapon cannot reach ("x" in the book).
 */
const RANGE_TABLE = {
  close:    [1, 0, null, null, null, null],
  short:    [1, 0, -1, null, null, null],
  medium:   [-1, 1, 0, -1, -2, -4],
  long:     [-2, -1, 1, 0, -1, -2],
  veryLong: [-2, -1, 1, 1, 0, -1]
};

/** Short codes used by the book tables ("C", "S", "M", "L", "VL", "D"). */
const RANGE_ALIASES = {
  c: "close", close: "close",
  s: "short", short: "short",
  m: "medium", med: "medium", medium: "medium",
  l: "long", long: "long",
  vl: "veryLong", verylong: "veryLong", "very long": "veryLong",
  d: "distant", distant: "distant"
};

/** Normalise a range text ("VL", "Very Long", "veryLong") to a band key, or "" when unknown. */
export function normalizeRange(text) {
  const k = String(text ?? "").trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  return RANGE_ALIASES[k] ?? RANGE_ALIASES[k.replace(/\s/g, "")] ?? "";
}

/** Range band for a distance in metres; "beyond" past 1km. */
export function rangeBandForDistance(metres) {
  const m = Math.max(0, Number(metres) || 0);
  if (m < 1) return "close";
  for (const band of RANGE_BANDS.slice(1)) if (m <= RANGE_LIMITS[band]) return band;
  return "beyond";
}

/**
 * Attack DM for using a weapon of range `weaponRange` against a target in band `band` (p.43).
 * @returns {number|null} null when the weapon cannot reach.
 */
export function rangeDM(weaponRange, band) {
  let row = normalizeRange(weaponRange) || "short";
  if (row === "distant") row = "veryLong";
  const col = RANGE_BANDS.indexOf(band);
  if (col < 0) return null;
  return RANGE_TABLE[row][col];
}

/** Defender positioning DM to the attacker (p.42). */
export const POSITION_DM = { standing: 0, kneeling: -1, prone: -2, wall: -1 };
/** Cover steps (p.42), each step is -1DM to the attacker. */
export const COVER_STEPS = ["none", "partial", "half", "most", "absolute"];

/**
 * Target position and cover DMs (p.42). Position and cover stack. A defender who is not standing
 * behind cover improves the cover one step. An Arching weapon (p.33) lowers the cover one step.
 * @returns {{position: number, cover: number, coverStep: string, total: number}}
 */
export function defenceDM({ position = "standing", cover = "none", arching = false } = {}) {
  const pos = POSITION_DM[position] ?? 0;
  let step = Math.max(0, COVER_STEPS.indexOf(cover));
  if (step > 0 && position !== "standing") step = Math.min(COVER_STEPS.length - 1, step + 1);
  if (step > 0 && arching) step -= 1;
  return { position: pos, cover: -step, coverStep: COVER_STEPS[step], total: pos - step };
}

/**
 * Parse book weapon traits into flags and numbers.
 * ["Auto 2", "Piercing 1", "Two-Handed", "Slow-Reload"] -> { auto: 2, piercing: 1, twoHanded: true, slowReload: true }
 */
export function parseTraits(traits = []) {
  const out = {};
  for (const raw of traits ?? []) {
    const m = String(raw).trim().match(/^(.*?)\s*(\d+)?$/);
    if (!m || !m[1]) continue;
    const key = m[1].toLowerCase().replace(/[^a-z0-9]+(.)/g, (_x, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, "");
    out[key] = m[2] !== undefined ? Number(m[2]) : true;
  }
  return out;
}

/** Number of dice in a book damage text: "3D+3" -> 3, "D3+3" -> 1, "2D3" -> 2, "Special" -> 0. */
export function countDice(damage) {
  const m = String(damage ?? "").toUpperCase().match(/(\d*)D(?!6{2})/);
  if (!m) return 0;
  return m[1] ? Number(m[1]) : 1;
}

/** True when a damage text contains dice or a number (EM Disruptor and Taser have "Special"). */
export function hasDamage(damage) {
  return /\d|D/i.test(String(damage ?? "")) && !/special/i.test(String(damage ?? ""));
}

/**
 * Armour difficulty after Piercing (p.33): reduce by the number, never below 8.
 */
export function pierceArmour(difficulty, piercing = 0) {
  if (!piercing || difficulty <= 8) return difficulty;
  return Math.max(8, difficulty - piercing);
}

/**
 * Collect every DM of an attack roll (p.42-44). Inputs are already looked up by the caller.
 * Returns the list of non-zero modifiers (key + value) and their total. Keys are i18n suffixes.
 * @param {object} o
 * @param {number} [o.charDM]       characteristic DM (DEX by default)
 * @param {number} [o.skill]        skill rank, or -3 untrained
 * @param {boolean} [o.ranged]      ranged weapon (aim and hip rules apply)
 * @param {boolean} [o.thrown]      thrown weapon: STR DM to attack (p.33)
 * @param {number} [o.strDM]
 * @param {boolean} [o.aimed=true]  false = shooting from the hip, -2
 * @param {number} [o.range]        range DM from rangeDM()
 * @param {number} [o.position]     target position DM
 * @param {number} [o.cover]        target cover DM
 * @param {number} [o.overwatch]    +1 per full round in overwatch, max +5
 * @param {boolean} [o.oneHanded]   Two-Handed weapon used in one hand, -2
 * @param {boolean} [o.cramped]     Large weapon in a space smaller than short range, -2
 * @param {number} [o.darkness]     0, -2 (low light) or -4 (dark)
 * @param {boolean} [o.higherGround] +2
 * @param {number} [o.multiTarget]  Auto N fired at several targets: -N
 * @param {number} [o.defending]    target's melee skill rank as a negative DM (p.44)
 * @param {boolean} [o.lowTech]     Low-Tech weapon without Ranged Combat (Archaic), -1
 * @param {boolean} [o.fatigued]    -2 to everything (p.107)
 * @param {boolean} [o.controlled]  controlled melee attack, -2 (p.44)
 * @param {number} [o.speedBand]    moving vehicle target: -speed band
 * @param {number} [o.extra]        any other DM
 */
export function attackModifiers(o = {}) {
  const mods = [];
  const add = (key, value) => { if (value) mods.push({ key, value }); };
  add("characteristic", o.charDM ?? 0);
  add(o.skill === -3 ? "untrained" : "skill", o.skill ?? 0);
  if (o.thrown) add("thrown", o.strDM ?? 0);
  if (o.ranged && o.aimed === false) add("hip", -2);
  add("range", o.range ?? 0);
  add("position", o.position ?? 0);
  add("cover", o.cover ?? 0);
  add("overwatch", Math.min(5, Math.max(0, o.overwatch ?? 0)));
  if (o.oneHanded) add("oneHanded", -2);
  if (o.cramped) add("cramped", -2);
  add("darkness", o.darkness ?? 0);
  if (o.higherGround) add("higherGround", 2);
  add("multiTarget", -(o.multiTarget ?? 0));
  add("defending", -(Math.max(0, o.defending ?? 0)));
  if (o.lowTech) add("lowTech", -1);
  if (o.fatigued) add("fatigue", -2);
  if (o.controlled) add("controlled", -2);
  add("speedBand", -(o.speedBand ?? 0));
  add("extra", o.extra ?? 0);
  return { mods, total: mods.reduce((s, m) => s + m.value, 0) };
}

/**
 * Bonus terms added to the damage roll (p.43 and p.33): the attack effect, STR DM for melee and
 * thrown weapons, and +N for an Auto N weapon fired at a single target.
 * @returns {{terms: {key: string, value: number}[], total: number}}
 */
export function damageBonus({ effect = 0, melee = false, thrown = false, strDM = 0, autoSingle = 0, overload = 0 } = {}) {
  const terms = [];
  const add = (key, value) => { if (value) terms.push({ key, value }); };
  add("effect", Math.max(0, effect));
  if (melee || thrown) add("strength", strDM);
  add("auto", autoSingle);
  add("overload", overload);
  return { terms, total: terms.reduce((s, t) => s + t.value, 0) };
}

/** Default 1D roller for damage distribution. */
const d6 = () => 1 + Math.floor(Math.random() * 6);

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

/**
 * How the target's armour reacts to a hit (p.34).
 * - Absorbing (Ablat): negates the first hit of 2D-6D damage, then is destroyed.
 * - Reflective (Reflec): deflects an energy weapon hit, then is downgraded to Jack.
 * @param {{traits?: string[], damaged?: boolean}|null} armour  equipped armour
 * @param {{energy?: boolean, dice?: number}} hit
 * @returns {{negated: boolean, damageArmour: boolean, trait: string|null}}
 */
export function armourReaction(armour, { energy = false, dice = 0 } = {}) {
  const none = { negated: false, damageArmour: false, trait: null };
  if (!armour || armour.damaged) return none;
  const traits = (armour.traits ?? []).map(t => String(t).toLowerCase());
  if (traits.includes("absorbing") && dice >= 2 && dice <= 6) return { negated: true, damageArmour: true, trait: "Absorbing" };
  if (traits.includes("reflective") && energy) return { negated: true, damageArmour: true, trait: "Reflective" };
  return none;
}

/**
 * Combat morale (p.44): a side checks when 25% of its fighting strength is out, again at 50% (-2DM)
 * and at 75% (-4DM).
 * @param {number} out    members wounded, pinned, unconscious, or dead
 * @param {number} total  starting members
 * @returns {{threshold: number, dm: number}|null}  the highest threshold reached
 */
export function moraleThreshold(out, total) {
  if (!total) return null;
  const f = out / total;
  if (f >= 0.75) return { threshold: 75, dm: -4 };
  if (f >= 0.5) return { threshold: 50, dm: -2 };
  if (f >= 0.25) return { threshold: 25, dm: 0 };
  return null;
}
