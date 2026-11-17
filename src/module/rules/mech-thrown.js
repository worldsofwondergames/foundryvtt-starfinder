/**
 * The thrown range a mech weapon's special properties list, if any.
 *
 * Mech weapons keep their special properties as free text, such as
 * "analog, penetrating, reach, thrown (40 ft.)", so the range is read out of
 * the "thrown (...)" entry. A hand-entered weapon may say only "thrown" and
 * keep its range in its range field, which is used then.
 *
 * @param {string|null|undefined} special The weapon's `system.special` text.
 * @param {string|null|undefined} [range] The weapon's `system.range`, for a bare "thrown".
 * @returns {string|null} The range, e.g. "40 ft.", or null if the weapon is not thrown or has no range.
 */
export function thrownRange(special, range = null) {
    if (typeof special !== "string") return null;
    const match = special.match(/(?:^|,)\s*thrown\s*\(([^)]+)\)/i);
    if (match) return match[1].trim();

    const bare = /(?:^|,)\s*thrown\s*(?:,|$)/i.test(special);
    const fallback = typeof range === "string" ? range.trim() : "";
    return bare && fallback ? fallback : null;
}

/**
 * Whether a mech weapon offers a thrown attack beside its normal one.
 *
 * Only melee weapons get a second attack. A ranged weapon that must be thrown
 * already makes its normal attack as a thrown one.
 *
 * @param {{weaponType?: string, special?: string, range?: string}} system The weapon's system data.
 * @returns {boolean} True for a melee weapon with the thrown property.
 */
export function canThrow(system) {
    return system?.weaponType === "melee" && thrownRange(system.special, system.range) !== null;
}

/**
 * The thrown mech weapon range house rule, in feet, from its setting.
 *
 * @param {string|number|null|undefined} value The setting's value. Blank keeps each weapon's own range.
 * @returns {number|null} The range in feet, or null to keep each weapon's own.
 */
export function houseRuleThrownFeet(value) {
    const feet = Number.parseInt(String(value ?? "").trim(), 10);
    return Number.isFinite(feet) && feet > 0 ? feet : null;
}

/**
 * The range a thrown mech weapon, or an object thrown with Hurl, is thrown to.
 *
 * @param {string|null} ownRange The weapon's own thrown range, e.g. "20 ft.".
 * @param {number|null} houseFeet The house rule range in feet, or null for none.
 * @returns {string|null} e.g. "60 ft."
 */
export function thrownRangeInUse(ownRange, houseFeet) {
    return houseFeet ? `${houseFeet} ft.` : ownRange;
}

/**
 * The changes that make an existing Autospear throwable. Older copies list
 * "thrown" with no range, are marked ranged, and keep 40 ft. in their range
 * field, so they get no thrown attack. Archives of Nethys gives the Autospear
 * as melee with "reach, thrown (40 ft.)", and its Projectile Mode as the
 * ranged form.
 *
 * @param {{type: string, name: string, system: object}} item
 * @returns {object} The changed system fields, empty when the weapon needs none.
 */
export function autospearSystemUpdate(item) {
    if (item?.type !== "mechWeapon" || (item.name ?? "").trim().toLowerCase() !== "autospear") return {};
    const special = item.system?.special ?? "";
    if (/thrown\s*\(/i.test(special)) return {};

    return {
        special: special.replace(/(^|,)(\s*)thrown(\s*)(?=,|$)/i, "$1$2thrown (40 ft.)$3"),
        range: "",
        weaponType: "melee"
    };
}
