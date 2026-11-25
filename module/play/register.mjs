/** Entry point of the "play" area. Called from the init hook in module/spacer.mjs. */
import { SYSTEM_ID, templatePath, preloadTemplates, setting } from "../shared/foundry.mjs";
import { registerChatActions } from "../shared/chat-actions.mjs";
import * as api from "./api.mjs";
import { SpacerActor, SpacerItem } from "./documents.mjs";
import { SpacerCharacterSheet, SpacerNpcSheet, SpacerCreatureSheet } from "./sheets/actor-sheets.mjs";
import { SpacerItemSheet } from "./sheets/item-sheet.mjs";
import { PLAY_CHAT_ACTIONS } from "./chat.mjs";
import * as combatRules from "./rules/combat.mjs";
import * as attackRules from "./rules/attack.mjs";
import * as injuryRules from "./rules/injury.mjs";
import * as characterRules from "./rules/character.mjs";
import * as taskRules from "./rules/task.mjs";

/** Templates loaded at init so partials are ready. */
const TEMPLATES = [
  "actor/header", "actor/main", "actor/skills", "actor/gear", "actor/combat", "actor/psionics", "actor/career", "actor/bio",
  "actor/npc", "actor/creature", "actor/parts/characteristics", "actor/parts/weapons", "actor/parts/combat-state",
  "item/header", "item/body",
  "dialogs/task", "dialogs/attack", "dialogs/psionic",
  "chat/task", "chat/attack", "chat/damage", "chat/heal", "chat/note", "chat/psionic", "chat/drug"
];

/** Extra token status effects (core already has unconscious and dead). */
const STATUS_EFFECTS = [
  { id: "wounded", name: "SPACER.Injury.wounded", img: "icons/svg/blood.svg" },
  { id: "pinned", name: "SPACER.Injury.pinned", img: "icons/svg/net.svg" }
];

/**
 * Register the play area: document classes, sheets, settings, templates, status effects, chat
 * buttons, combat hooks, and `game.spacer.play`. Called once from the init hook.
 */
export function registerPlay() {
  CONFIG.Actor.documentClass = SpacerActor;
  CONFIG.Item.documentClass = SpacerItem;

  for (const s of STATUS_EFFECTS) if (!CONFIG.statusEffects.some(e => e.id === s.id)) CONFIG.statusEffects.push(s);

  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet(SYSTEM_ID, SpacerCharacterSheet, { types: ["character"], makeDefault: true, label: "SPACER.Sheet.Character" });
  Actors.registerSheet(SYSTEM_ID, SpacerNpcSheet, { types: ["npc"], makeDefault: true, label: "SPACER.Sheet.Npc" });
  Actors.registerSheet(SYSTEM_ID, SpacerCreatureSheet, { types: ["creature"], makeDefault: true, label: "SPACER.Sheet.Creature" });
  Items.registerSheet(SYSTEM_ID, SpacerItemSheet, {
    types: ["skill", "weapon", "armor", "gear", "psionic", "drug", "shipWeapon"], makeDefault: true, label: "SPACER.Sheet.Item"
  });

  registerSettings();
  preloadTemplates(Object.fromEntries(TEMPLATES.map(t => [`spacer.play.${t.replaceAll("/", ".")}`, templatePath("play", t)])));
  registerChatActions(PLAY_CHAT_ACTIONS);

  Hooks.on("combatStart", combat => resetAll(combat));
  Hooks.on("deleteCombat", (combat, _o, userId) => { if (userId === game.user.id) resetAll(combat); });
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("round" in changed) || !game.user.isActiveGM || !setting("autoMorale", true)) return;
    api.combatMorale(combat);
  });

  game.spacer.play = {
    ...api,
    rules: { ...combatRules, ...attackRules, ...injuryRules, ...characterRules, ...taskRules }
  };
}

function registerSettings() {
  game.settings.register(SYSTEM_ID, "absoluteResults", {
    name: "SPACER.Settings.AbsoluteResults", hint: "SPACER.Settings.AbsoluteResultsHint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "autoMorale", {
    name: "SPACER.Settings.AutoMorale", hint: "SPACER.Settings.AutoMoraleHint",
    scope: "world", config: true, type: Boolean, default: true
  });
}

/** Reset sprint, melee, overwatch, and evade on every combatant (start and end of an encounter). */
async function resetAll(combat) {
  for (const c of combat.combatants) if (c.actor?.isOwner) await api.resetCombatCounters(c.actor);
}
