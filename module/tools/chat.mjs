/** Chat card rendering for the tools area. */
export const CARD_TEMPLATE = "systems/spacer/templates/tools/card.hbs";

/**
 * Render a card (data for templates/tools/card.hbs) and post it to chat.
 * `kind` and `data` are stored in flags.spacer.tools so card buttons can use them.
 */
export async function postCard(card, { kind = "", data = null, actor = null, whisper = null } = {}) {
  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, card);
  const msg = {
    content,
    speaker: ChatMessage.getSpeaker(actor ? { actor } : {}),
    flags: { spacer: { tools: { kind, data } } }
  };
  if (whisper) msg.whisper = whisper;
  return ChatMessage.create(msg);
}
