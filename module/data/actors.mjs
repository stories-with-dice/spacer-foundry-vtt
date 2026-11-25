import { CHARACTERISTICS, PHYSICAL, UNARMORED_DIFFICULTY, characteristicDM, toHex } from "../config.mjs";
import { deriveShip, deriveVehicle } from "../craft/derived.mjs";

const fields = foundry.data.fields;

const int = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, ...opts });
const num = (initial = 0, opts = {}) => new fields.NumberField({ required: true, nullable: false, initial, ...opts });
const str = (initial = "") => new fields.StringField({ required: true, blank: true, initial });
const html = () => new fields.HTMLField({ required: true, blank: true, initial: "" });

/** A characteristic: `max` is the rolled score, `value` is the current score after damage or aging. */
function characteristicField(initial = 7) {
  return new fields.SchemaField({
    value: int(initial),
    max: int(initial, { min: 0 })
  });
}

/** Shared by characters and NPCs: six characteristics, PSI, combat state, and derived values. */
class PersonData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const chars = {};
    for (const k of CHARACTERISTICS) chars[k] = characteristicField(7);
    return {
      characteristics: new fields.SchemaField(chars),
      psi: new fields.SchemaField({ value: int(0), max: int(0, { min: 0 }) }),
      age: int(18, { min: 0 }),
      credits: num(0),
      combat: new fields.SchemaField({
        position: str("standing"),      // standing | kneeling | prone | wall
        cover: str("none"),             // none | partial | half | most | absolute
        evading: new fields.BooleanField({ initial: false }),
        overwatch: int(0, { min: 0, max: 5 }),
        sprintUsed: int(0, { min: 0 }),
        meleeUsed: int(0, { min: 0 }),
        firstAid: new fields.BooleanField({ initial: false })
      }),
      radiation: int(0, { min: 0 }),
      fatigue: int(0, { min: 0 }),
      biography: html(),
      notes: html()
    };
  }

  prepareDerivedData() {
    const c = this.characteristics;
    this.dm = {};
    for (const k of CHARACTERISTICS) {
      c[k].dm = characteristicDM(c[k].value);
      this.dm[k] = c[k].dm;
    }
    this.dm.psi = characteristicDM(this.psi.value);
    this.upp = CHARACTERISTICS.map(k => toHex(c[k].max)).join("");
    this.uppCurrent = CHARACTERISTICS.map(k => toHex(c[k].value)).join("");

    // Injury state (book p.43): END 0 wounded, two physical at 0 unconscious, all three dead.
    const zeros = PHYSICAL.filter(k => c[k].value <= 0).length;
    this.injury = {
      wounded: c.end.value <= 0,
      unconscious: zeros >= 2,
      dead: zeros >= 3,
      label: zeros >= 3 ? "dead" : zeros >= 2 ? "unconscious" : c.end.value <= 0 ? "wounded" : "healthy"
    };

    // Items: armour, encumbrance (book p.41).
    const items = this.parent?.items ?? [];
    let carried = 0;
    let armor = null;
    for (const item of items) {
      const s = item.system;
      if (item.type === "armor") {
        if (s.equipped) {
          carried += (s.wornWeight || 0);
          if (!armor || (s.effectiveDifficulty ?? s.difficulty) > (armor.system.effectiveDifficulty ?? armor.system.difficulty)) armor = item;
        } else if (s.carried) carried += (s.weight || 0);
      } else if ("weight" in s && s.carried !== false) {
        carried += (s.weight || 0) * (s.quantity ?? 1);
      }
    }
    const strScore = Math.max(0, c.str.value);
    const level = carried <= strScore * 2 ? "minimal" : carried <= strScore * 3 ? "encumbered" : carried <= strScore * 4 ? "overEncumbered" : "overloaded";
    this.encumbrance = { carried: Math.round(carried * 100) / 100, minimal: strScore * 2, encumbered: strScore * 3, overEncumbered: strScore * 4, level };

    // Armour difficulty to hit; evading adds DEX DM (book p.43).
    this.armor = {
      itemId: armor?.id ?? null,
      name: armor?.name ?? "",
      difficulty: armor ? (armor.system.effectiveDifficulty ?? armor.system.difficulty) : UNARMORED_DIFFICULTY
    };
    this.armor.total = this.armor.difficulty + (this.combat.evading ? Math.max(0, this.dm.dex) : 0);

    // Movement in metres per round = DEX; encumbrance cuts it (book p.41).
    const moveMult = { minimal: 1, encumbered: 0.5, overEncumbered: 0.25, overloaded: 0 }[level];
    this.movement = Math.floor(Math.max(0, c.dex.value) * moveMult);
    const endBudget = Math.max(0, c.end.value) * (level === "encumbered" ? 0.5 : 1);
    const battleDress = armor?.system.traits?.includes?.("Vaccsuit") && armor.system.difficulty >= 14;
    this.sprintRemaining = level === "overEncumbered" || level === "overloaded" ? 0 : Math.max(0, Math.floor(endBudget) - this.combat.sprintUsed);
    this.meleeRemaining = battleDress ? Infinity
      : level === "overEncumbered" || level === "overloaded" ? 0 : Math.max(0, Math.floor(endBudget) - this.combat.meleeUsed);
  }
}

