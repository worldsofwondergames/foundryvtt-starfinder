/**
 * Weapon Core's energy types. Its Selection reads "When installed, choose two
 * energy types from: acid, cold, electricity, fire, or sonic", and Energize
 * Weapon charges a melee weapon with one of them.
 */

/** How many energy types a Weapon Core holds. */
export const ENERGY_TYPE_COUNT = 2;

/**
 * Whether a choice of energy types is complete: two different types, each one
 * of the allowed energy types.
 *
 * @param {string[]|undefined} types
 * @param {string[]} allowed Keys of CONFIG.SFRPG.energyDamageTypes.
 * @returns {boolean}
 */
export function hasEnergyTypes(types, allowed) {
    if (!Array.isArray(types) || types.length !== ENERGY_TYPE_COUNT) return false;
    if (new Set(types).size !== types.length) return false;
    return types.every(type => allowed.includes(type));
}

/**
 * The energy types written into an item's name, such as the Kelina mission
 * pod's "Weapon Core (Cold, Fire)".
 *
 * @param {string} name
 * @param {string[]} allowed
 * @returns {string[]} The two types, or an empty list when the name gives none.
 */
export function energyTypesFromName(name, allowed) {
    const inParentheses = /\(([^)]*)\)/.exec(name ?? "");
    if (!inParentheses) return [];

    const types = inParentheses[1].split(",").map(part => part.trim().toLowerCase());
    return hasEnergyTypes(types, allowed) ? types : [];
}

/**
 * Whether the sheet should add the energy types after an item's name. A name
 * such as "Weapon Core (Cold, Fire)" already gives them, so they aren't
 * repeated unless the types chosen differ from it.
 *
 * @param {string} name
 * @param {string[]} types The types chosen.
 * @param {string[]} allowed
 * @returns {boolean}
 */
export function showsEnergyTypeLabel(name, types, allowed) {
    if (!types?.length) return false;
    const named = energyTypesFromName(name, allowed);
    return !(named.length === types.length && named.every(type => types.includes(type)));
}

/**
 * Whether an item is a Weapon Core.
 *
 * @param {{type: string, name: string}} item
 * @returns {boolean}
 */
function isWeaponCore(item) {
    return item?.type === "mechAuxiliary" && /^weapon core\b/i.test(item.name ?? "");
}

/**
 * The update that marks an existing Weapon Core as one that holds energy types,
 * filling in the types its name gives when it has none chosen. Used to migrate
 * copies made before the field existed.
 *
 * @param {{type: string, name: string, system: object}} item
 * @param {string[]} allowed
 * @returns {object} The update, empty when the item needs none.
 */
export function weaponCoreItemUpdate(item, allowed) {
    if (!isWeaponCore(item) || item.system?.choosesEnergyTypes) return {};

    const update = { "system.choosesEnergyTypes": true };
    if (!hasEnergyTypes(item.system?.energyTypes, allowed)) {
        const fromName = energyTypesFromName(item.name, allowed);
        if (fromName.length) update["system.energyTypes"] = fromName;
    }
    return update;
}

/**
 * A mission pod's item template with the Weapon Core update applied, so the
 * Weapon Core the pod creates comes with its types.
 *
 * @param {{type: string, name: string, system: object}} template
 * @param {string[]} allowed
 * @returns {object|null} The new template, or null when it needs no change.
 */
export function weaponCoreTemplate(template, allowed) {
    const update = weaponCoreItemUpdate(template, allowed);
    if (!Object.keys(update).length) return null;

    const system = { ...template.system, choosesEnergyTypes: true };
    if (update["system.energyTypes"]) system.energyTypes = update["system.energyTypes"];
    return { ...template, system };
}

/**
 * Whether a component action uses one of the energy types, as Energize Weapon
 * does. Read from the action's text, which names them.
 *
 * @param {{description?: string}} action
 * @returns {boolean}
 */
export function actionUsesEnergyType(action) {
    return /energy type/i.test(action?.description ?? "");
}
