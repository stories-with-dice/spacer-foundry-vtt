/** Task rolls (book p.14) and skill lookup (p.28). Re-exported by api.mjs. */
import { CHARACTERISTICS, TASK_TARGET, UNTRAINED_DM, bookDice } from "../config.mjs";
import { localizer, postCard, renderAreaTemplate, signed, setting, formValues } from "../shared/foundry.mjs";
import { taskOutcome, chance2D } from "./rules/task.mjs";

const L = localizer("SPACER");

const norm = s => String(s ?? "").trim().toLowerCase();

/**
 * Effective rank of a skill on an actor (book p.28): the specialty item's rank, else the base
 * skill's rank (a rank-0 base skill covers all its specialties), else UNTRAINED_DM (-3).
 * @param {Actor} actor
 * @param {string} skill      base name, e.g. "Melee"; also accepts "Melee (Blade)"
 * @param {string} [specialty]
 * @returns {number}
 */
export function skillRank(actor, skill, specialty = "") {
  if (!skill) return 0;
  const m = String(skill).match(/^(.*?)\s*\((.*)\)\s*$/);
  if (m) { skill = m[1]; specialty = specialty || m[2]; }
  const skills = actor?.items?.filter(i => i.type === "skill" && norm(i.system.skill || i.name) === norm(skill)) ?? [];
  if (specialty) {
    const spec = skills.find(i => norm(i.system.specialty) === norm(specialty));
    if (spec) return spec.system.rank;
  }
  const base = skills.find(i => !i.system.specialty);
  if (base) return base.system.rank;
  if (!specialty && skills.length) return Math.max(...skills.map(i => i.system.rank));
  return UNTRAINED_DM;
}

/** True when the actor has a skill item for exactly this specialty. Called by prepareAttack (Low-Tech check). */
export function hasSpecialty(actor, skill, specialty) {
  return !!actor?.items?.some(i => i.type === "skill" && norm(i.system.skill || i.name) === norm(skill) && norm(i.system.specialty) === norm(specialty));
}

/**
 * Roll a 2D task (book p.14) and post a chat card (templates/play/chat/task.hbs). With the
 * absoluteResults setting, snake eyes always fails and boxcars always succeeds (rules/task.mjs).
 * Called by the sheets, the task dialog, every play feature, and the craft and tools areas.
 * @param {object} o
 * @param {Actor} [o.actor]
 * @param {string} [o.characteristic]  "str" | "dex" | ... | "psi" | ""
 * @param {string} [o.skill]           base or full skill name; "" = no skill
 * @param {string} [o.specialty]
 * @param {number} [o.dm=0]            other DMs
 * @param {number} [o.target=8]
 * @param {string} [o.label]           card title
 * @param {string} [o.formula="2d6"]   dice part, e.g. "3d6kh2" for boon
 * @param {boolean} [o.chat=true]
 * @param {{label: string, value: number}[]} [o.mods]  extra DMs shown on the card (already counted in dm)
 * @param {string} [o.notes]           extra HTML shown on the card
 * @returns {Promise<{roll: Roll, total: number, natural: number, effect: number, success: boolean, boxcars: boolean, snakeEyes: boolean, message?: ChatMessage}>}
 */
export async function rollTask({ actor, characteristic = "", skill = "", specialty = "", dm = 0, target = TASK_TARGET, label = "", formula = "2d6", chat = true, mods = [], notes = "" } = {}) {
  const parts = [formula];
  const data = {};
  const shown = [];
  if (characteristic && actor?.system?.dm) {
    parts.push("@char");
    data.char = actor.system.dm[characteristic] ?? 0;
    shown.push({ label: characteristic.toUpperCase(), value: data.char });
  }
  if (skill) {
    parts.push("@skill");
    data.skill = skillRank(actor, skill, specialty);
    shown.push({ label: data.skill === UNTRAINED_DM ? `${skill} (${L("Roll.Untrained")})` : (specialty ? `${skill} (${specialty})` : skill), value: data.skill });
  }
  if (dm) {
    parts.push("@dm");
    data.dm = dm;
    if (mods.length) shown.push(...mods);
    else shown.push({ label: L("Roll.DM"), value: dm });
  }
  const roll = await new Roll(parts.join(" + "), data).evaluate();
  const natural = roll.dice[0]?.total ?? roll.total;
  const faces = roll.dice[0]?.results?.filter(r => r.active).map(r => r.result) ?? [];
  const absolute = setting("absoluteResults", true);
  const { effect, success, boxcars, snakeEyes } = taskOutcome({ faces, total: roll.total, target, absolute });
  const result = { roll, total: roll.total, natural, effect, success, boxcars, snakeEyes };
  if (chat) {
    const title = label || [skill && (specialty ? `${skill} (${specialty})` : skill), characteristic.toUpperCase()].filter(Boolean).join(" / ") || L("Roll.Task");
    result.message = await postCard({
      area: "play",
      actor,
      template: "chat/task",
      rolls: [roll],
      data: {
        title, target, notes,
        actorName: actor?.name ?? "",
        mods: shown.map(m => ({ ...m, signed: signed(m.value) })),
        rollHTML: await roll.render(),
        success: result.success,
        effect: signed(effect),
        absolute: absolute ? (boxcars ? "success" : snakeEyes ? "failure" : "") : ""
      },
      flags: { task: { target, effect, success: result.success, characteristic, skill, specialty } }
    });
  }
  return result;
}

