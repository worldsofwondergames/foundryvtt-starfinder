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
 * A save or check the GM set to end a condition at the end of the creature's turn.
 *
 * @param {{kind: string, id: string, dc: number}} options
 * @param {{saves: object, skills: object}} ids CONFIG.SFRPG.saves and CONFIG.SFRPG.skills.
 * @returns {object|null} The check, or null when the id or DC is not usable.
 */
export function startEndCheck({ kind, id, dc }, ids) {
    const table = kind === "save" ? ids.saves : kind === "skill" ? ids.skills : null;
    if (!table || !Object.hasOwn(table, id)) return null;
    if (!Number.isInteger(dc) || dc <= 0) return null;

    return { kind, id, dc, timing: "turnEnd", attempts: 0, lastAttemptRound: null, consecutiveBonus: 0, smotherBonus: 0 };
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
 * consecutive rounds, and +4 for spending a full action to smother the fire.
 *
 * @param {object} check
 * @param {number|null} round The current combat round, or null outside combat.
 * @param {{smother: boolean}} options
 * @returns {number}
 */
export function attemptBonus(check, round, { smother }) {
    const earlier = runContinues(check, round) ? check.attempts : 0;
    return earlier * (check.consecutiveBonus || 0) + (smother ? check.smotherBonus || 0 : 0);
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

    const earlier = runContinues(check, round) ? check.attempts : 0;
    const attempts = check.lastAttemptRound === round && round !== null ? earlier : earlier + 1;
    return { ...check, attempts, lastAttemptRound: round };
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
 * Whether the end of the creature's turn owes this check a card.
 *
 * @param {object|null} check
 * @returns {boolean}
 */
export function isCheckDue(check) {
    return check?.timing === "turnEnd";
}