export class CharacterData extends PersonData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      homeworld: str(),
      terms: int(0, { min: 0 }),
      careers: new fields.ArrayField(new fields.SchemaField({
        career: str(),                  // navy | marines | army | scouts | merchants | civilian | prison | ...
        terms: int(0, { min: 0 }),
        rank: int(0, { min: 0 }),
        rankTitle: str(),
        commissioned: new fields.BooleanField({ initial: false }),
        drafted: new fields.BooleanField({ initial: false })
      })),
      pension: num(0),
      debt: num(0),
      history: html(),                  // lifepath log written by the character creation wizard
      chargenComplete: new fields.BooleanField({ initial: false })
    };
  }
}

export class NpcData extends PersonData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      role: str(),
      demeanour: str(),
      quantity: int(1, { min: 1 })
    };
  }
}

/** Alien animal (book p.110). Uses hits, not characteristics. */
export class CreatureData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      size: str("medium"),              // tiny | small | medium | large | veryLarge
      difficulty: int(8),               // difficulty to hit
      hits: new fields.SchemaField({ value: int(18), max: int(18, { min: 0 }) }),
      damage: str("2D+3"),              // book dice
      flatDamage: int(10),
      behaviour: str(),                 // carnivore | herbivore | omnivore | scavenger
      behaviourDetail: str(),           // the behaviour characteristic, e.g. "Pouncer"
      traits: new fields.ArrayField(new fields.StringField()),
      numberAppearing: str("1D"),
      terrain: str(),
      quantity: int(1, { min: 1 }),
      description: html()
    };
  }

  prepareDerivedData() {
    // Pinned at 1/2 hits taken, unconscious at 3/4, dead at all (book p.110).
    const taken = this.hits.max - this.hits.value;
    this.injury = {
      label: this.hits.value <= 0 ? "dead" : taken >= this.hits.max * 0.75 ? "unconscious" : taken >= this.hits.max * 0.5 ? "pinned" : "healthy"
    };
  }
}

const location = (initial = 0) => new fields.SchemaField({ value: int(initial, { min: 0 }), max: int(initial, { min: 0 }), armored: new fields.BooleanField({ initial: false }) });

/** Vehicle (book p.46-49). */
export class VehicleData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: str("landcraft"),       // landcraft | aircraft | gravcraft | watercraft
      traits: new fields.ArrayField(new fields.StringField()),  // Civilian, Military, Wheeled, ...
      military: new fields.BooleanField({ initial: false }),
      skill: str("Drive"),              // operating skill, e.g. "Drive (Wheeled)"
      speedBand: int(4, { min: 0 }),
      currentSpeed: int(0, { min: 0 }),
      occupants: int(1, { min: 0 }),
      cargoKg: num(0),
      rangeKm: num(0),
      weightTons: num(1),
      tl: int(5),
      cost: num(0),
      armor: int(0, { min: 0 }),
      locations: new fields.SchemaField({
        interior: location(1), drive: location(1), handling: location(1), hull: location(1), weapon: location(0)
      }),
      destroyed: new fields.BooleanField({ initial: false }),
      crew: new fields.ArrayField(new fields.StringField()),   // actor UUIDs
      description: html()
    };
  }

  prepareDerivedData() {
    // Speed, range, and location status (book p.46-49). Owned by the craft area.
    deriveVehicle(this);
  }
}

const shipSystem = (rating = "A", value = 1) => new fields.SchemaField({
  rating: str(rating),                  // drive letter as built
  value: int(value, { min: 0 }),        // jump number, G rating, or power output as built
  damage: int(0, { min: 0 }),           // steps lost to damage
  destroyed: new fields.BooleanField({ initial: false })
});

/** Starship (book p.68-87). */
export class ShipData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      shipClass: str(),                 // "100T Scout"
      tonnage: int(100, { min: 0 }),
      streamlined: new fields.BooleanField({ initial: true }),
      hull: new fields.SchemaField({ value: int(2, { min: 0 }), max: int(2, { min: 0 }) }),
      jDrive: shipSystem("A", 2),
      mDrive: shipSystem("A", 2),
      power: shipSystem("A", 1),
      cpu: str("Model/1"),
      fuel: new fields.SchemaField({ value: num(0), max: num(0) }),
      cargo: new fields.SchemaField({ value: num(0), max: num(0) }),
      staterooms: int(0, { min: 0 }),
      lowBerths: int(0, { min: 0 }),
      hardpoints: int(0, { min: 0 }),
      crewRequired: int(1, { min: 0 }),
      crewRoles: str(),
      misc: str(),
      cost: num(0),                     // credits
      internalHits: int(0, { min: 0 }),
      cockpitHits: int(0, { min: 0 }),
      smallCraft: new fields.BooleanField({ initial: false }),
      destroyed: new fields.BooleanField({ initial: false }),
      finances: new fields.SchemaField({
        mortgage: num(0), maintenance: num(0), crewSalaries: num(0), lifeSupport: num(0), fuelCost: num(0), bank: num(0)
      }),
      position: new fields.SchemaField({ system: str(), world: str(), range: str("") }),
      crew: new fields.ArrayField(new fields.SchemaField({ role: str(), actor: str() })),   // actor UUIDs by crew role
      description: html(),
      notes: html()
    };
  }

  prepareDerivedData() {
    // Effective drive letters and performance after damage, power-plant limits, critical flags,
    // fuel and cargo (book p.74-87). Owned by the craft area.
    deriveShip(this);
  }
}
