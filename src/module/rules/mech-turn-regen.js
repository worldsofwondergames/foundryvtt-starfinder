/**
 * The Power Points a mech has once its turn ends.
 *
 * Values are returned only when they change. Null means "leave it alone", which
 * keeps the caller from writing an update that changes nothing and reporting a
 * regeneration that did not happen.
 *
 * @param {{value: number, max: number, regen: number}} [pp] The mech's Power Points.
 * @param {number} [rate] The fraction of its regeneration the power core allows.
 * @returns {number|null} The new value, or null when it does not change.
 */
export function regeneratedPowerPoints(pp = {}, rate = 1) {
    return regenerated(pp, pp.regen, rate);
}

/**
 * The Shield Points a mech has once its turn starts. A mech's shields recover
 * its tier each turn.
 *
 * @param {{value: number, max: number}} [sp] The mech's Shield Points.
 * @param {number} [tier] The mech's tier.
 * @param {number} [rate] The fraction of its regeneration the power core allows.
 * @returns {number|null} The new value, or null when it does not change.
 */
export function regeneratedShieldPoints(sp = {}, tier = 0, rate = 1) {
    return regenerated(sp, tier, rate);
}

/**
 * Whether a mech is due a regeneration at this change of turn.
 *
 * A mech regenerates each pool once per round, so a round it has already
 * regenerated that pool in is done with. That matters because the GM can walk
 * the initiative order in either direction. Stepping back and forward again
 * passes the same change of turn a second time, and the mech must not collect
 * twice for it.
 *
 * @param {object} options
 * @param {number} [options.direction] Which way the combat moved. Only a forward step starts or ends a turn.
 * @param {boolean} [options.isNewTurn] Whether the update changed whose turn it is.
 * @param {number} [options.round] The round the turn belongs to.
 * @param {number|null} [options.lastRegenRound] The round this combatant last regenerated the pool in.
 * @returns {boolean} True when the regeneration should be applied.
 */
export function isRegenDue({ direction = 0, isNewTurn = false, round = 0, lastRegenRound = null } = {}) {
    if (!isNewTurn) return false;
    if (direction <= 0) return false;
    if (lastRegenRound === round) return false;

    return true;
}

/**
 * A pool after one turn's regeneration. A damaged power core cuts the amount
 * regenerated, rounded down, before the pool's maximum caps it.
 *
 * @param {{value: number, max: number}} pool The pool to regenerate.
 * @param {number} regen What the pool regains each turn at full rate.
 * @param {number} rate The fraction of that the power core allows.
 * @returns {number|null} The new value, or null when it does not change.
 */
function regenerated(pool, regen, rate) {
    const amount = Math.floor((Number(regen) || 0) * rate);
    if (amount <= 0) return null;
    if (pool.value >= pool.max) return null;

    return Math.min(pool.value + amount, pool.max);
}
