/** The lifepath character creation wizard (ApplicationV2). */
import { Lifepath, summary, rollText } from "./rules/engine.mjs";
import { applyToActor, postSummary } from "./apply.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = key => game.i18n.localize(`SPACER.Chargen.${key}`);

/** Foundry dice for the engine: uniform integers. */
function foundryDice(sides) {
  const u = typeof CONFIG.Dice?.randomUniform === "function" ? CONFIG.Dice.randomUniform() : Math.random();
  return Math.min(sides, 1 + Math.floor(u * sides));
}

export class ChargenWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor, dice, ...options } = {}) {
    super(options);
    this.actor = actor;
    this.lifepath = new Lifepath({ dice: dice ?? foundryDice });
  }

  static DEFAULT_OPTIONS = {
    id: "spacer-chargen-{id}",
    classes: ["spacer", "spacer-chargen"],
    tag: "div",
    window: { title: "SPACER.Chargen.Title", icon: "fa-solid fa-user-astronaut", resizable: true },
    position: { width: 980, height: 720 },
    actions: {
      choose: ChargenWizard.#onChoose,
      roll: ChargenWizard.#onRoll,
      fast: ChargenWizard.#onFast,
      undo: ChargenWizard.#onUndo,
      save: ChargenWizard.#onSave,
      restart: ChargenWizard.#onRestart
    }
  };

  static PARTS = {
    main: { template: "systems/spacer/templates/chargen/wizard.hbs", scrollable: [".chargen-log"] }
  };

  get title() {
    return `${game.i18n.localize("SPACER.Chargen.Title")}: ${this.actor?.name ?? ""}`;
  }

  async _prepareContext(options) {
    const lp = this.lifepath;
    const p = lp.pending;
    const s = summary(lp.state);
    const lastRollEntry = [...lp.log].reverse().find(e => e.kind === "roll" && e.roll.faces.length >= 1 && e.roll.dice !== "D3");
    const lastRoll = lastRollEntry ? {
      label: lastRollEntry.text,
      ...lastRollEntry.roll,
      faces: lastRollEntry.roll.faces.map(f => ({ value: f })),
      mods: lastRollEntry.roll.mods.map(m => ({ label: m.label, value: `${m.value >= 0 ? "+" : ""}${m.value}` })),
      hasTarget: lastRollEntry.roll.target !== null,
      resultClass: lastRollEntry.roll.success === null ? "" : lastRollEntry.roll.success ? "success" : "failure"
    } : null;
    const log = lp.log.map(e => ({
      text: e.text,
      cls: `log-${e.kind ?? "info"}`,
      head: e.kind === "head",
      roll: e.kind === "roll" ? rollText(e.roll) : "",
      success: e.roll?.success === true,
      failure: e.roll?.success === false
    }));
    return {
      actorName: this.actor?.name ?? "",
      pending: {
        ...p,
        isChoice: p.type === "choice",
        isRoll: p.type === "roll",
        isDone: p.type === "done",
        isDead: p.type === "dead",
        mods: (p.mods ?? []).map(m => ({ label: m.label, value: `${m.value >= 0 ? "+" : ""}${m.value}` })),
        hasTarget: p.target !== null && p.target !== undefined,
        options: (p.options ?? []).map(o => ({ ...o, isAuto: o.value === p.auto }))
      },
      lastRoll,
      log,
      s: {
        ...s,
        careers: s.careers.map(c => ({ ...c, label: `${c.name} (${c.terms})${c.rankTitle ? `, ${c.rankTitle}` : ""}${c.commissioned ? ", officer" : ""}${c.drafted ? ", drafted" : ""}` })),
        skills: s.skills.map(k => ({ name: k.key, rank: k.rank })),
        items: s.items.map(i => ({ name: i.name, qty: i.quantity > 1 ? ` x${i.quantity}` : "" })),
        relations: s.relations.map(r => ({ text: r.note ? `${r.type}: ${r.note}` : r.type })),
        pensionText: s.pension.mode ? `${s.pension.mode === "yearly" ? s.pension.yearly : s.pension.monthly}cr ${s.pension.mode}` : "",
        hasPsi: s.psi !== null
      },
      canUndo: lp.canUndo,
      canFast: p.type !== "done",
      canSave: p.type === "done",
      saved: this._saved ?? false
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const log = this.element.querySelector(".chargen-log");
    if (log) log.scrollTop = log.scrollHeight;
  }

  /** Answer the pending request and re-render. */
  step(value = null) {
    this.lifepath.respond(value);
    this._saved = false;
    return this.render();
  }

  /** Resolve every remaining step with the default choices. */
  fast() {
    this.lifepath.autoRun();
    return this.render();
  }

  /** Write the result to the actor and post the chat card. */
  async save({ confirm = true } = {}) {
    if (!this.lifepath.done) return null;
    if (confirm && this.actor.system.chargenComplete) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: L("Title") }, content: `<p>${L("Overwrite")}</p>`
      });
      if (!ok) return null;
    }
    await applyToActor(this.actor, this.lifepath.state);
    await postSummary(this.actor, this.lifepath.state);
    this._saved = true;
    ui.notifications.info(game.i18n.format("SPACER.Chargen.Saved", { name: this.actor.name }));
    await this.render();
    return this.actor;
  }

  static #onChoose(event, target) { return this.step(target.dataset.value); }
  static #onRoll() { return this.step(null); }
  static #onFast() { return this.fast(); }
  static #onUndo() { this.lifepath.undo(); this._saved = false; return this.render(); }
  static #onRestart() { this.lifepath.restart(); this._saved = false; return this.render(); }
  static async #onSave() { return this.save(); }
}

/** Open the wizard for a character actor. */
export function openChargen(actor, options = {}) {
  if (!actor || actor.documentName !== "Actor") throw new Error("openChargen needs an Actor");
  if (actor.type !== "character") {
    ui.notifications.warn(L("OnlyCharacters"));
    return null;
  }
  const app = new ChargenWizard({ actor, ...options });
  app.render({ force: true });
  return app;
}
