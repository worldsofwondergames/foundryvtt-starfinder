/**
 * Auxiliary systems that spend PP on their own rather than from a button: the
 * Holodouble Projector each turn its double is up, and the Emergency Defense
 * Sphere when damage drops the mech to ¼ of its Hit Points. Nothing here
 * touches Foundry.
 */

function baseName(name) {
    return (name ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim()
        .toLowerCase();
}

/** What each system costs at the start of each of the mech's turns while it is on. */
const UPKEEP_COSTS = new Map([["holodouble projector", 1]]);

/** What the Emergency Defense Sphere costs when it forms. */
export const SPHERE_COST = 3;

/**
 * The PP a system costs at the start of each of the mech's turns while it is on.
 *
 * @param {{type: string, name: string}} item
 * @returns {number|null} The cost, or null for a system with no upkeep.
 */
export function upkeepCost(item) {
    if (item?.type !== "mechAuxiliary") return null;
    return UPKEEP_COSTS.get(baseName(item.name)) ?? null;
}

/**
 * Whether an item is an Emergency Defense Sphere.
 *
 * @param {{type: string, name: string}} item
 * @returns {boolean}
 */
export function isEmergencySphere(item) {
    return item?.type === "mechAuxiliary" && baseName(item.name) === "emergency defense sphere";
}

/**
 * Whether damage has just taken the mech from above ¼ of its Hit Points to ¼ or fewer.
 *
 * @param {object} options
 * @param {number} options.value The Hit Points after the change.
 * @param {number} options.previousValue The Hit Points before it.
 * @param {number} options.max The mech's maximum Hit Points.
 * @returns {boolean}
 */
export function sphereTriggered({ value = 0, previousValue = 0, max = 0 } = {}) {
    if (max <= 0) return false;
    const quarter = max / 4;
    return previousValue > quarter && value <= quarter;
}

/**
 * The PP left after paying a cost, or null when the mech can't pay it.
 *
 * @param {number} pp The mech's PP.
 * @param {number} cost The cost.
 * @returns {number|null}
 */
export function afterPaying(pp, cost) {
    const value = Number(pp) || 0;
    return value >= cost ? value - cost : null;
}

/** The Holodouble Projector's action, as the compendium item has it. */
export const PROJECT_DOUBLE = {
    name: "Project Double",
    actionType: "standard",
    description: "The mech projects one holographic double of itself, as mirror image with one image. The double costs 1 PP at the start of each of the mech's turns, and it ends when the mech can't pay.",
    ppCost: 0
};

/**
 * The system fields an older Holodouble Projector or Emergency Defense Sphere
 * needs to match the compendium, which is the Project Double action or a PP cost of 3.
 *
 * @param {{type: string, name: string, system?: object}} item
 * @returns {object|null} The changed system fields, or null when the item needs none.
 */
export function upkeepDataFix(item) {
    if (isEmergencySphere(item)) {
        return Number(item.system?.ppCost) === 0 ? { ppCost: SPHERE_COST } : null;
    }
    if (upkeepCost(item) === null) return null;
    const actions = item.system?.actions ?? [];
    return actions.some(action => action.name === PROJECT_DOUBLE.name) ? null : { actions: [...actions, PROJECT_DOUBLE] };
}
