/** Actor sheets: character (tabbed), NPC (one page), creature (one page). */
import { CHARACTERISTICS } from "../../config.mjs";
import { normalizeRange, parseTraits, COVER_STEPS } from "../rules/combat.mjs";
import { psiCap } from "../rules/character.mjs";
import { L, signed, templatePath } from "../util.mjs";
import { skillRank, taskDialog, rollTask } from "../task.mjs";
import { attack, reloadWeapon, unjamWeapon, isMelee } from "../attack.mjs";
import { applyDamage, heal, naturalHealing, firstAid } from "../damage.mjs";
import { usePsionic, recoverPsi, useDrug, resetCombatCounters, sprint, trainSkill, moraleCheck } from "../abilities.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = () => foundry.applications.ux.TextEditor.implementation;

const INJURY_CLASS = { healthy: "ok", wounded: "warn", pinned: "warn", unconscious: "bad", dead: "dead" };

/** Shared behaviour of the three actor sheets. */
class SpacerActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["spacer", "spacer-sheet", "actor"],
    form: { submitOnChange: true, closeOnSubmit: false },
    window: { resizable: true },
    actions: {
      rollChar: SpacerActorSheet.#onRollChar,
      rollTask: SpacerActorSheet.#onRollTask,
      rollSkill: SpacerActorSheet.#onRollSkill,
      attack: SpacerActorSheet.#onAttack,
      reload: SpacerActorSheet.#onReload,
      unjam: SpacerActorSheet.#onUnjam,
      itemEdit: SpacerActorSheet.#onItemEdit,
      itemDelete: SpacerActorSheet.#onItemDelete,
      itemCreate: SpacerActorSheet.#onItemCreate,
      itemToggle: SpacerActorSheet.#onItemToggle,
      itemUse: SpacerActorSheet.#onItemUse,
      trainSkill: SpacerActorSheet.#onTrainSkill,
      firstAid: SpacerActorSheet.#onFirstAid,
      rest: SpacerActorSheet.#onRest,
      damage: SpacerActorSheet.#onDamage,
      heal: SpacerActorSheet.#onHeal,
      sprint: SpacerActorSheet.#onSprint,
      meleeUse: SpacerActorSheet.#onMeleeUse,
      overwatch: SpacerActorSheet.#onOverwatch,
      resetCombat: SpacerActorSheet.#onResetCombat,
      recoverPsi: SpacerActorSheet.#onRecoverPsi,
      openPack: SpacerActorSheet.#onOpenPack,
      chargen: SpacerActorSheet.#onChargen,
      careerAdd: SpacerActorSheet.#onCareerAdd,
      careerDelete: SpacerActorSheet.#onCareerDelete,
      creatureAttack: SpacerActorSheet.#onCreatureAttack,
      morale: SpacerActorSheet.#onMorale
    }
  };

  /** @override Add "Create character" to the header menu when the chargen area is loaded. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (this.actor.type === "character" && typeof game.spacer?.chargen?.open === "function" && this.isEditable) {
      controls.unshift({ action: "chargen", icon: "fa-solid fa-user-astronaut", label: "SPACER.Sheet.CreateCharacter", ownership: "OWNER" });
    }
    return controls;
  }

  /** @override */
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const actor = this.actor;
    const s = actor.system;
    Object.assign(ctx, {
      actor, system: s, type: actor.type,
      isCharacter: actor.type === "character", isNpc: actor.type === "npc", isCreature: actor.type === "creature",
      isPerson: actor.type === "character" || actor.type === "npc",
      chargen: actor.type === "character" && typeof game.spacer?.chargen?.open === "function" && this.isEditable
    });
    const injury = s.injury?.label ?? "healthy";
    ctx.injury = { label: L(`Injury.${injury}`), css: INJURY_CLASS[injury] ?? "ok", key: injury };
    if (ctx.isPerson) this.#preparePerson(ctx);
    if (ctx.isCreature) this.#prepareCreature(ctx);
    return ctx;
  }

  #preparePerson(ctx) {
    const actor = this.actor;
    const s = actor.system;
    ctx.characteristics = CHARACTERISTICS.map(k => {
      const c = s.characteristics[k];
      return { key: k, label: L(`Char.${k}`), long: L(`CharLong.${k}`), value: c.value, max: c.max, dm: signed(c.dm),
        hurt: c.value < c.max, zero: c.value <= 0, boosted: c.value > c.max };
    });
    ctx.psi = { value: s.psi.value, max: s.psi.max, dm: signed(s.dm.psi), has: s.psi.max > 0 || s.psi.value > 0, cap: psiCap({
      str: s.characteristics.str.value, dex: s.characteristics.dex.value, end: s.characteristics.end.value, int: s.characteristics.int.value }) };

    // Skills grouped by base skill, specialties under it.
    const groups = new Map();
    for (const i of actor.items.filter(i => i.type === "skill")) {
      const base = i.system.skill || i.name;
      if (!groups.has(base)) groups.set(base, { name: base, base: null, specialties: [] });
      const g = groups.get(base);
      if (i.system.specialty) g.specialties.push({ id: i.id, name: i.system.specialty, rank: i.system.rank, item: i });
      else g.base = { id: i.id, rank: i.system.rank, item: i, characteristic: i.system.characteristic };
    }
    ctx.skillGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
      .map(g => ({ ...g, specialties: g.specialties.sort((a, b) => a.name.localeCompare(b.name)) }));

    // Weapons, armour, gear, drugs, psionics.
    const byType = t => actor.items.filter(i => i.type === t).sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
    ctx.weapons = byType("weapon").map(w => {
      const ws = w.system;
      const rank = ws.skill ? skillRank(actor, ws.skill, ws.specialty) : 0;
      return {
        id: w.id, name: w.name, img: w.img, damage: ws.damage, equipped: ws.equipped, jammed: ws.jammed, broken: ws.broken,
        range: L(`Range.${normalizeRange(ws.range) || "short"}`), melee: isMelee(w),
        usesAmmo: !isMelee(w) && ws.rounds > 0, ammo: ws.ammo, rounds: ws.rounds, empty: ws.rounds > 0 && ws.ammo <= 0,
        traits: (ws.traits ?? []).join(", "),
        skill: ws.specialty ? `${ws.skill} (${ws.specialty})` : ws.skill, rank: signed(rank), untrained: rank === -3
      };
    });
    ctx.armour = byType("armor").map(a => ({ id: a.id, name: a.name, img: a.img, difficulty: a.system.effectiveDifficulty ?? a.system.difficulty,
      equipped: a.system.equipped, damaged: a.system.damaged, traits: (a.system.traits ?? []).join(", "), weight: a.system.equipped ? a.system.wornWeight : a.system.weight }));
    ctx.gear = byType("gear").map(g => ({ id: g.id, name: g.name, img: g.img, quantity: g.system.quantity, weight: g.system.weight,
      carried: g.system.carried, uses: g.system.uses.max ? `${g.system.uses.value}/${g.system.uses.max}` : "" }));
    ctx.drugs = byType("drug").map(d => ({ id: d.id, name: d.name, img: d.img, doses: d.system.doses > 0 ? d.system.doses : d.system.quantity, effect: d.system.effect }));
    const disciplines = new Map();
    for (const p of byType("psionic")) {
      const d = p.system.discipline || "special";
      if (!disciplines.has(d)) disciplines.set(d, { key: d, label: L(`Psi.Discipline.${d}`), talents: [] });
      disciplines.get(d).talents.push({ id: p.id, name: p.name, img: p.img, level: p.system.level, cost: p.system.psiCost, duration: p.system.duration, range: p.system.range });
    }
    ctx.disciplines = [...disciplines.values()];

    // Encumbrance bar (p.41): the bar is full at 4x STR.
    const e = s.encumbrance;
    const scale = Math.max(1, e.overEncumbered);
    ctx.enc = {
      carried: e.carried, level: L(`Enc.${e.level}`), css: { minimal: "ok", encumbered: "warn", overEncumbered: "bad", overloaded: "dead" }[e.level],
      pct: Math.min(100, Math.round((e.carried / scale) * 100)),
      m1: Math.round((e.minimal / scale) * 100), m2: Math.round((e.encumbered / scale) * 100),
      minimal: e.minimal, encumbered: e.encumbered, overEncumbered: e.overEncumbered
    };

    // Combat state.
    const opt = (keys, prefix, sel) => keys.map(k => ({ value: k, label: L(`${prefix}.${k}`), selected: k === sel }));
    ctx.positions = opt(["standing", "kneeling", "prone", "wall"], "Position", s.combat.position);
    ctx.covers = opt(COVER_STEPS, "Cover", s.combat.cover);
    const endBudget = s.combat.sprintUsed + s.sprintRemaining;
    ctx.sprint = { used: s.combat.sprintUsed, remaining: s.sprintRemaining, total: endBudget };
    ctx.melee = { used: s.combat.meleeUsed, remaining: s.meleeRemaining === Infinity ? "∞" : s.meleeRemaining };
    ctx.armorTotal = s.armor.total;
    ctx.armorName = s.armor.name || L("Armour.None");
    ctx.fatigued = s.fatigue > 0;
    if (ctx.isCharacter) {
      ctx.careers = s.careers.map((c, i) => ({ ...c, index: i }));
    }
  }

  #prepareCreature(ctx) {
    const s = this.actor.system;
    ctx.sizes = ["tiny", "small", "medium", "large", "veryLarge"].map(k => ({ value: k, label: L(`Creature.Size.${k}`), selected: k === s.size }));
    ctx.behaviours = ["", "herbivore", "carnivore", "omnivore", "scavenger"].map(k => ({ value: k, label: k ? L(`Creature.Behaviour.${k}`) : "—", selected: k === s.behaviour }));
    ctx.traitsText = (s.traits ?? []).join(", ");
    ctx.hitsPct = s.hits.max ? Math.round((s.hits.value / s.hits.max) * 100) : 0;
    ctx.thresholds = { pinned: Math.ceil(s.hits.max / 2), unconscious: Math.ceil(s.hits.max * 0.75) };
  }

  /** @override */
  async _preparePartContext(partId, ctx, options) {
    ctx = await super._preparePartContext(partId, ctx, options);
    if (ctx.tabs?.[partId]) ctx.tab = ctx.tabs[partId];
    const enrich = html => TextEditor().enrichHTML(html ?? "", { secrets: this.actor.isOwner, relativeTo: this.actor });
    const s = this.actor.system;
    if (partId === "bio" || partId === "npc") ctx.enriched = { biography: await enrich(s.biography), notes: await enrich(s.notes) };
    if (partId === "career") ctx.enriched = { history: await enrich(s.history) };
    if (partId === "creature") ctx.enriched = { description: await enrich(s.description) };
    return ctx;
  }

  /** @override Creature traits are typed as text, split into a list. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const traits = data.system?.traits;
    if (typeof traits === "string") data.system.traits = traits.split(",").map(t => t.trim()).filter(Boolean);
    return data;
  }

  /** @override Inline item fields (rank, quantity, ammo) update the item, not the actor. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const el of this.element.querySelectorAll("[data-item-field]")) {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const item = this.actor.items.get(el.closest("[data-item-id]")?.dataset.itemId);
        if (!item) return;
        const value = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
        item.update({ [el.dataset.itemField]: value });
      });
    }
  }

  /** @override Dropping a skill the actor already has does not duplicate it. */
  async _onDropItem(event, item) {
    if (item.type === "skill" && this.actor.uuid !== item.parent?.uuid) {
      const norm = v => String(v ?? "").toLowerCase();
      const dup = this.actor.items.find(i => i.type === "skill" && norm(i.system.skill || i.name) === norm(item.system.skill || item.name) && norm(i.system.specialty) === norm(item.system.specialty));
      if (dup) { ui.notifications.info(L("Skill.AlreadyHas", { skill: dup.system.fullName || dup.name })); return null; }
    }
    if (["vehicle", "ship"].includes(item.type)) return null;
    return super._onDropItem(event, item);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  #item(target) {
    return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  #number(selector, fallback = 0) {
    const el = this.element.querySelector(selector);
    return el ? Number(el.value) || fallback : fallback;
  }

  static #onRollChar(event, target) {
    const key = target.dataset.char;
    if (event.shiftKey) return rollTask({ actor: this.actor, characteristic: key });
    return taskDialog(this.actor, { characteristic: key });
  }

  static #onRollTask() {
    return taskDialog(this.actor, {});
  }

  static #onRollSkill(event, target) {
    const item = this.#item(target);
    if (!item) return;
    const skill = `${item.system.skill || item.name}|${item.system.specialty}`;
    if (event.shiftKey) return rollTask({ actor: this.actor, skill: item.system.skill || item.name, specialty: item.system.specialty, characteristic: item.system.characteristic });
    return taskDialog(this.actor, { skill, characteristic: item.system.characteristic });
  }

  static #onAttack(event, target) {
    const item = this.#item(target);
    return attack(this.actor, item ?? null, { dialog: !event.shiftKey });
  }

  static #onCreatureAttack(event) {
    return attack(this.actor, null, { dialog: !event.shiftKey });
  }

  static #onReload(_e, target) { return reloadWeapon(this.actor, this.#item(target)); }
  static #onUnjam(_e, target) { return unjamWeapon(this.actor, this.#item(target)); }
  static #onItemEdit(_e, target) { this.#item(target)?.sheet.render(true); }

  static async #onItemDelete(_e, target) {
    const item = this.#item(target);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: L("Sheet.DeleteTitle") }, classes: ["spacer", "spacer-dialog"],
      content: `<p>${L("Sheet.DeleteConfirm", { name: foundry.utils.escapeHTML(item.name) })}</p>`
    });
    if (ok) await item.delete();
  }

  static async #onItemCreate(_e, target) {
    const type = target.dataset.type;
    const name = L("Sheet.NewItem", { type: game.i18n.localize(CONFIG.Item.typeLabels?.[type] ?? type) });
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
    item?.sheet.render(true);
  }

  static #onItemToggle(_e, target) {
    const item = this.#item(target);
    const field = target.dataset.field;
    if (!item || !field) return;
    const update = { [field]: !foundry.utils.getProperty(item, field) };
    // Wearing one armour takes off the others (only the best counts anyway).
    if (item.type === "armor" && field === "system.equipped" && update[field]) {
      for (const other of this.actor.items.filter(i => i.type === "armor" && i.id !== item.id && i.system.equipped)) other.update({ "system.equipped": false });
    }
    return item.update(update);
  }

  static #onItemUse(event, target) {
    const item = this.#item(target);
    if (!item) return;
    if (item.type === "psionic") return usePsionic(this.actor, item, { dialog: !event.shiftKey });
    if (item.type === "drug") return useDrug(this.actor, item);
    return item.use?.();
  }

  static #onTrainSkill(event, target) {
    return trainSkill(this.actor, this.#item(target), { instructor: event.shiftKey });
  }

  /** First aid: the healer is a controlled token's actor other than the patient, else the patient. */
  static #onFirstAid() {
    const healer = canvas?.ready ? canvas.tokens.controlled.map(t => t.actor).find(a => a && a !== this.actor) : null;
    return firstAid(this.actor, { healer: healer ?? this.actor });
  }

  static #onRest(_e, target) {
    return naturalHealing(this.actor, { days: this.#number("[data-rest-days]", 1), medical: target.dataset.medical === "true" });
  }

  static #onDamage() {
    const n = this.#number("[data-damage-input]", 0);
    if (n > 0) return applyDamage(this.actor, n, { source: L("Damage.Manual") });
  }

  static #onHeal() {
    const n = this.#number("[data-damage-input]", 0);
    if (n > 0) return heal(this.actor, n);
  }

  static #onSprint() {
    return sprint(this.actor, this.#number("[data-sprint-input]", 1));
  }

  static #onMeleeUse(_e, target) {
    const d = Number(target.dataset.delta) || 1;
    return this.actor.update({ "system.combat.meleeUsed": Math.max(0, this.actor.system.combat.meleeUsed + d) });
  }

  static #onOverwatch(_e, target) {
    const d = Number(target.dataset.delta) || 1;
    return this.actor.update({ "system.combat.overwatch": Math.clamp(this.actor.system.combat.overwatch + d, 0, 5) });
  }

  static #onResetCombat() { return resetCombatCounters(this.actor); }

  static #onRecoverPsi() { return recoverPsi(this.actor, this.#number("[data-psi-hours]", 1)); }

  static #onOpenPack(_e, target) {
    const pack = game.packs.get(`spacer.${target.dataset.pack}`);
    if (pack) pack.render(true);
    else ui.notifications.warn(L("Sheet.NoPack", { pack: target.dataset.pack }));
  }

  static #onChargen() { return game.spacer?.chargen?.open?.(this.document); }

  static #onCareerAdd() {
    const careers = this.actor.system.toObject().careers ?? [];
    careers.push({ career: "", terms: 1, rank: 0, rankTitle: "", commissioned: false, drafted: false });
    return this.actor.update({ "system.careers": careers });
  }

  static #onCareerDelete(_e, target) {
    const careers = this.actor.system.toObject().careers ?? [];
    careers.splice(Number(target.dataset.index), 1);
    return this.actor.update({ "system.careers": careers });
  }

  static #onMorale() { return moraleCheck({ actors: [this.actor], leader: this.actor.type === "creature" ? null : undefined }); }
}

