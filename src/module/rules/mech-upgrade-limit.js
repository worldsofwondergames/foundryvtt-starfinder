/**
 * The upgrade limit house rule. A mech can have as many upgrades as half its
 * tier, rounded down. Nothing here touches Foundry.
 */

/**
 * The most upgrades a mech of this tier can have under the house rule.
 *
 * @param {number} tier The mech's tier.
 * @returns {number}
 */
export function maxMechUpgrades(tier) {
    return Math.floor(Math.max(Number(tier) || 0, 0) / 2);
}

/**
 * The upgrades that count against the limit. Upgrades an active mission pod
 * adds come and go with the pod, so they don't count, and a power core
 * template isn't an upgrade.
 *
 * @param {Iterable<{type: string, flags?: object}>} items The mech's items.
 * @returns {number}
 */
export function countedMechUpgrades(items) {
    return [...items].filter(item => item.type === "mechUpgrade" && !item.system?.coreTemplate && !item.flags?.sfrpg?.fromMissionPod).length;
}

/**
 * Whether one more upgrade would break the house rule.
 *
 * @param {object} args
 * @param {boolean} args.enabled Whether the house rule is on.
 * @param {number} args.tier The mech's tier.
 * @param {number} args.current The upgrades that already count.
 * @returns {{max: number}|null} The limit when another upgrade is refused, otherwise null.
 */
export function upgradeLimitRefusal({ enabled, tier, current }) {
    if (!enabled) return null;
    const max = maxMechUpgrades(tier);
    return current >= max ? { max } : null;
}
