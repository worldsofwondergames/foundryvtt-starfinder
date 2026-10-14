/**
 * The combat event data an update carried, with its combat and combatants as
 * documents again.
 *
 * The event data travels with the update in its options, and a client that did
 * not make the update receives it as plain data. Each combatant arrives as its
 * source object, with no actor or flags to read, so this looks it up again in the
 * combat that was updated.
 *
 * @param {object} eventData The event data from the update's options.
 * @param {Combat} combat The combat that was updated.
 * @returns {object} The same event data, with combat, oldCombatant and newCombatant as documents.
 */
export function resolveEventData(eventData, combat) {
    const combatant = data => (data ? combat.combatants.get(data._id ?? data.id) ?? null : null);

    return {
        ...eventData,
        combat,
        oldCombatant: combatant(eventData.oldCombatant),
        newCombatant: combatant(eventData.newCombatant)
    };
}