/** Player character sheet with tabs. */
export class SpacerCharacterSheet extends SpacerActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["character"],
    position: { width: 760, height: 760 }
  };

  static PARTS = {
    header: { template: templatePath("actor/header") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: templatePath("actor/main"), scrollable: [""] },
    skills: { template: templatePath("actor/skills"), scrollable: [""] },
    gear: { template: templatePath("actor/gear"), scrollable: [""] },
    combat: { template: templatePath("actor/combat"), scrollable: [""] },
    psionics: { template: templatePath("actor/psionics"), scrollable: [""] },
    career: { template: templatePath("actor/career"), scrollable: [""] },
    bio: { template: templatePath("actor/bio"), scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-id-card" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "gear", icon: "fa-solid fa-suitcase" },
        { id: "combat", icon: "fa-solid fa-crosshairs" },
        { id: "psionics", icon: "fa-solid fa-brain" },
        { id: "career", icon: "fa-solid fa-route" },
        { id: "bio", icon: "fa-solid fa-feather" }
      ],
      initial: "main",
      labelPrefix: "SPACER.Tab"
    }
  };
}

/** Compact NPC sheet. */
export class SpacerNpcSheet extends SpacerActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: { width: 640, height: 720 }
  };

  static PARTS = {
    header: { template: templatePath("actor/header") },
    npc: { template: templatePath("actor/npc"), scrollable: [""] }
  };
}

/** Alien animal sheet. */
export class SpacerCreatureSheet extends SpacerActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["creature"],
    position: { width: 560, height: 640 }
  };

  static PARTS = {
    header: { template: templatePath("actor/header") },
    creature: { template: templatePath("actor/creature"), scrollable: [""] }
  };
}
