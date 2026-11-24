import { SPACER, SYSTEM_ID } from "./config.mjs";
import { CharacterData, NpcData, CreatureData, VehicleData, ShipData } from "./data/actors.mjs";
import { SkillData, WeaponData, ArmorData, GearData, PsionicData, DrugData, ShipWeaponData } from "./data/items.mjs";
import { registerPlay } from "./play/register.mjs";
import { registerCraft } from "./craft/register.mjs";
import { registerChargen } from "./chargen/register.mjs";
import { registerTools } from "./tools/register.mjs";

Hooks.once("init", () => {
  CONFIG.SPACER = SPACER;
  game.spacer = { config: SPACER };

  Object.assign(CONFIG.Actor.dataModels, {
    character: CharacterData, npc: NpcData, creature: CreatureData, vehicle: VehicleData, ship: ShipData
  });
  Object.assign(CONFIG.Item.dataModels, {
    skill: SkillData, weapon: WeaponData, armor: ArmorData, gear: GearData,
    psionic: PsionicData, drug: DrugData, shipWeapon: ShipWeaponData
  });
  CONFIG.Actor.trackableAttributes = {
    character: { bar: ["characteristics.end", "characteristics.str", "characteristics.dex", "psi"], value: [] },
    npc: { bar: ["characteristics.end", "characteristics.str", "characteristics.dex"], value: [] },
    creature: { bar: ["hits"], value: [] },
    vehicle: { bar: ["locations.hull", "locations.interior"], value: ["currentSpeed"] },
    ship: { bar: ["hull", "fuel"], value: [] }
  };

  // Each area registers its own documents, sheets, settings, hooks, and templates.
  registerPlay();
  registerCraft();
  registerChargen();
  registerTools();
  console.log(`${SYSTEM_ID} | Initialized`);
});
