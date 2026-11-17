/**
 * Pick the item a custom roll card shows beside the token.
 *
 * Only the item and weapon contexts count. A save or skill roll has the actor as its
 * main context, and showing that would put the actor's portrait where the item goes.
 *
 * @param {object} rollContext The roll's RollContext
 * @returns {?object} The item or weapon document, or null when the roll has neither
 */
export function chatCardItem(rollContext) {
    return rollContext.allContexts?.item?.entity ?? rollContext.allContexts?.weapon?.entity ?? null;
}
