/**
 * Worlds and subsectors (p.88-95): the generators and the world journal entries. Foundry glue
 * around rules/world.mjs and rules/subsector.mjs.
 */
import { generateStarSystem } from "./rules/world.mjs";
import * as subsectorRules from "./rules/subsector.mjs";
import { worldCard, subsectorCard } from "./cards/worlds.mjs";
import { worldPageHtml, subsectorPageHtml } from "./cards/world-pages.mjs";
import { WORLD_FOLDER, dice, ensureFolder, postToolsCard } from "./context.mjs";

/** One HTML text page for a journal entry. */
const textPage = (name, content) => ({ name, type: "text", text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML } });

/** The journal entry data of a generated world, with flags.spacer.world. */
const worldEntry = (w, folderId) => ({ name: w.name, folder: folderId, pages: [textPage(`${w.name} ${w.uwp}`, worldPageHtml(w))], flags: { spacer: { world: w } } });

/** Create a world journal entry in "Spacer: Worlds" (or a subfolder `folder`) with flags.spacer.world. */
export async function createWorldJournal(w, { folder = null } = {}) {
  const root = await ensureFolder(WORLD_FOLDER, "JournalEntry");
  const target = folder ? await ensureFolder(folder, "JournalEntry", root) : root;
  return JournalEntry.create(worldEntry(w, target.id));
}

/**
 * Generate a main world with its star system (p.88-95). Creates the journal entry unless
 * `create` is false and posts a card. Returns `{ world, journal }`.
 */
export async function generateWorld({ name = "", hex = "0101", density = "typical", sizeMode = "standard", popDM = 0, create = true, folder = null, chat = true } = {}) {
  const w = generateStarSystem(dice(), { name, hex, density, sizeMode, popDM });
  const journal = create ? await createWorldJournal(w, { folder }) : null;
  if (chat) await postToolsCard(worldCard(w, { uuid: journal?.uuid }), { kind: "world", data: journal ? null : w });
  return { world: w, journal };
}

/**
 * Generate a subsector (p.88, p.92): one journal entry per world in "Spacer: Worlds/<name>"
 * plus an overview entry with the hex map (flags.spacer.subsector). `primaryCapital` adds the
 * +2 population DM of the society's capital. Returns `{ subsector, folder, journals, overview }`.
 */
export async function generateSubsector({ name = "", density = "typical", sizeMode = "standard", primaryCapital = true, chat = true } = {}) {
  const s = subsectorRules.generateSubsector(dice(), { name, density, sizeMode, primaryCapital });
  const root = await ensureFolder(WORLD_FOLDER, "JournalEntry");
  const folder = await ensureFolder(s.name, "JournalEntry", root);
  const docs = await JournalEntry.createDocuments(s.worlds.map(w => worldEntry({ ...w, subsector: s.name }, folder.id)));
  const links = Object.fromEntries(docs.map(d => [d.name, d.uuid]));
  const summary = { ...s, worlds: s.worlds.map(w => ({ name: w.name, hex: w.hex, uwp: w.uwp, line: w.line, zone: w.zone, capital: !!w.capital })) };
  const overview = await JournalEntry.create({
    name: `${s.name} (overview)`, folder: folder.id, sort: -1,
    pages: [textPage("Subsector map", subsectorPageHtml(s, links))],
    flags: { spacer: { subsector: summary } }
  });
  if (chat) await postToolsCard(subsectorCard(s, { uuid: overview.uuid }), { kind: "subsector" });
  return { subsector: s, folder, journals: docs, overview };
}

/** Chat card buttons of the world cards (registered by register.mjs). */
export const worldChatActions = {
  "tools-create-world": async (event, button, message) => {
    const data = message.flags.spacer?.tools?.data;
    if (!data) return;
    const j = await createWorldJournal(data);
    j?.sheet?.render(true);
  },
  "tools-open": async (event, button) => {
    const doc = await fromUuid(button.dataset.uuid);
    doc?.sheet?.render(true);
  }
};
