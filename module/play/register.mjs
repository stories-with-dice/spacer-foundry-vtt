/** Entry point of the "play" area. Called from the init hook in module/spacer.mjs. */
import * as api from "./api.mjs";
import { SpacerActor, SpacerItem } from "./documents.mjs";
import { SpacerCharacterSheet, SpacerNpcSheet, SpacerCreatureSheet } from "./sheets/actor-sheets.mjs";
import { SpacerItemSheet } from "./sheets/item-sheet.mjs";
import { templatePath, L, pickActors, resolveActor, SYSTEM } from "./util.mjs";
import * as combatRules from "./rules/combat.mjs";
import * as characterRules from "./rules/character.mjs";

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

export function registerPlay() {
  CONFIG.Actor.documentClass = SpacerActor;
  CONFIG.Item.documentClass = SpacerItem;

  for (const s of STATUS_EFFECTS) if (!CONFIG.statusEffects.some(e => e.id === s.id)) CONFIG.statusEffects.push(s);

  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet(SYSTEM, SpacerCharacterSheet, { types: ["character"], makeDefault: true, label: "SPACER.Sheet.Character" });
  Actors.registerSheet(SYSTEM, SpacerNpcSheet, { types: ["npc"], makeDefault: true, label: "SPACER.Sheet.Npc" });
  Actors.registerSheet(SYSTEM, SpacerCreatureSheet, { types: ["creature"], makeDefault: true, label: "SPACER.Sheet.Creature" });
  Items.registerSheet(SYSTEM, SpacerItemSheet, {
    types: ["skill", "weapon", "armor", "gear", "psionic", "drug", "shipWeapon"], makeDefault: true, label: "SPACER.Sheet.Item"
  });

  registerSettings();
  foundry.applications.handlebars.loadTemplates(Object.fromEntries(TEMPLATES.map(t => [`spacer.play.${t.replaceAll("/", ".")}`, templatePath(t)])));

  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("combatStart", combat => resetAll(combat));
  Hooks.on("deleteCombat", (combat, _o, userId) => { if (userId === game.user.id) resetAll(combat); });
  Hooks.on("updateCombat", (combat, changed) => {
    if (!("round" in changed) || !game.user.isActiveGM || !game.settings.get(SYSTEM, "autoMorale")) return;
    api.combatMorale(combat);
  });

  game.spacer.play = { ...api, rules: { ...combatRules, ...characterRules } };
}

function registerSettings() {
  game.settings.register(SYSTEM, "absoluteResults", {
    name: "SPACER.Settings.AbsoluteResults", hint: "SPACER.Settings.AbsoluteResultsHint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM, "autoMorale", {
    name: "SPACER.Settings.AutoMorale", hint: "SPACER.Settings.AutoMoraleHint",
    scope: "world", config: true, type: Boolean, default: true
  });
}

/** Reset sprint, melee, overwatch, and evade on every combatant (start and end of an encounter). */
async function resetAll(combat) {
  for (const c of combat.combatants) if (c.actor?.isOwner) await api.resetCombatCounters(c.actor);
}

/** Wire the play buttons on chat cards. */
function onRenderChatMessage(message, html) {
  const flags = message.flags?.[SYSTEM] ?? {};
  for (const btn of html.querySelectorAll("[data-action^='play-']")) {
    btn.addEventListener("click", async event => {
      event.preventDefault();
      btn.disabled = true;
      try {
        await onChatAction(btn.dataset.action, btn.dataset, flags);
      } finally {
        btn.disabled = false;
      }
    });
  }
}

async function onChatAction(action, data, flags) {
  const atk = flags.attack ?? {};
  if (action === "play-damage") {
    const amount = Number(data.amount ?? atk.damage ?? 0);
    const actors = await pickActors(atk.target ? [atk.target] : []);
    if (!actors.length) return ui.notifications.warn(L("Chat.NoTarget"));
    for (const a of actors) {
      if (!a.isOwner) { ui.notifications.warn(L("Chat.NotOwner", { name: a.name })); continue; }
      await api.applyDamage(a, amount, { energy: !!atk.energy, dice: atk.dice ?? 0, source: data.source ?? "" });
    }
  } else if (action === "play-stun") {
    const actors = await pickActors(atk.target ? [atk.target] : []);
    for (const a of actors) await api.resistStun(a);
  } else if (action === "play-sheet") {
    const a = await resolveActor(data.uuid);
    a?.sheet.render(true);
  }
}
