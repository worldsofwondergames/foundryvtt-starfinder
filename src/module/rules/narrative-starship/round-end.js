/**
 * The end of a narrative starship combat round (Starfinder Enhanced pp. 178-179). Pure.
 *
 * The GM's client runs resolveNarrativeRound first, so this round's successes have become hits, then
 * endOfRound on its state and HP. Flee checks the HP left after those hits: "If the enemy ship has more
 * than 0 HP at the end of the round, it flees the battle."
 */

/** Phase indexes of the narrative combat type: Change Roles, Enemy Tactics, Crew Actions, Resolve. */
const TACTICS_PHASE = 1;
const CREW_ACTIONS_PHASE = 2;

/** Flags that last only for the round they were set in. */
const ROUND_FLAGS = ["takeCover", "fleeing"];

/**
 * Removes the enemy ships that fled and clears the Take Cover and Flee flags.
 * @param {object} state The state after resolveNarrativeRound.
 * @param {Record<string, number>} hp Each ship's HP after this round's hits.
 * @returns {{state: object, fled: string[], ended: "pcWin"|"pcLoss"|"fled"|null}}
 *   ended is "fled" when no enemy is left in the fight and at least one fled this round.
 */
export function endOfRound(state, hp) {
    const fled = Object.entries(state.ships)
        .filter(([id, ship]) => ship.side === "enemy" && ship.flags.includes("fleeing") && (hp[id] ?? 0) > 0)
        .map(([id]) => id);
    const gone = new Set(fled);

    const ships = {};
    for (const [id, ship] of Object.entries(state.ships)) {
        if (gone.has(id)) continue;
        ships[id] = { ...ship, flags: ship.flags.filter(f => !ROUND_FLAGS.includes(f)) };
    }
    const usedOnce = Object.fromEntries(Object.entries(state.usedOnce ?? {}).filter(([id]) => !gone.has(id)));
    const modifiers = state.modifiers.filter(m => !gone.has(m.target));
    const next = { ...state, ships, usedOnce, modifiers };

    const fighting = side => Object.keys(ships).filter(id => ships[id].side === side && (hp[id] ?? 0) > 0);
    let ended = null;
    const pcs = Object.keys(ships).filter(id => ships[id].side === "pc");
    if (pcs.length > 0 && fighting("pc").length === 0) ended = "pcLoss";
    else if (fighting("enemy").length === 0) ended = fled.length > 0 ? "fled" : "pcWin";
    return { state: next, fled, ended };
}

/**
 * The round whose Resolve step was skipped when the GM moved straight to a new round, or null.
 * Moving on from Enemy Tactics or Crew Actions skips the Resolve phase, so it must run once for the old round.
 * @param {object} input
 * @param {string} input.combatType
 * @param {boolean} input.isNewRound
 * @param {number} input.direction Above 0 when the combat steps ahead.
 * @param {number} input.oldPhaseIndex
 * @param {number} input.oldRound
 * @param {number|undefined} input.resolvedRound The round Resolve last ran for (narrativeResolvedRound).
 * @returns {number|null}
 */
export function missedResolveRound({ combatType, isNewRound, direction, oldPhaseIndex, oldRound, resolvedRound }) {
    if (combatType !== "narrativeStarship" || !isNewRound || !(direction > 0)) return null;
    if (oldPhaseIndex !== TACTICS_PHASE && oldPhaseIndex !== CREW_ACTIONS_PHASE) return null;
    return resolvedRound === oldRound ? null : oldRound;
}
