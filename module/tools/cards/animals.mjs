/**
 * Chat card and actor description of an alien animal (p.110-113). Pure. Called by
 * module/tools/animals.mjs.
 */
import { DESCRIPTIONS } from "../rules/animals.mjs";
import { row, esc } from "./common.mjs";

/** Card data of a `generateAnimal` result (rules/animals.mjs). */
export function animalCard(a) {
  return {
    title: "Alien animal",
    subtitle: `${a.sizeLabel} ${a.behaviour} · ${a.terrainLabel}`,
    icon: "fa-solid fa-paw",
    headline: a.name,
    sections: [
      { rows: [
        row("Size (to hit)", `${a.sizeLabel} (${a.difficulty}+)`, a.swarm ? "swarm: 8+" : ""),
        row("Hits", a.hits, "pinned at 1/2, unconscious at 3/4"),
        row("Damage", `${a.damage} (flat ${a.flat})`),
        row("Behaviour", `${a.behaviour}: ${a.characteristic}`),
        row("Reaction (2D)", reactionRule(a.characteristicRow)),
        row("Number appearing", `${a.count} (${a.appearing})`),
        ...(a.armour ? [row("Armour", a.armour)] : []),
        ...(a.psi ? [row("PSI", a.psi)] : []),
        row("Earth example", a.example)
      ] },
      { heading: "Traits (p.113)", list: a.traitText },
      { text: DESCRIPTIONS[a.characteristic] ?? "" }
    ],
    buttons: [{ action: "tools-create-creature", label: "Create creature actor", icon: "fa-solid fa-paw" }]
  };
}

/** The flee / ignore / fight rule of a behaviour row (p.111) as text. */
export function reactionRule(ch) {
  const flee = ch.flee !== null ? `flee ${ch.flee}-` : ch.fleeText;
  const fight = ch.fight !== null ? `fight ${ch.fight}+` : ch.fightText;
  return `${flee}; ignore ${ch.ignore}; ${fight}`;
}

/** Description HTML of a creature actor made from a `generateAnimal` result. */
export function creatureDescription(a) {
  return `<p><strong>${esc(a.behaviour)}: ${esc(a.characteristic)}.</strong> ${esc(DESCRIPTIONS[a.characteristic] ?? "")}</p>
<p>Reaction (2D): ${esc(reactionRule(a.characteristicRow))}</p>
<ul>${a.traitText.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
<p>Earth example: ${esc(a.example)}. Hunting yields ${a.hits} rations (p.106).</p>`;
}
