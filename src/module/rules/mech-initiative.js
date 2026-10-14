/**
 * A mech's initiative modifier.
 *
 * Tech Revolution: "A mech's initiative modifier equals the lowest initiative
 * modifier among its operators (minimum +0). A mech's minimum initiative
 * modifier increases by 1 at tier 5 and every 5 tiers thereafter." The tier
 * sets a floor; it is not added on top.
 *
 * @param {number[]} operatorModifiers Each operator's initiative modifier.
 * @param {number} tier The mech's tier.
 * @returns {{total: number, operatorMod: number, tierMinimum: number, lowestIndex: number|null}}
 *     The modifier, the lowest operator's (at least 0), the tier's minimum, and
 *     which operator was lowest, or null with none assigned.
 */
export function mechInitiative(operatorModifiers, tier) {
    let lowestIndex = null;
    operatorModifiers.forEach((mod, index) => {
        if (lowestIndex === null || mod < operatorModifiers[lowestIndex]) lowestIndex = index;
    });

    const operatorMod = Math.max(lowestIndex === null ? 0 : operatorModifiers[lowestIndex], 0);
    const tierMinimum = Math.floor((Number(tier) || 0) / 5);

    return { total: Math.max(operatorMod, tierMinimum), operatorMod, tierMinimum, lowestIndex };
}
