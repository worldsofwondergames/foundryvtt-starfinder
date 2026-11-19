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

/**
 * The Plasma Rifle's cost per level. Tech Revolution prints "10 x tier", which
 * is far above every other ranged mech weapon, so the system charges what the
 * Flamethrower, the other high damage electricity and fire weapon, costs. */
export const PLASMA_RIFLE_MP_COST = 4.5;

/**
 * The cost an existing Plasma Rifle should have. Copies made from the old
 * compendium entry cost 10 per level.
 *
 * @param {{type: string, name: string, system?: {mpCost?: number}}} item
 * @returns {number|null} The new cost, or null when the item is not a Plasma
 *     Rifle with the old cost.
 */
export function plasmaRifleMpCost(item) {
    if (item?.type !== "mechWeapon" || baseName(item.name) !== "plasma rifle") return null;
    return Number(item.system?.mpCost) === 10 ? PLASMA_RIFLE_MP_COST : null;
}

/** The mech component types whose PP cost field is the component's own cost. */
const PP_COMPONENT_TYPES = new Set(["mechWeapon", "mechAuxiliary", "mechLowerLimb", "mechUpperLimb"]);

/** The actions five weapons were missing, as the compendium items have them. */
export const ADDED_WEAPON_ACTIONS = new Map([
    ["anti-materiel gun pod", { name: "Shrapnel Spitter", actionType: "move", description: "As a move action, converts to non-penetrating explosive mode for 1 round, gaining fiery and explode properties.", ppCost: 1 }],
    ["arc pulserifle", { name: "Arc Blast", actionType: "standard", description: "As a standard action, fire a cone attack with length equal to the weapon's range. Expends 4 SP to use this ability.", ppCost: 2 }],
    ["buzzblade", { name: "Cleave", actionType: "", description: "Make a melee attack against an adjacent foe; if you hit, you can make another attack against a different adjacent foe.", ppCost: 2 }],
    ["flame doshko", { name: "Cleave", actionType: "", description: "Make a melee attack against an adjacent foe; if you hit, you can make another attack against a different adjacent foe.", ppCost: 2 }],
    ["stinger tail", { name: "Inject Acid", actionType: "", description: "After a successful strike, release acidic mist that targets opponents, dealing low acid damage. A successful Reflex save reduces damage by half, while a failed save imposes a -2 penalty to sight-based Perception checks lasting 1 round.", ppCost: 2 }]
]);

/**
 * The changes an existing component needs so its PP cost field holds only what
 * the component itself costs. A cost that belongs to an action is spent by the
 * action's button, so a component with actions gets a PP cost of 0. The five
 * weapons that had no action for their ability get one first.
 *
 * @param {{type: string, name: string, system?: {ppCost?: number, actions?: Array}}} item
 * @returns {{ppCost?: number, actions?: Array}|null} The changed system fields, or null when the item needs none.
 */
export function componentPpFix(item) {
    if (!PP_COMPONENT_TYPES.has(item?.type)) return null;
    const fix = {};
    let actions = item.system?.actions ?? [];
    const added = item.type === "mechWeapon" ? ADDED_WEAPON_ACTIONS.get(baseName(item.name)) : null;
    if (added && !actions.some(action => action.name === added.name)) {
        actions = [...actions, added];
        fix.actions = actions;
    }
    if (actions.length > 0 && Number(item.system?.ppCost) > 0) fix.ppCost = 0;
    return Object.keys(fix).length > 0 ? fix : null;
}

/**
 * The PP a mech spends each time it attacks with a weapon.
 *
 * @param {{type: string, system?: {ppCost?: number}}} item
 * @returns {number} The cost, 0 for a weapon that costs nothing to fire or for any other item.
 */
export function attackPpCost(item) {
    if (item?.type !== "mechWeapon") return 0;
    return Math.max(0, Number(item.system?.ppCost) || 0);
}
