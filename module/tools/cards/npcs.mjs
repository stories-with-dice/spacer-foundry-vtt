/**
 * Chat cards of the NPC procedures (p.56-59): notable NPC, random NPC, information, demeanour.
 * Pure. Called by module/tools/npcs.mjs and the encounter cards.
 */
import { CHARACTERISTICS, toHex } from "../../config.mjs";
import { row, reactionText, signed, code2, CREATE_RANDOM_NPC } from "./common.mjs";

/** Card data of a `generateNpc` result (rules/npc.mjs). */
export function npcCard(r) {
  return {
    title: "NPC",
    subtitle: `${r.type} · ${r.quality}`,
    icon: "fa-solid fa-user",
    sections: [{
      rows: [
        row("NPC table (p.56)", `${code2(r.code)} ${r.type}`, r.dm ? `DM ${signed(r.dm)} to tens` : ""),
        row("Demeanour", reactionText(r.demeanour)),
        row("UPP", CHARACTERISTICS.map(k => toHex(r.characteristics[k])).join("")),
        row("Weapon", r.weapon)
      ]
    }],
    buttons: [{ action: "tools-create-npc", label: "Create NPC actor", icon: "fa-solid fa-user-plus" }]
  };
}

/** Card data of a `rollRandomNpc` result (rules/npc.mjs). */
export function randomNpcCard(r, { title = "Random NPC" } = {}) {
  return {
    title,
    subtitle: `${r.count} x ${r.who}`,
    icon: "fa-solid fa-users",
    sections: [{ heading: "Random NPC table (p.59)", rows: randomNpcRows(r) }],
    buttons: [CREATE_RANDOM_NPC]
  };
}

/** Rows of a random NPC (p.59). Also used by the starport and settlement encounter cards. */
export function randomNpcRows(r) {
  return [
    row("Who", `${r.who}${r.vehicle ? " (vehicle nearby)" : ""} (${r.code})`),
    row("Number", `${r.count} (${r.number})`),
    row("Avoid", `${r.avoid}+`),
    row("Weapon", r.weapon || "None"),
    row("Attack", signed(r.attack)),
    row("Hits (STR/DEX/END)", r.hits),
    row("Armour", r.armour || "None"),
    row("Reaction", reactionText(r.reaction))
  ];
}

/** Card data of a `rollInformation` result (rules/npc.mjs). */
export function informationCard(r) {
  return {
    title: "Information & rumours",
    subtitle: `${r.count} piece${r.count === 1 ? "" : "s"} of information (p.57)`,
    icon: "fa-solid fa-comments",
    sections: [
      { rows: [row("NPC reaction", reactionText(r.reaction))] },
      ...r.pieces.map(p => ({ heading: `${p.type} (1D ${p.roll})`, rows: [row("Detail", p.detail)], text: p.note }))
    ]
  };
}

/** Card data of a `rollDemeanour` result (rules/npc.mjs). */
export function demeanourCard(r) {
  return { title: "NPC demeanour", subtitle: "p.56", icon: "fa-solid fa-face-meh", headline: reactionText(r), sections: [] };
}
