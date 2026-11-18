/**
 * Rules for buying mech upgrades and power core templates. Nothing here touches
 * Foundry.
 *
 * Tech Revolution (https://aonsrd.com/Rules.aspx?ID=2000): "Each additional time
 * the same upgrade is purchased for the mech, increase the upgrade's cost per
 * tier by 1; this increase is cumulative." Superior Computer is the exception,
 * so an upgrade stores how much each repeat adds (repeatCostStep, usually 1).
 *
 * A power core template (https://aonsrd.com/Mech_PowerCores.aspx) is stored as
 * an upgrade with coreTemplate set. It adjusts the core's rate, initial, and
 * maximum PP, a mech can have one, and it doesn't count as an upgrade.
 */

function baseName(name) {
    return (name ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim()
        .toLowerCase();
}

const isUpgrade = item => item.type === "mechUpgrade" && !item.system?.coreTemplate;
const isCoreTemplate = item => item.type === "mechUpgrade" && Boolean(item.system?.coreTemplate);

/**
 * The cost per tier of each upgrade, raised for each earlier copy of the same
 * upgrade.
 *
 * @param {Iterable<{type: string, name: string, system: object}>} items The mech's items, in order.
 * @returns {Map<object, number>} The cost per tier of every upgrade and core template.
 */
export function upgradeCostsPerTier(items) {
    const seen = new Map();
    const costs = new Map();
    for (const item of items) {
        if (item.type !== "mechUpgrade") continue;
        const key = baseName(item.name);
        const earlier = seen.get(key) ?? 0;
        seen.set(key, earlier + 1);
        const step = Number(item.system?.repeatCostStep ?? 1) || 0;
        costs.set(item, (Number(item.system?.mpCost) || 0) + earlier * step);
    }
    return costs;
}

/**
 * Why a new upgrade can't be added, if it can't: a second copy of an upgrade
 * that can be bought once, or a second core template.
 *
 * @param {Iterable<{type: string, name: string, system: object}>} items The mech's items.
 * @param {{type: string, name: string, system: object}} newItem
 * @returns {"notRepeatable"|"oneCoreTemplate"|null}
 */
export function upgradeRefusal(items, newItem) {
    if (newItem?.type !== "mechUpgrade") return null;
    const existing = [...items];
    if (isCoreTemplate(newItem)) {
        return existing.some(isCoreTemplate) ? "oneCoreTemplate" : null;
    }
    if (newItem.system?.repeatable === false && existing.some(item => isUpgrade(item) && baseName(item.name) === baseName(newItem.name))) {
        return "notRepeatable";
    }
    return null;
}

/**
 * The change that stops an existing Superior Computer from costing more each
 * time it is bought again. Copies made before repeatCostStep existed get the
 * default of 1.
 *
 * @param {{type: string, name: string, system?: object}} item
 * @returns {object} The changed system fields, empty when the item needs none.
 */
export function superiorComputerUpdate(item) {
    if (item?.type !== "mechUpgrade" || baseName(item.name) !== "superior computer") return {};
    return item.system?.repeatCostStep === 0 ? {} : { repeatCostStep: 0 };
}

/**
 * The power core's PP after its template.
 *
 * @param {{initial: number, max: number, regen: number}} core The core's own values.
 * @param {Iterable<{type: string, system: object}>} items The mech's items.
 * @returns {{initial: number, max: number, regen: number}}
 */
export function templatedPowerPoints(core, items) {
    const template = [...items].find(isCoreTemplate);
    if (!template) return { ...core };
    const sys = template.system;
    return {
        initial: Math.max(0, core.initial + (Number(sys.ppInitialBonus) || 0)),
        max: Math.max(0, core.max + (Number(sys.ppMaxBonus) || 0)),
        regen: Math.max(0, core.regen + (Number(sys.ppRegenBonus) || 0))
    };
}
