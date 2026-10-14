/**
 * The least a party must spend on a mech of a tier. Tech Revolution, Table 4-2
 * (https://aonsrd.com/Rules.aspx?ID=1985): 30 MP at tier 1, 15 more for each
 * tier after. This is a minimum, not a cap; the party's pool sets how much it
 * can spend.
 *
 * @param {number} tier The mech's tier.
 * @returns {number}
 */
export function mechPointMinimum(tier) {
    return ((Number(tier) || 0) + 1) * 15;
}

/**
 * The component types whose Mech Point cost an old copy is brought in line
 * with. Each one's cost is checked on Archives of Nethys: most auxiliary
 * systems cost nothing (https://aonsrd.com/Mech_Aux.aspx), a power core costs
 * its mk times the tier (https://aonsrd.com/Mech_PowerCores.aspx), and each
 * upgrade has a cost per tier (https://aonsrd.com/Mech_Upgrades.aspx).
 */
export const MP_SYNCED_TYPES = Object.freeze(["mechAuxiliary", "mechPowerCore", "mechUpgrade"]);

/**
 * A component's name without what a copy adds in parentheses, such as the
 * energy types in "Weapon Core (Cold, Fire)" or the "(Scrapper)" a mission pod
 * gives its core.
 *
 * @param {string} name
 * @returns {string}
 */
function baseName(name) {
    const withoutParentheses = (name ?? "").replace(/\s*\([^)]*\)\s*$/, "");
    return withoutParentheses.trim().toLowerCase();
}

/**
 * The compendium's Mech Point costs, for looking up the cost an old copy should
 * have.
 *
 * @param {{uuid: string, name: string, type: string, system?: {mpCost?: number}}[]} entries
 *     The mech components compendium's index.
 *     Only the types in MP_SYNCED_TYPES are kept, so no other item is changed.
 * @returns {{byUuid: Map<string, number>, byName: Map<string, number>}}
 */
export function compendiumMpCosts(entries) {
    const byUuid = new Map();
    const byName = new Map();
    for (const entry of entries) {
        if (!MP_SYNCED_TYPES.includes(entry.type)) continue;
        const mpCost = Number(entry.system?.mpCost) || 0;
        byUuid.set(entry.uuid, mpCost);
        byName.set(`${entry.type}:${baseName(entry.name)}`, mpCost);
    }
    return { byUuid, byName };
}

/**
 * The Mech Point cost the compendium gives an item or a mission pod's item
 * template, found by the compendium it came from or else by its name.
 *
 * @param {{type: string, name: string, system?: {mpCost?: number}, _stats?: {compendiumSource?: string|null}}} item
 * @param {ReturnType<typeof compendiumMpCosts>} costs
 * @returns {number|null} The cost, or null when the item is not one to change
 *     or already has it.
 */
export function correctedMpCost(item, costs) {
    const mpCost = costs.byUuid.get(item._stats?.compendiumSource) ?? costs.byName.get(`${item.type}:${baseName(item.name)}`);
    if (mpCost === undefined || mpCost === (Number(item.system?.mpCost) || 0)) return null;
    return mpCost;
}
