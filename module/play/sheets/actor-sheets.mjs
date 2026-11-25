/** Actor sheets: character (tabbed), NPC (one page), creature (one page). */
import { localizer, templatePath } from "../../shared/foundry.mjs";
import { preparePerson, prepareCreature } from "./actor-context.mjs";
import { ACTOR_SHEET_ACTIONS } from "./actor-actions.mjs";

const L = localizer("SPACER");

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
    actions: ACTOR_SHEET_ACTIONS
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
    if (ctx.isPerson) preparePerson(actor, ctx);
    if (ctx.isCreature) prepareCreature(actor, ctx);
    return ctx;
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
}

/** Player character sheet with tabs. */
export class SpacerCharacterSheet extends SpacerActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["character"],
    position: { width: 760, height: 760 }
  };

  static PARTS = {
    header: { template: templatePath("play", "actor/header") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: templatePath("play", "actor/main"), scrollable: [""] },
    skills: { template: templatePath("play", "actor/skills"), scrollable: [""] },
    gear: { template: templatePath("play", "actor/gear"), scrollable: [""] },
    combat: { template: templatePath("play", "actor/combat"), scrollable: [""] },
    psionics: { template: templatePath("play", "actor/psionics"), scrollable: [""] },
    career: { template: templatePath("play", "actor/career"), scrollable: [""] },
    bio: { template: templatePath("play", "actor/bio"), scrollable: [""] }
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
    header: { template: templatePath("play", "actor/header") },
    npc: { template: templatePath("play", "actor/npc"), scrollable: [""] }
  };
}

/** Alien animal sheet. */
export class SpacerCreatureSheet extends SpacerActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["creature"],
    position: { width: 560, height: 640 }
  };

  static PARTS = {
    header: { template: templatePath("play", "actor/header") },
    creature: { template: templatePath("play", "actor/creature"), scrollable: [""] }
  };
}
