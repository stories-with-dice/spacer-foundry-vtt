/**
 * Alien animals (p.110-113): the generator and creature actors. Foundry glue around
 * rules/animals.mjs.
 */
import * as animalRules from "./rules/animals.mjs";
import { animalCard, creatureDescription } from "./cards/animals.mjs";
import { ANIMAL_FOLDER, dice, ensureFolder, postToolsCard } from "./context.mjs";

/**
 * Create a creature actor in "Spacer: Animals" from a `generateAnimal` result: size, hits,
 * damage, behaviour, traits, and number appearing. The result goes to flags.spacer.animal.
 */
export async function createCreatureActor(a, { name = null, folder = ANIMAL_FOLDER } = {}) {
  const f = await ensureFolder(folder, "Actor");
  return Actor.create({
    name: name ?? a.name,
    type: "creature",
    img: "icons/svg/pawprint.svg",
    folder: f.id,
    system: {
      size: a.size, difficulty: a.swarm ? 8 : a.difficulty, hits: { value: a.hits, max: a.hits },
      damage: a.damage, flatDamage: a.flat, behaviour: a.behaviour, behaviourDetail: a.characteristic,
      traits: a.traits, numberAppearing: a.appearing, terrain: a.terrainLabel, quantity: a.count, description: creatureDescription(a)
    },
    flags: { spacer: { animal: a } }
  });
}

/** Generate an alien animal for a terrain key of ANIMAL_TERRAIN. Posts a card; `create` makes the actor. */
export async function generateAnimal({ terrain = "open", create = false, chat = true } = {}) {
  const r = animalRules.generateAnimal(dice(), { terrain });
  if (chat) await postToolsCard(animalCard(r), { kind: "animal", data: r });
  if (create) r.actor = await createCreatureActor(r);
  return r;
}

/** Chat card buttons of the animal and planetside cards (registered by register.mjs). */
export const animalChatActions = {
  "tools-create-creature": async (event, button, message) => {
    const a = await createCreatureActor(message.flags.spacer.tools.data);
    a?.sheet?.render(true);
  },
  "tools-animal-here": (event, button, message) => generateAnimal({ terrain: message.flags.spacer?.tools?.data?.terrain ?? "open" })
};
