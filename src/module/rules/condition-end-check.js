/**
 * Conditions that function as burning and end on its Reflex save.
 *
 * @type {string[]}
 */
export const BURNING_FAMILY = ["burning", "corrode", "frostbite"];

/** The check each condition's own text gives it. */
const BUILT_IN = {
    burning: { kind: "save", id: "reflex", dc: null, timing: "turnEnd", consecutiveBonus: 2, smotherBonus: 4 },
    bleeding: { kind: "skill", id: "med", dc: 15, timing: "onDemand", consecutiveBonus: 0, smotherBonus: 0 }
};

/**
 * The check that ends a condition, if it has one.
 *
 * Burning, Corrode, Frostbite and Bleeding get the check their own text gives
 * them, carrying the attempts stored on the item. Any other condition has the
 * check the GM set, or none.
 *
 * @param {string} condition A key of CONFIG.SFRPG.conditionTypes.
 * @param {object|null} stored The item's `conditionEndCheck` flag.
 * @returns {object|null}
 */
export function endCheckFor(condition, stored) {
    const builtIn = BURNING_FAMILY.includes(condition) ? BUILT_IN.burning : BUILT_IN[condition];
    if (!builtIn) return stored ?? null;

    return {
        ...builtIn,
        attempts: Number.isInteger(stored?.attempts) ? stored.attempts : 0,
        lastAttemptRound: stored?.lastAttemptRound ?? null
    };
}

/**
 * When a check the GM sets can be offered: at the start of each of the
 * creature's turns, at the end of each of its turns, or at the end of each round.
 *
 * @type {string[]}
 */
export const END_CHECK_TIMINGS = ["turnStart", "turnEnd", "roundEnd"];

/**
 * Whether the rounds dialog still needs a DC: a save is chosen and the DC is
 * blank or not a whole number above 0. A save without one would be dropped.
 *
 * @param {string} save The chosen save, or "" for none.
 * @param {string} dc The DC as typed.
 * @returns {boolean}
 */
export function missingDC(save, dc) {
    if (!save) return false;
    const value = Number(dc);
    return !Number.isInteger(value) || value <= 0;
}

/**
 * A save or check the GM set to end a condition.
 *
 * A timing of "fullAction" is a save the creature spends a full action on during
 * its own turn, as Hold Person allows: "Each round on its turn, the target can
 * spend a full action to attempt a new saving throw." It is offered at the start
 * of the creature's turn and marked as costing a full action.
 *
 * @param {{kind: string, id: string, dc: number, timing?: string, cumulativeBonus?: number}} options
 *     cumulativeBonus is added once for each earlier failed attempt, such as
 *     Transmogrification's "cumulative +1 bonus".
 * @param {{saves: object, skills: object}} ids CONFIG.SFRPG.saves and CONFIG.SFRPG.skills.
 * @returns {object|null} The check, or null when the id, DC, timing or bonus is not usable.
 */
export function startEndCheck({ kind, id, dc, timing = "turnEnd", cumulativeBonus = 0 }, ids) {
    const table = kind === "save" ? ids.saves : kind === "skill" ? ids.skills : null;
    if (!table || !Object.hasOwn(table, id)) return null;
    if (!Number.isInteger(dc) || dc <= 0) return null;
    if (!Number.isInteger(cumulativeBonus) || cumulativeBonus < 0) return null;

    const fullAction = timing === "fullAction";
    const when = fullAction ? "turnStart" : timing;
    if (!END_CHECK_TIMINGS.includes(when)) return null;

    return {
        kind,
        id,
        dc,
        timing: when,
        fullAction,
        attempts: 0,
        totalAttempts: 0,
        lastAttemptRound: null,
        consecutiveBonus: 0,
        cumulativeBonus,
        smotherBonus: 0
    };
}

/**
 * The DC of the Burning family's save: 10 + the damage the condition dealt this round.
 *
 * @param {{round: number, amount: number}|null} taken The damage stored by the ongoing damage roll.
 * @param {number|null} round The current combat round.
 * @returns {number}
 */
export function burningDC(taken, round) {
    if (!taken || taken.round !== round) return 10;
    return 10 + Math.max(0, Number(taken.amount) || 0);
}

/**
 * Whether the attempts stored on a check run on into this round.
 *
 * @param {object} check
 * @param {number|null} round
 * @returns {boolean}
 */
function runContinues(check, round) {
    if (round === null || check.lastAttemptRound === null) return false;
    return check.lastAttemptRound === round || check.lastAttemptRound === round - 1;
}

/**
 * The bonus on this attempt: the Burning family's +2 for each earlier attempt in
 * consecutive rounds, a cumulative bonus for each earlier failed attempt however
 * long ago, and +4 for spending a full action to smother the fire.
 *
 * @param {object} check
 * @param {number|null} round The current combat round, or null outside combat.
 * @param {{smother: boolean}} options
 * @returns {number}
 */
export function attemptBonus(check, round, { smother }) {
    const earlier = runContinues(check, round) ? check.attempts : 0;
    return earlier * (check.consecutiveBonus || 0)
        + (check.totalAttempts || 0) * (check.cumulativeBonus || 0)
        + (smother ? check.smotherBonus || 0 : 0);
}

/**
 * The check after an attempt. A success ends the condition. A failure counts
 * one attempt per round, so a second try in the same round adds nothing.
 *
 * @param {object} check
 * @param {number|null} round The current combat round, or null outside combat.
 * @param {boolean} success
 * @returns {object|null} The check to store, or null when the condition ends.
 */
export function recordAttempt(check, round, success) {
    if (success) return null;

    const sameRound = check.lastAttemptRound === round && round !== null;
    const earlier = runContinues(check, round) ? check.attempts : 0;
    const attempts = sameRound ? earlier : earlier + 1;
    const totalAttempts = (check.totalAttempts || 0) + (sameRound ? 0 : 1);
    return { ...check, attempts, totalAttempts, lastAttemptRound: round };
}

/**
 * The round an attempt counts toward.
 *
 * The end-of-turn save belongs to the turn its card was posted for, even when
 * the combat has already moved into the next round, as it has after the last
 * creature in the order ends its turn. Smothering the fire is a full action
 * taken on the creature's own turn, so it counts in the round it is done.
 *
 * @param {{smother: boolean, cardRound: number|null, currentRound: number|null}} options
 * @returns {number|null}
 */
export function attemptRound({ smother, cardRound, currentRound }) {
    return smother ? currentRound : cardRound;
}

/**
 * Whether a roll succeeds at an end check.
 *
 * A natural 1 on a saving throw always fails and a natural 20 always succeeds.
 * A skill check has no such rule, so only its total counts.
 *
 * @param {{kind: string}} check
 * @param {{total: number, dc: number, natural: number}} roll The total, the DC, and the kept d20.
 * @returns {boolean}
 */
export function checkSucceeds(check, { total, dc, natural }) {
    if (check.kind === "save") {
        if (natural === 20) return true;
        if (natural === 1) return false;
    }
    return total >= dc;
}

/**
 * Whether this moment in the combat owes the check a card.
 *
 * @param {object|null} check
 * @param {string} [moment] "turnStart", "turnEnd" or "roundEnd".
 * @returns {boolean}
 */
export function isCheckDue(check, moment = "turnEnd") {
    return Boolean(check) && check.timing === moment;
}
