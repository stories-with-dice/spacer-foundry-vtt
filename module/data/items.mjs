const fields = foundry.data.fields;

const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const num = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, initial, ...opts });
const str = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const bool = (initial = false) => new fields.BooleanField({ initial });
const html = () => new fields.HTMLField({ required: true, blank: true, initial: "" });
const strings = () => new fields.ArrayField(new fields.StringField());

/** Fields every physical item has. Costs are in credits, weights in kilograms. */
function physical() {
  return {
    cost: num(0),
    weight: num(0),
    tl: int(0, { min: 0 }),
    quantity: int(1, { min: 0 }),
    carried: bool(true),
    description: html(),
    source: str()                       // book page, e.g. "p.30"
  };
}

/**
 * Skill (book p.28-29). A specialised skill is two items: the base skill ("Melee", rank 0)
 * and one item per specialty ("Melee", specialty "Blade", rank 1). Display: "Melee 0 (Blade 1)".
 */
export class SkillData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      skill: str(),                     // base skill name, e.g. "Melee"
      specialty: str(),                 // "" for the base skill
      specialties: strings(),           // the specialties the book lists for this skill
      rank: int(0, { min: 0, max: 5 }),
      characteristic: str(""),          // suggested characteristic key, "" = referee decides
      description: html(),
      source: str()
    };
  }

  get fullName() {
    return this.specialty ? `${this.skill} (${this.specialty})` : this.skill;
  }
}

/** Personal weapon (book p.30-33). */
export class WeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      category: str("melee"),           // melee | short | stock | energy | archaic | heavy | thrown
      skill: str("Melee Combat"),       // base skill name
      specialty: str(""),               // e.g. "Blade", "Short"
      damage: str("1D"),                // book dice
      attachedDamage: str(""),          // damage when attached (bayonet)
      range: str("short"),              // close | short | medium | long | veryLong | distant
      rounds: int(0, { min: 0 }),       // magazine size, 0 = not applicable
      ammo: int(0, { min: 0 }),
      traits: strings(),                // book trait names: "Bladed", "Auto", ...
      equipped: bool(false),
      jammed: bool(false),
      broken: bool(false)
    };
  }
}

/** Armour (book p.34). */
export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const p = physical();
    return {
      ...p,
      difficulty: int(8),               // difficulty to hit
      wornWeight: num(0),
      traits: strings(),                // "Absorbing", "Reflective", "Vaccsuit"
      equipped: bool(false),
      damaged: bool(false)              // Ablat destroyed or Reflec downgraded
    };
  }

  prepareDerivedData() {
    // Damaged Ablat gives no protection; damaged Reflec works as Jack (book p.34).
    if (!this.damaged) this.effectiveDifficulty = this.difficulty;
    else if (this.traits.includes("Absorbing")) this.effectiveDifficulty = 8;
    else if (this.traits.includes("Reflective")) this.effectiveDifficulty = 9;
    else this.effectiveDifficulty = this.difficulty;
  }
}

/** Any other equipment: survival gear, devices, tools, comms, shelters, weapon mods, trade goods. */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      category: str("general"),         // survival | device | tool | comms | shelter | weaponMod | cargo | general
      traits: strings(),
      equipped: bool(false),
      uses: new fields.SchemaField({ value: int(0, { min: 0 }), max: int(0, { min: 0 }) })
    };
  }
}

/** Psionic talent at one level of a discipline (book p.114-119). */
export class PsionicData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      discipline: str("telepathy"),
      level: int(1, { min: 0 }),
      psiCost: str("1"),                // PSI points, may be a formula or text
      duration: str(""),
      difficulty: str("8+"),            // roll needed
      range: str(""),
      known: bool(true),
      description: html(),
      source: str()
    };
  }
}

/** Drug (book p.120-121). */
export class DrugData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      effect: str(""),
      duration: str(""),
      availability: str(""),            // roll needed to find
      legality: str(""),
      doses: int(1, { min: 0 })
    };
  }
}

/** Starship or vehicle mounted weapon (book p.49 and p.76). */
export class ShipWeaponData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      mount: str("turret"),             // turret | missileRack | bay | vehicle | ...
      forVehicle: bool(false),
      damage: str("1"),                 // book dice or a flat number
      range: str("long"),
      tonnage: num(0),
      hardpoints: int(1, { min: 0 }),
      ammo: new fields.SchemaField({ value: int(0, { min: 0 }), max: int(0, { min: 0 }) }),
      traits: strings(),
      destroyed: bool(false),
      gunner: str("")                   // actor UUID
    };
  }
}
