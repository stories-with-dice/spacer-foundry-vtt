/**
 * Actions of the actor sheets (ApplicationV2 `actions`): each runs with `this` = the sheet.
 * Every handler reads the clicked element (`data-item-id`, `data-char`, ...) and calls the play API.
 */
import { localizer } from "../../shared/foundry.mjs";
import { taskDialog, rollTask } from "../task.mjs";
import { attack } from "../attack.mjs";
import { reloadWeapon, unjamWeapon } from "../weapons.mjs";
import { applyDamage } from "../damage.mjs";
import { heal, naturalHealing, firstAid } from "../healing.mjs";
import { usePsionic, recoverPsi } from "../psionics.mjs";
import { useDrug } from "../drugs.mjs";
import { resetCombatCounters, sprint, moraleCheck } from "../combat-state.mjs";
import { trainSkill } from "../training.mjs";

const L = localizer("SPACER");

/** The owned item of the row that holds the clicked element. */
function itemOf(sheet, target) {
  return sheet.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
}

/** The number in a sheet input, or the fallback. */
function numberOf(sheet, selector, fallback = 0) {
  const el = sheet.element.querySelector(selector);
  return el ? Number(el.value) || fallback : fallback;
}

function onRollChar(event, target) {
  const key = target.dataset.char;
  if (event.shiftKey) return rollTask({ actor: this.actor, characteristic: key });
  return taskDialog(this.actor, { characteristic: key });
}

function onRollTask() {
  return taskDialog(this.actor, {});
}

function onRollSkill(event, target) {
  const item = itemOf(this, target);
  if (!item) return;
  const skill = `${item.system.skill || item.name}|${item.system.specialty}`;
  if (event.shiftKey) return rollTask({ actor: this.actor, skill: item.system.skill || item.name, specialty: item.system.specialty, characteristic: item.system.characteristic });
  return taskDialog(this.actor, { skill, characteristic: item.system.characteristic });
}

function onAttack(event, target) {
  const item = itemOf(this, target);
  return attack(this.actor, item ?? null, { dialog: !event.shiftKey });
}

function onCreatureAttack(event) {
  return attack(this.actor, null, { dialog: !event.shiftKey });
}

function onReload(_e, target) { return reloadWeapon(this.actor, itemOf(this, target)); }
function onUnjam(_e, target) { return unjamWeapon(this.actor, itemOf(this, target)); }
function onItemEdit(_e, target) { itemOf(this, target)?.sheet.render(true); }

async function onItemDelete(_e, target) {
  const item = itemOf(this, target);
  if (!item) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("Sheet.DeleteTitle") }, classes: ["spacer", "spacer-dialog"],
    content: `<p>${L("Sheet.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`
  });
  if (ok) await item.delete();
}

async function onItemCreate(_e, target) {
  const type = target.dataset.type;
  const name = L("Sheet.NewItem", { type: game.i18n.localize(CONFIG.Item.typeLabels?.[type] ?? type) });
  const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
  item?.sheet.render(true);
}

function onItemToggle(_e, target) {
  const item = itemOf(this, target);
  const field = target.dataset.field;
  if (!item || !field) return;
  const update = { [field]: !foundry.utils.getProperty(item, field) };
  // Wearing one armour takes off the others (only the best counts anyway).
  if (item.type === "armor" && field === "system.equipped" && update[field]) {
    for (const other of this.actor.items.filter(i => i.type === "armor" && i.id !== item.id && i.system.equipped)) other.update({ "system.equipped": false });
  }
  return item.update(update);
}

function onItemUse(event, target) {
  const item = itemOf(this, target);
  if (!item) return;
  if (item.type === "psionic") return usePsionic(this.actor, item, { dialog: !event.shiftKey });
  if (item.type === "drug") return useDrug(this.actor, item);
  return item.use?.();
}

function onTrainSkill(event, target) {
  return trainSkill(this.actor, itemOf(this, target), { instructor: event.shiftKey });
}

/** First aid: the healer is a controlled token's actor other than the patient, else the patient. */
function onFirstAid() {
  const healer = canvas?.ready ? canvas.tokens.controlled.map(t => t.actor).find(a => a && a !== this.actor) : null;
  return firstAid(this.actor, { healer: healer ?? this.actor });
}

function onRest(_e, target) {
  return naturalHealing(this.actor, { days: numberOf(this, "[data-rest-days]", 1), medical: target.dataset.medical === "true" });
}

function onDamage() {
  const n = numberOf(this, "[data-damage-input]", 0);
  if (n > 0) return applyDamage(this.actor, n, { source: L("Damage.Manual") });
}

function onHeal() {
  const n = numberOf(this, "[data-damage-input]", 0);
  if (n > 0) return heal(this.actor, n);
}

function onSprint() {
  return sprint(this.actor, numberOf(this, "[data-sprint-input]", 1));
}

function onMeleeUse(_e, target) {
  const d = Number(target.dataset.delta) || 1;
  return this.actor.update({ "system.combat.meleeUsed": Math.max(0, this.actor.system.combat.meleeUsed + d) });
}

function onOverwatch(_e, target) {
  const d = Number(target.dataset.delta) || 1;
  return this.actor.update({ "system.combat.overwatch": Math.clamp(this.actor.system.combat.overwatch + d, 0, 5) });
}

function onResetCombat() { return resetCombatCounters(this.actor); }

function onRecoverPsi() { return recoverPsi(this.actor, numberOf(this, "[data-psi-hours]", 1)); }

function onOpenPack(_e, target) {
  const pack = game.packs.get(`spacer.${target.dataset.pack}`);
  if (pack) pack.render(true);
  else ui.notifications.warn(L("Sheet.NoPack", { pack: target.dataset.pack }));
}

function onChargen() { return game.spacer?.chargen?.open?.(this.document); }

function onCareerAdd() {
  const careers = this.actor.system.toObject().careers ?? [];
  careers.push({ career: "", terms: 1, rank: 0, rankTitle: "", commissioned: false, drafted: false });
  return this.actor.update({ "system.careers": careers });
}

function onCareerDelete(_e, target) {
  const careers = this.actor.system.toObject().careers ?? [];
  careers.splice(Number(target.dataset.index), 1);
  return this.actor.update({ "system.careers": careers });
}

function onMorale() { return moraleCheck({ actors: [this.actor], leader: this.actor.type === "creature" ? null : undefined }); }

/**
 * The action map of SpacerActorSheet (DEFAULT_OPTIONS.actions), keyed by `data-action`.
 * Used by module/play/sheets/actor-sheets.mjs.
 */
export const ACTOR_SHEET_ACTIONS = {
  rollChar: onRollChar,
  rollTask: onRollTask,
  rollSkill: onRollSkill,
  attack: onAttack,
  creatureAttack: onCreatureAttack,
  reload: onReload,
  unjam: onUnjam,
  itemEdit: onItemEdit,
  itemDelete: onItemDelete,
  itemCreate: onItemCreate,
  itemToggle: onItemToggle,
  itemUse: onItemUse,
  trainSkill: onTrainSkill,
  firstAid: onFirstAid,
  rest: onRest,
  damage: onDamage,
  heal: onHeal,
  sprint: onSprint,
  meleeUse: onMeleeUse,
  overwatch: onOverwatch,
  resetCombat: onResetCombat,
  recoverPsi: onRecoverPsi,
  openPack: onOpenPack,
  chargen: onChargen,
  careerAdd: onCareerAdd,
  careerDelete: onCareerDelete,
  morale: onMorale
};
