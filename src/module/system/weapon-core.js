import { ENERGY_TYPE_COUNT, hasEnergyTypes } from "../rules/weapon-core.js";

/**
 * The energy types a Weapon Core can hold.
 *
 * @returns {string[]} Keys of CONFIG.SFRPG.energyDamageTypes.
 */
export function allowedEnergyTypes() {
    return Object.keys(CONFIG.SFRPG.energyDamageTypes);
}

/**
 * Energy types as the sheet and cards show them, such as "cold, fire".
 *
 * @param {string[]} [types]
 * @returns {string}
 */
export function energyTypesLabel(types) {
    return (types ?? [])
        .map(type => game.i18n.localize(CONFIG.SFRPG.energyDamageTypes[type] ?? type).toLowerCase())
        .join(", ");
}

/**
 * Stop more boxes being ticked once two are, so the choice can't go past two.
 *
 * @param {HTMLElement} root The element holding the boxes.
 * @param {string} selector The boxes.
 */
export function limitEnergyTypeChecks(root, selector) {
    const boxes = [...root.querySelectorAll(selector)];
    const update = () => {
        const ticked = boxes.filter(box => box.checked).length;
        for (const box of boxes) box.disabled = !box.checked && ticked >= ENERGY_TYPE_COUNT;
    };
    for (const box of boxes) box.addEventListener("change", update);
    update();
}

/**
 * Ask for a Weapon Core's two energy types.
 *
 * @param {string} itemName The item's name, for the prompt.
 * @param {string[]} [current] Types already chosen, ticked to start with.
 * @returns {Promise<string[]|null>} The two types, or null when the dialog was
 *     closed or the choice was not two types.
 */
export async function promptEnergyTypes(itemName, current = []) {
    const boxes = Object.entries(CONFIG.SFRPG.energyDamageTypes).map(([type, label]) => `
        <label class="checkbox">
            <input type="checkbox" name="energyType" value="${type}" ${current.includes(type) ? "checked" : ""} />
            ${game.i18n.localize(label)}
        </label>`)
        .join("");

    const chosen = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.format("SFRPG.WeaponCore.Title", { name: itemName }) },
        content: `
            <p>${game.i18n.format("SFRPG.WeaponCore.Prompt", { name: itemName, count: ENERGY_TYPE_COUNT })}</p>
            <div class="form-group weapon-core-types">${boxes}</div>`,
        ok: {
            label: game.i18n.localize("SFRPG.WeaponCore.Choose"),
            callback: (event, button) => [...button.form.querySelectorAll('input[name="energyType"]:checked')].map(box => box.value)
        },
        render: (event, dialog) => limitEnergyTypeChecks(dialog.element, 'input[name="energyType"]'),
        rejectClose: false
    });

    if (!chosen) return null;
    if (!hasEnergyTypes(chosen, allowedEnergyTypes())) {
        ui.notifications.warn(game.i18n.format("SFRPG.WeaponCore.ChooseTwo", { count: ENERGY_TYPE_COUNT }));
        return null;
    }
    return chosen;
}

/**
 * A Weapon Core's energy types, asking for them when none are chosen yet and
 * storing the answer on the item.
 *
 * @param {Item} item The Weapon Core.
 * @returns {Promise<string[]|null>} The types, or null when none were chosen.
 */
export async function energyTypesFor(item) {
    if (hasEnergyTypes(item.system.energyTypes, allowedEnergyTypes())) return item.system.energyTypes;

    const chosen = await promptEnergyTypes(item.name);
    if (chosen) await item.update({ "system.energyTypes": chosen });
    return chosen;
}
