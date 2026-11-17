/**
 * Decide whether the current user may use a button on an item chat card.
 *
 * Save and skill buttons roll for the clicking user's own character, so anyone may use them.
 * Every other button rolls for the card's actor, so it needs the GM, the person who posted
 * the card, or an owner of that actor.
 *
 * @param {object} args
 * @param {string} args.action     The button's data-action
 * @param {boolean} args.isGM      Whether the user is a GM
 * @param {boolean} args.isAuthor  Whether the user posted the card
 * @param {boolean} args.ownsActor Whether the user owns the card's actor
 * @returns {?string} null when allowed, otherwise the SFRPG.ChatCard.ItemAction key that explains why not
 */
export function chatCardBlockReason({ action, isGM, isAuthor, ownsActor }) {
    if (["save", "skill"].includes(action)) return null;
    if (isGM || isAuthor || ownsActor) return null;
    return "NotAllowed";
}
