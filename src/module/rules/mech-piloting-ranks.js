/**
 * Autotarget's Accurate Strikes: "For 1 round, the mech treats all of its
 * operators as though they each had a number of Piloting ranks equal to their
 * respective levels for the purpose of calculating the mech's attack bonuses."
 * Nothing here touches Foundry.
 */

/** The operator's part of a mech's attack bonus. */
export const OPERATOR_ATTACK_PART = "max(@operator.attributes.baseAttackBonus.value, @operator.skills.pil.ranks)";

/**
 * The operator's part while Accurate Strikes is active. An operator's Piloting
 * ranks can't exceed their level, so treating the ranks as the level means
 * using the level.
 */
export const OPERATOR_ATTACK_PART_AT_LEVEL = "max(@operator.attributes.baseAttackBonus.value, @operator.details.level.value)";

/**
 * Where in a combat Accurate Strikes was used.
 *
 * @param {{id: string, started: boolean, round: number, turn: number}|null} combat The combat the mech is in.
 * @returns {{combatId: string, round: number, turn: number}|null} Null outside a started combat.
 */
export function pilotingRanksTurn(combat) {
    if (!combat?.started) return null;
    return { combatId: combat.id, round: combat.round, turn: combat.turn };
}

/**
 * Whether Accurate Strikes still applies.
 *
 * Used in combat, it lasts 1 round. It applies through the rest of the round it
 * was used in, and in the next round up to the turn it was used on. Used
 * outside combat, it lasts until an attack spends it.
 *
 * @param {{turn?: {combatId: string, round: number, turn: number}|null}|null} armed The pilotingRanksOverride flag.
 * @param {{id: string, started: boolean, round: number, turn: number}|null} combat The combat named by the flag, if it still exists.
 * @returns {boolean}
 */
export function pilotingRanksActive(armed, combat) {
    if (!armed) return false;
    if (!armed.turn) return true;
    if (!combat?.started || combat.id !== armed.turn.combatId) return false;

    if (combat.round === armed.turn.round) return combat.turn >= armed.turn.turn;
    return combat.round === armed.turn.round + 1 && combat.turn < armed.turn.turn;
}

/**
 * Whether an item is a copy of Autotarget.
 *
 * @param {{type: string, name: string}} item
 * @returns {boolean}
 */
function isAutotarget(item) {
    return item?.type === "mechAuxiliary" && (item.name ?? "").toLowerCase().startsWith("autotarget");
}

/**
 * The update that marks Accurate Strikes on an existing copy of Autotarget,
 * made before the field existed.
 *
 * @param {{type: string, name: string, system: object}} item
 * @returns {object} The update, empty when the item needs none.
 */
export function autotargetUpdate(item) {
    const actions = item?.system?.actions;
    if (!isAutotarget(item) || !Array.isArray(actions)) return {};

    let changed = false;
    const updated = actions.map(action => {
        if (action?.name !== "Accurate Strikes" || action.armsPilotingRanks === true) return action;
        changed = true;
        return { ...action, armsPilotingRanks: true };
    });

    return changed ? { "system.actions": updated } : {};
}
