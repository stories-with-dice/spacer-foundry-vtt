/** Document classes for the Spacer system: convenience methods and automatic token status. */
import { syncInjuryStatus } from "./status.mjs";
import { taskDialog, rollTask } from "./task.mjs";
import { attack } from "./attack.mjs";
import { reloadWeapon } from "./weapons.mjs";
import { applyDamage } from "./damage.mjs";
import { usePsionic } from "./psionics.mjs";
import { useDrug } from "./drugs.mjs";

/** The Actor document class of the system (CONFIG.Actor.documentClass, set by registerPlay). */
export class SpacerActor extends Actor {
  /** Characters and NPCs: six characteristics, skills, END-first damage. */
  get isPerson() {
    return this.type === "character" || this.type === "npc";
  }

  /** @override Player characters get linked tokens with vision; creatures and NPCs stay unlinked. */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    const proto = data.prototypeToken ?? {};
    const update = {};
    if (this.type === "character") {
      if (proto.actorLink === undefined) update["prototypeToken.actorLink"] = true;
      if (proto.disposition === undefined) update["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
      if (proto.sight?.enabled === undefined) update["prototypeToken.sight.enabled"] = true;
    } else if ((this.type === "npc" || this.type === "creature") && proto.disposition === undefined) {
      update["prototypeToken.disposition"] = CONST.TOKEN_DISPOSITIONS.HOSTILE;
    }
    if (Object.keys(update).length) this.updateSource(update);
  }

  /** @override Keep token status icons in step with the injury state. */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId === game.user.id && changed.system) syncInjuryStatus(this);
  }

  /** Open the task dialog for a characteristic (or roll at once with dialog: false). */
  rollCharacteristic(key, { dialog = true } = {}) {
    return dialog ? taskDialog(this, { characteristic: key }) : rollTask({ actor: this, characteristic: key });
  }

  /** Open the task dialog with defaults. */
  rollTask(defaults = {}) {
    return taskDialog(this, defaults);
  }

  /** Attack with an owned weapon (or the natural attack of a creature). */
  attack(weapon = null, options = {}) {
    return attack(this, weapon, options);
  }

  /** Apply damage with the book rules. */
  applyDamage(amount, options = {}) {
    return applyDamage(this, amount, options);
  }
}

/** The Item document class of the system (CONFIG.Item.documentClass, set by registerPlay). */
export class SpacerItem extends Item {
  /** @override A weapon added to an actor starts loaded. */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (this.type === "weapon" && this.parent && this.system.rounds > 0 && !(data.system?.ammo > 0)) {
      this.updateSource({ "system.ammo": this.system.rounds });
    }
  }

  /** Use the item: attack, use a talent, take a drug, or roll a skill. */
  async use(options = {}) {
    const actor = this.actor;
    if (!actor) return null;
    switch (this.type) {
      case "weapon": return attack(actor, this, options);
      case "psionic": return usePsionic(actor, this, options);
      case "drug": return useDrug(actor, this, options);
      case "skill": return taskDialog(actor, { skill: `${this.system.skill || this.name}|${this.system.specialty}`, characteristic: this.system.characteristic });
      default: return null;
    }
  }

  reload() {
    return this.type === "weapon" ? reloadWeapon(this.actor, this) : null;
  }
}
