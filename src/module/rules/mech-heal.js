/**
 * Mech abilities that heal Hit Points, such as Nanite Swarm Repair's
 * Reconstruction and Builder Swarm, which heal "an amount of Hit Points equal
 * to 1d6 x the mech's tier". Nothing here touches Foundry. The caller rolls
 * the formula and brings the total back.
 */

/** In-world seconds before a repaired mech can benefit from the ability again. */
export const REPAIR_COOLDOWN_SECONDS = 24 * 60 * 60;

/** Dice, optionally multiplied by the mech's tier, e.g. "1d6 * @tier". */
const HEAL_FORMULA = /^\d{1,2}d\d{1,3}(?:\s*\*\s*@tier)?$/;

/** "self" heals the mech using the action, and "target" the mech the user targets. */
const HEAL_TARGETS = ["self", "target"];

/**
 * The heal a mech action declares, if any.
 *
 * @param {{healFormula?: string, healTarget?: string, healRange?: number|null}|null|undefined} action
 * @returns {{formula: string, target: string, range: number|null}|null}
 */
export function actionHeal(action) {
    const formula = action?.healFormula?.trim();
    if (!formula || !HEAL_FORMULA.test(formula)) return null;

    const target = HEAL_TARGETS.includes(action.healTarget) ? action.healTarget : "self";
    const range = Number(action.healRange) > 0 ? Number(action.healRange) : null;

    return { formula, target, range };
}

/**
 * The formula a mech of this tier rolls.
 *
 * @param {string} formula The declared formula, e.g. "1d6 * @tier".
 * @param {number} tier The mech's tier.
 * @returns {string} e.g. "1d6 * 3"
 */
export function healFormula(formula, tier) {
    const tiers = Math.max(Number(tier) || 0, 0);
    return formula.replace(/@tier/g, String(tiers));
}

/**
 * The dice in a formula, which is the text the card's dice link was built from.
 *
 * @param {string} formula e.g. "1d6 * 3"
 * @returns {string|null} e.g. "1d6"
 */
export function healDice(formula) {
    return formula?.match(/\d+d\d+/)?.[0] ?? null;
}

/**
 * The Hit Points a mech has after it is healed. Healing stops at the maximum,
 * and the amount reported is what the mech gained.
 *
 * @param {{value: number, max: number}} hp The mech's Hit Points.
 * @param {number} rolled The total rolled.
 * @returns {{value: number, gained: number}}
 */
export function healedHitPoints(hp = {}, rolled = 0) {
    const current = Number(hp.value) || 0;
    const max = Number(hp.max) || 0;
    const total = Math.max(Number(rolled) || 0, 0);

    if (current >= max) return { value: current, gained: 0 };

    const value = Math.min(current + total, max);
    return { value, gained: value - current };
}

/**
 * How long until a repaired mech can benefit from the ability again.
 *
 * A repair recorded later than the current world time means the GM wound the
 * clock back, and the mech is treated as free to be repaired.
 *
 * @param {number|null|undefined} repairedAt World time of the last repair, in seconds.
 * @param {number} now The current world time, in seconds.
 * @returns {number} Seconds left, or 0 when the mech can be repaired.
 */
export function repairCooldownRemaining(repairedAt, now) {
    if (repairedAt === null || repairedAt === undefined) return 0;
    const at = Number(repairedAt);
    const time = Number(now) || 0;
    if (!Number.isFinite(at) || at > time) return 0;
    return Math.max(at + REPAIR_COOLDOWN_SECONDS - time, 0);
}

/** The heal each Nanite Swarm Repair action declares, by action name. */
const NANITE_SWARM_HEALS = {
    "Reconstruction": { healFormula: "1d6 * @tier", healTarget: "self", healRange: null },
    "Builder Swarm": { healFormula: "1d6 * @tier", healTarget: "target", healRange: 100 }
};

/**
 * Whether an item is a copy of Nanite Swarm Repair.
 *
 * @param {{type: string, name: string}} item
 * @returns {boolean}
 */
function isNaniteSwarmRepair(item) {
    return item?.type === "mechAuxiliary" && (item.name ?? "").toLowerCase().startsWith("nanite swarm repair");
}

/**
 * The update that gives an existing copy of Nanite Swarm Repair the
 * compendium's heals. Copies made before the heal fields existed have none.
 *
 * @param {{type: string, name: string, system: object}} item
 * @returns {object} The update, empty when the item needs none.
 */
export function naniteSwarmUpdate(item) {
    const actions = item?.system?.actions;
    if (!isNaniteSwarmRepair(item) || !Array.isArray(actions)) return {};

    let changed = false;
    const updated = actions.map(action => {
        const heal = NANITE_SWARM_HEALS[action?.name];
        if (!heal || Object.keys(heal).every(key => action[key] === heal[key])) return action;
        changed = true;
        return { ...action, ...heal };
    });

    return changed ? { "system.actions": updated } : {};
}
