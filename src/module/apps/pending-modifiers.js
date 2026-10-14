/**
 * Bonuses waiting to be spent on a roll, such as a mech's Aim, are shown on
 * the roll dialog as labels with an X rather than in the list of modifiers to
 * tick. Each is a modifier marked `pending`, enabled to start with; the X turns
 * it off for this roll only.
 */

/**
 * The modifier data for a bonus armed for the next roll.
 *
 * @param {{source: string, value: number}} armed The armed bonus, such as the `attackBonusOverride` flag.
 * @returns {object} Data for an SFRPGModifier.
 */
export function pendingModifierData(armed) {
    const value = Number(armed.value) || 0;
    return {
        name: armed.source,
        modifier: value < 0 ? String(value) : `+${value}`,
        type: "untyped",
        enabled: true,
        modifierType: "formula",
        subtab: "temporary",
        max: value
    };
}

/**
 * Split a roll's modifiers into the pending ones still in the roll, shown as
 * labels, and the rest, shown in the list to tick.
 *
 * @param {object[]} modifiers The roll's available modifiers.
 * @returns {{pending: {index: number, modifier: object}[], hasListed: boolean}} The
 *     pending labels with each one's place in `modifiers`, and whether the list
 *     has anything in it.
 */
export function splitPendingModifiers(modifiers = []) {
    return {
        pending: modifiers
            .map((modifier, index) => ({ index, modifier }))
            .filter(({ modifier }) => modifier.pending && modifier.enabled),
        hasListed: modifiers.some(modifier => !modifier.pending)
    };
}