/**
 * Roll book dice ("2D+3", "D3", "D66") with Foundry's Roll and return the evaluated Roll.
 * Called by the craft area, fall(), and macros.
 */
export async function rollBookDice(formula, data = {}) {
  return new Roll(bookDice(formula), data).evaluate();
}

/** Skill choices for the task dialog select: value "Skill|Specialty", label "Skill (Specialty) N". */
export function skillChoices(actor) {
  const skills = actor?.items?.filter(i => i.type === "skill") ?? [];
  return skills
    .map(i => ({ value: `${i.system.skill || i.name}|${i.system.specialty}`, label: `${i.system.specialty ? `${i.system.skill || i.name} (${i.system.specialty})` : (i.system.skill || i.name)} ${i.system.rank}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Characteristic choices for the task dialog select: "" plus each characteristic with its DM, and PSI when the actor has it. */
export function characteristicChoices(actor, { psi = true } = {}) {
  const out = [{ value: "", label: "—" }];
  for (const k of CHARACTERISTICS) {
    const dm = actor?.system?.dm?.[k];
    out.push({ value: k, label: `${L(`Char.${k}`)}${dm !== undefined ? ` (${signed(dm)})` : ""}` });
  }
  if (psi && actor?.system?.psi?.max > 0) out.push({ value: "psi", label: `PSI (${signed(actor.system.dm.psi)})` });
  return out;
}

/**
 * Open the task roll dialog (characteristic, skill, extra DM, target), then roll.
 * @param {Actor} actor
 * @param {object} [defaults]  characteristic, skill ("Skill|Specialty" or "Skill"), dm, target, label
 * @returns {Promise<object|null>} the rollTask result, or null when cancelled
 */
export async function taskDialog(actor, defaults = {}) {
  const fatigued = (actor?.system?.fatigue ?? 0) > 0;
  let skill = defaults.skill ?? "";
  if (skill && !skill.includes("|")) {
    const m = skill.match(/^(.*?)\s*\((.*)\)\s*$/);
    skill = m ? `${m[1]}|${m[2]}` : `${skill}|${defaults.specialty ?? ""}`;
  }
  const choices = skillChoices(actor);
  if (skill && !choices.some(c => c.value === skill)) {
    const [s, sp] = skill.split("|");
    choices.unshift({ value: skill, label: `${sp ? `${s} (${sp})` : s} — ${L("Roll.Untrained")} (-3)` });
  }
  const content = await renderAreaTemplate("play", "dialogs/task", {
    characteristic: defaults.characteristic ?? "",
    characteristics: characteristicChoices(actor),
    skill, skills: choices,
    dm: defaults.dm ?? 0,
    target: defaults.target ?? TASK_TARGET,
    fatigued,
    label: defaults.label ?? ""
  });
  const DialogV2 = foundry.applications.api.DialogV2;
  const values = await DialogV2.wait({
    window: { title: defaults.label || L("Roll.TaskTitle", { name: actor?.name ?? "" }), icon: "fa-solid fa-dice" },
    classes: ["spacer", "spacer-dialog"],
    position: { width: 380 },
    content,
    buttons: [{ action: "roll", label: "SPACER.Roll.Roll", icon: "fa-solid fa-dice", default: true, callback: (_e, button) => formValues(button.form) }],
    render: (_e, dialog) => {
      const form = dialog.element.querySelector("form") ?? dialog.element;
      const update = () => {
        const v = formValues(form);
        const [s, sp] = String(v.skill || "").split("|");
        let dm = (v.characteristic ? actor?.system?.dm?.[v.characteristic] ?? 0 : 0) + (s ? skillRank(actor, s, sp) : 0) + (Number(v.dm) || 0) + (v.fatigue ? -2 : 0);
        const out = form.querySelector("[data-preview]");
        if (out) out.textContent = L("Roll.Preview", { dm: signed(dm), target: v.target, chance: chance2D(dm, Number(v.target) || 8, { absolute: setting("absoluteResults", true) }) });
      };
      form.addEventListener("change", update);
      form.addEventListener("input", update);
      update();
    },
    rejectClose: false
  });
  if (!values || values === "roll") return null;
  const [s, sp] = String(values.skill || "").split("|");
  const dm = (Number(values.dm) || 0) + (values.fatigue ? -2 : 0);
  const mods = [];
  if (values.dm) mods.push({ label: L("Roll.DM"), value: Number(values.dm) });
  if (values.fatigue) mods.push({ label: L("Roll.Fatigue"), value: -2 });
  return rollTask({ actor, characteristic: values.characteristic, skill: s || "", specialty: sp || "", dm, mods, target: Number(values.target) || TASK_TARGET, label: values.label || defaults.label || "" });
}
