/**
 * The Hit Points a limb gives a mech: its base plus its advancement for each
 * tier. Tech Revolution lists limbs with a Hit Point Advancement; Tough Arms'
 * is +1, so it gives +1 Hit Point per tier.
 *
 * @param {{baseHp?: number, hpAdvancement?: number}} [system] The limb's data.
 * @param {number} tier The mech's tier.
 * @returns {number}
 */
export function limbHp(system, tier) {
    return (Number(system?.baseHp) || 0) + (Number(system?.hpAdvancement) || 0) * (Number(tier) || 0);
}

/**
 * Whether an item is Tough Arms whose Hit Points differ from the compendium's,
 * which are no base and +1 per tier. Every such copy is brought in line, so
 * the old flat +1 and any hand edit both go.
 *
 * @param {{type: string, name: string, system: object}} item
 * @returns {boolean}
 */
function isOldToughArms(item) {
    return item?.type === "mechUpperLimb"
        && /^tough arms\b/i.test(item.name ?? "")
        && !(item.system?.baseHp === 0 && item.system?.hpAdvancement === 1);
}

/**
 * The update that gives an existing copy of Tough Arms the compendium's +1 Hit
 * Point per tier in place of what it had. Used to migrate copies made before
 * the fix.
 *
 * @param {{type: string, name: string, system: object}} item
 * @returns {object} The update, empty when the item needs none.
 */
export function toughArmsUpdate(item) {
    if (!isOldToughArms(item)) return {};
    return { "system.baseHp": 0, "system.hpAdvancement": 1 };
}

/**
 * A mission pod's item template with the Tough Arms fix applied.
 *
 * @param {{type: string, name: string, system: object}} template
 * @returns {object|null} The new template, or null when it needs no change.
 */
export function toughArmsTemplate(template) {
    if (!isOldToughArms(template)) return null;
    return { ...template, system: { ...template.system, baseHp: 0, hpAdvancement: 1 } };
}

/**
 * The Hit Points a mech gains when its Tough Arms are migrated, so its current
 * Hit Points can rise by the same amount and any damage taken stays the same.
 *
 * @param {{type: string, name: string, system: object}} item
 * @param {number} tier The mech's tier.
 * @returns {number}
 */
export function toughArmsHpGain(item, tier) {
    if (!isOldToughArms(item)) return 0;
    return limbHp({ baseHp: 0, hpAdvancement: 1 }, tier) - limbHp(item.system, tier);
}
