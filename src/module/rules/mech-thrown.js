/**
 * The thrown range a mech weapon's special properties list, if any.
 *
 * Mech weapons keep their special properties as free text, such as
 * "analog, penetrating, reach, thrown (40 ft.)", so the range is read out of
 * the "thrown (...)" entry.
 *
 * @param {string|null|undefined} special The weapon's `system.special` text.
 * @returns {string|null} The range inside the parentheses, e.g. "40 ft.", or null if the weapon is not thrown.
 */
export function thrownRange(special) {
    if (typeof special !== "string") return null;
    const match = special.match(/(?:^|,)\s*thrown\s*\(([^)]+)\)/i);
    return match ? match[1].trim() : null;
}

/**
 * Whether a mech weapon offers a thrown attack beside its normal one.
 *
 * Only melee weapons get a second attack. A ranged weapon that must be thrown
 * already makes its normal attack as a thrown one.
 *
 * @param {{weaponType?: string, special?: string}} system The weapon's system data.
 * @returns {boolean} True for a melee weapon with the thrown property.
 */
export function canThrow(system) {
    return system?.weaponType === "melee" && thrownRange(system.special) !== null;
}
