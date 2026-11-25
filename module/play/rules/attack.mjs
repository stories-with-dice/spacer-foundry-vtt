/**
 * Pure attack rules: target difficulty, modifiers of one attack, absolute results, and damage to
 * vehicles (book p.33, p.40-44, p.49). No Foundry globals: tested with node:test.
 * The Foundry side (module/play/attack.mjs) looks up the documents and calls these functions.
 */
import { UNARMORED_DIFFICULTY } from "../../config.mjs";
import { rangeDM, meleeRangeDM, defenceDM, attackModifiers, pierceArmour } from "./combat.mjs";

/** Actor types that are characters or NPCs (six characteristics, skills). */
export const PERSON_TYPES = ["character", "npc"];
/** Actor types that are vehicles or starships (owned by the craft area). */
export const CRAFT_TYPES = ["vehicle", "ship"];

/** True for a character or an NPC. */
export const isPerson = a => PERSON_TYPES.includes(a?.type);
/** True for a vehicle or a starship. */
export const isCraft = a => CRAFT_TYPES.includes(a?.type);

/**
 * Difficulty to hit a target before Piercing (p.43, p.110, p.49). Called by prepareAttack.
 * - No target, or a vehicle or ship: 8+.
 * - Creature: its size difficulty.
 * - Person: armour total, which includes Evade.
 * @param {{type: string, system: object}|null} target  an actor (or a plain object in tests)
 * @returns {number}
 */
export function targetDifficulty(target) {
  if (!target) return UNARMORED_DIFFICULTY;
  if (target.type === "creature") return target.system?.difficulty ?? UNARMORED_DIFFICULTY;
  // BOOK: p.49 gives vehicles no difficulty to hit; vehicle armour (an integer) only lowers damage at
  // a hit location. We use the normal 8+. Starships have no personal-scale rule; we use 8+ too.
  if (isCraft(target)) return UNARMORED_DIFFICULTY;
  return target.system?.armor?.total ?? UNARMORED_DIFFICULTY;
}

/**
 * Damage that a personal weapon hit deals to the target (p.49). Persons and creatures take the
 * rolled damage. A vehicle takes 1 damage per hit. A starship takes none.
 * BOOK: p.49 "Any rolled weapon dice only deal minimal 1 damage against a vehicle". We read it as
 * 1 damage per hit. The book has no rule for personal weapons against starships. Ships have only
 * 2-11 hull points, so 1 per hit would let a pistol cripple a ship; we use 0 (the referee can still
 * apply damage by hand).
 * Called by the attack workflow to set the damage on the chat card.
 * @param {number} amount  rolled damage
 * @param {{type: string}|null} target
 * @returns {number}
 */
export function damageToTarget(amount, target) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (target?.type === "ship") return 0;
  if (isCraft(target)) return n > 0 ? 1 : 0;
  return n;
}

/**
 * Range DM of an attack (p.43). Melee weapons use meleeRangeDM; a thrown melee weapon (Throw trait)
 * uses the Short row; ranged and thrown weapons use their own row.
 * @returns {number|null} null when the weapon cannot reach the band.
 */
export function attackRangeDM({ melee = false, thrown = false, range = "short", band = "short" } = {}) {
  if (melee && !thrown) return meleeRangeDM(range, band);
  return rangeDM(melee ? "short" : range, band);
}

/**
 * Default dialog values of an attack. Called by attack() in module/play/attack.mjs.
 * Persons attack with DEX, thrown weapons too: the thrown STR DM is a separate modifier (p.33).
 * @param {object} ctx  the context from prepareAttack
 * @returns {object}
 */
export function defaultAttackOptions(ctx) {
  return {
    characteristic: ctx.creature ? "" : "dex",
    band: ctx.band, aimed: true, position: ctx.position ?? "standing", cover: ctx.cover ?? "none",
    useOverwatch: (ctx.overwatch ?? 0) > 0, oneHanded: false, cramped: false, darkness: 0, higherGround: false,
    autoMode: "single", controlled: false, throw: false, fatigue: !!ctx.fatigued, speedBand: 0, dm: 0,
    flat: false, overload: 0
  };
}

/**
 * Every DM, the difficulty, and the range DM of one attack (p.33, p.42-44).
 * Thrown attacks (the "Thrown" trait or category, or a melee weapon with "Throw" thrown at the
 * target) add the STR DM once to the attack (p.33). Called by attack() and by the attack dialog
 * preview; tests call it with a plain context.
 * @param {object} ctx  from prepareAttack: dm (the attacker's characteristic DMs), creature, skill,
 *                      melee, ranged, thrownWeapon, canThrow, range, traits, overwatch, defending,
 *                      lowTech, heightened, baseDifficulty
 * @param {object} v    dialog values (see defaultAttackOptions)
 * @returns {{mods: {key: string, value: number}[], total: number, difficulty: number, rangeDM: number|null,
 *            thrown: boolean, coverStep: string, charDM: number, strDM: number, autoN: number}}
 */
export function computeAttack(ctx, v) {
  const dm = ctx.dm ?? ctx.actor?.system?.dm ?? {};
  const traits = ctx.traits ?? {};
  const thrown = !!(ctx.thrownWeapon || (ctx.canThrow && v.throw));
  const rdm = attackRangeDM({ melee: ctx.melee, thrown, range: ctx.range, band: v.band });
  const def = defenceDM({ position: v.position, cover: v.cover, arching: !!traits.arching });
  const charDM = v.characteristic ? (dm[v.characteristic] ?? 0) : 0;
  const strDM = dm.str ?? 0;
  const autoN = traits.auto || 0;
  const hand = ctx.melee && !thrown;
  const { mods, total } = attackModifiers({
    charDM, skill: ctx.creature ? 0 : ctx.skill, ranged: ctx.ranged || thrown, thrown, strDM,
    aimed: v.aimed, range: rdm ?? 0, position: def.position, cover: def.cover,
    overwatch: v.useOverwatch ? ctx.overwatch : 0,
    oneHanded: !!traits.twoHanded && v.oneHanded, cramped: !!traits.large && v.cramped,
    darkness: Number(v.darkness) || 0, higherGround: v.higherGround,
    multiTarget: autoN && v.autoMode === "multi" ? autoN : 0,
    defending: hand ? ctx.defending : 0,
    lowTech: ctx.lowTech, fatigued: v.fatigue, controlled: hand && v.controlled,
    speedBand: Number(v.speedBand) || 0,
    extra: (Number(v.dm) || 0) + (ctx.heightened ? 1 : 0)
  });
  const difficulty = pierceArmour(ctx.baseDifficulty, traits.piercing || 0);
  return { mods, total, difficulty, rangeDM: rdm, thrown, coverStep: def.coverStep, charDM, strDM, autoN };
}

/**
 * What snake eyes does to the weapon with absolute results on (p.14, p.42).
 * - Melee weapon, also when thrown with the Throw trait: the blade bends or breaks ("broken").
 * - Gun: it jams ("jammed"), unless it is Reliable.
 * - Thrown item (Thrown trait or category, not a melee weapon): nothing.
 * Called by attack() in module/play/attack.mjs.
 * @returns {"broken"|"jammed"|null}
 */
export function absoluteFailure({ melee = false, thrownWeapon = false, reliable = false } = {}) {
  if (melee) return "broken";
  if (thrownWeapon || reliable) return null;
  return "jammed";
}
