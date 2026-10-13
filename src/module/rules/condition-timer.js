/**
 * Conditions a spell, attack or ability can impose for a set number of rounds.
 *
 * The rest end on something else: Hit Points (dead, dying, stable), carried
 * bulk (encumbered, overburdened), repair (broken), being put out or stopped
 * (burning, bleeding), the creature acting or being freed (prone, grappled,
 * pinned), another condition (helpless), or restoration (negative level).
 * Ongoing damage conditions have their own timer in ongoing-damage.js.
 *
 * @type {string[]}
 */
export const TIMED_CONDITIONS = [
    "asleep",
    "blinded",
    "confused",
    "cowering",
    "dazed",
    "dazzled",
    "deafened",
    "entangled",
    "exhausted",
    "fascinated",
    "fatigued",
    "flat-footed",
    "frightened",
    "invisible",
    "nauseated",
    "off-kilter",
    "off-target",
    "panicked",
    "paralyzed",
    "shaken",
    "sickened",
    "staggered",
    "stunned",
    "unconscious"
];

/**
 * The timer for a condition given a number of rounds.
 *
 * The timer counts down at the end of the affected creature's turn, so a
 * creature stunned for 1 round on an enemy's turn loses its next turn. A
 * condition applied during the creature's own turn would otherwise lose a round
 * at the end of that same turn, so that first turn end is skipped.
 *
 * @param {number|null|undefined} rounds The rounds asked for, or null for no timer.
 * @param {boolean} onOwnTurn True if it is the affected creature's turn.
 * @returns {{rounds: number, skipTurnEnd: boolean}|null} The timer, or null for none.
 */
export function startConditionTimer(rounds, onOwnTurn) {
    if (!Number.isInteger(rounds) || rounds <= 0) return null;
    return { rounds, skipTurnEnd: Boolean(onOwnTurn) };
}

/**
 * Count down a condition's timer at the end of the affected creature's turn.
 *
 * @param {{rounds: number, skipTurnEnd: boolean}|null|undefined} timer The condition's timer.
 * @returns {{timer: {rounds: number, skipTurnEnd: boolean}|null, expired: boolean}} The timer to store, and whether the condition ends.
 */
export function tickConditionTimer(timer) {
    if (!Number.isInteger(timer?.rounds) || timer.rounds <= 0) return { timer: null, expired: false };
    if (timer.skipTurnEnd) return { timer: { rounds: timer.rounds, skipTurnEnd: false }, expired: false };

    const rounds = timer.rounds - 1;
    return rounds > 0 ? { timer: { rounds, skipTurnEnd: false }, expired: false } : { timer: null, expired: true };
}

/**
 * Whether flat-footed stays when the condition that caused it ends, because it
 * was given rounds of its own.
 *
 * @param {{rounds: number}|null|undefined} timer Flat-footed's timer.
 * @returns {boolean}
 */
export function keepsOwnTimer(timer) {
    return Number.isInteger(timer?.rounds) && timer.rounds > 0;
}
