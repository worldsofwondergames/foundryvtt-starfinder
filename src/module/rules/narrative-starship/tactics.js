/**
 * Enemy tactic data and rules for narrative starship combat (Starfinder Enhanced pp. 178-179).
 * Pure. The GM's Enemy Tactics dialog builds on this.
 *
 * Modifier kinds tactics write. All last until the end of the round the tactic is used in.
 *   crewSkill      -N to every check by the crew of a PC ship (Cruel Taunt, Ram). Cruel Taunt gives -2 only
 *                  when its check was against the Hard DC. Read by rollBonuses.
 *   thresholdDelta +1 or -1 to the enemy ship's threshold (Raise Shields, Make Repairs). Read by
 *                  resolveNarrativeRound, which keeps the threshold at 1 or more.
 *   dcHardVs       Checks with the listed skills made against the enemy ship use its Hard DC. The target is
 *                  the enemy ship and the modifier has a skills list (Evasive Maneuvers).
 *   crewDCHard     Checks with the listed skills made by the crew of a PC ship use the Hard DC. The target is
 *                  the PC ship and the modifier has a skills list (Flyby Stunt, Signal Jam).
 *
 * Modifier kinds crew actions write that tactics read: enemySkill (enemyCheckBonus), enemyHardDC and
 * ownDCHard (tacticDC), enemyRollTwiceWorse (tacticRollCount and Open Fire). Draw Fire's
 * ships[enemy].forcedTactic is read by availableTactics and chooseTactic. Prognosticate's revealTactic is read
 * by revealPending, and presetNextTactic then sets forcedTactic for next round.
 *
 * Ship flags tactics add for the round: "takeCover" and "fleeing". endOfRound in round-end.js clears them.
 */
import { addModifier, modifiersFor } from "./state.js";
import { mantleBlocks } from "./upgrades.js";

/**
 * checks: how many skill checks the enemy rolls.
 * dc: "average", "hard", or "choice" (the GM picks Average or Hard). null when there is no check.
 * pcTarget: the GM picks a PC ship.
 */
function entry(checks, dc, pcTarget) {
    return { checks, dc, pcTarget };
}

export const NARRATIVE_TACTICS = {
    allOutAttack: entry(2, "hard", true),
    cruelTaunt: entry(1, "choice", true),
    evasiveManeuvers: entry(0, null, false),
    flee: entry(0, null, false),
    flybyStunt: entry(0, null, true),
    makeRepairs: entry(0, null, false),
    openFire: entry(1, "average", true),
    raiseShields: entry(0, null, false),
    ram: entry(1, "average", true),
    signalJam: entry(0, null, true),
    takeCover: entry(0, null, false),
    useSpecialAbility: entry(0, null, false)
};

const EVASIVE_SKILLS = ["pil", "rangedAttack"];
const FLYBY_SKILLS = ["acr", "ath"];
const SIGNAL_JAM_SKILLS = ["com", "mys"];

function active(m, round) {
    return m.expiresAfterRound >= round && (m.fromRound ?? 0) <= round;
}

function hasModifier(state, target, kind, round) {
    return state.modifiers.some(m => m.target === target && m.kind === kind && active(m, round));
}

/**
 * The bonus or penalty added to the enemy's tactic checks: the sum of its enemySkill modifiers.
 * The roll is d20 + the ship's skill bonus + this.
 * @param {object} state
 * @param {string} enemyId
 * @param {number} round
 * @returns {number}
 */
export function enemyCheckBonus(state, enemyId, round) {
    return modifiersFor(state, enemyId, "enemySkill", round);
}

/**
 * How many d20 rolls a tactic needs. Open Fire needs two when the Draw Fire rider makes the enemy keep the worse.
 * @param {object} state
 * @param {{enemyId: string, tactic: string}} input
 * @param {number} round
 * @returns {number}
 */
export function tacticRollCount(state, { enemyId, tactic }, round) {
    const data = NARRATIVE_TACTICS[tactic];
    if (!data) return 0;
    if (tactic === "openFire" && hasModifier(state, enemyId, "enemyRollTwiceWorse", round)) return 2;
    return data.checks;
}

/**
 * Whether a tactic needs the Displacement Mantle d100: it targets a PC ship whose mantle is on this round.
 * @param {object} state
 * @param {{tactic: string, targetId?: string|null}} input
 * @param {number} round
 * @returns {boolean}
 */
export function mantleCheckNeeded(state, { tactic, targetId }, round) {
    if (!targetId || !NARRATIVE_TACTICS[tactic]?.pcTarget) return false;
    return modifiersFor(state, targetId, "displacementMantle", round) > 0;
}

/**
 * The DC the enemy's tactic check is rolled against.
 * @param {object} state
 * @param {{enemyId: string, targetId: string, tactic: string, choice?: "average"|"hard"}} input
 *   choice is the GM's pick for Cruel Taunt.
 * @param {{average: number, hard: number}} dcs The PC target ship's DCs.
 * @param {number} round
 * @returns {number}
 */
export function tacticDC(state, { enemyId, targetId, tactic, choice }, dcs, round) {
    const data = NARRATIVE_TACTICS[tactic];
    const hard = data?.dc === "hard"
        || (data?.dc === "choice" && choice === "hard")
        || hasModifier(state, enemyId, "enemyHardDC", round)
        || hasModifier(state, targetId, "ownDCHard", round);
    return hard ? dcs.hard : dcs.average;
}

/**
 * Whether a tactic makes a PC crew check use the Hard DC.
 * @param {object} state
 * @param {{shipId: string, targetId?: string, skillKey: string}} input shipId is the crew member's ship.
 *   targetId is the enemy ship whose DC the check is against, if any.
 * @param {number} round
 * @returns {boolean}
 */
export function forceHardFor(state, { shipId, targetId, skillKey }, round) {
    return state.modifiers.some(m => active(m, round) && m.skills?.includes(skillKey) && (
        (m.kind === "dcHardVs" && targetId && m.target === targetId)
        || (m.kind === "crewDCHard" && m.target === shipId)
    ));
}

/**
 * Every tactic with whether the GM can choose it for the enemy ship this round.
 * @param {object} state
 * @param {string} enemyId
 * @param {number} round
 * @returns {Array<{key: string, disabled: boolean, reason?: "taken"|"locked"|"forced"}>}
 */
export function availableTactics(state, enemyId, round) {
    const forced = state.ships[enemyId]?.forcedTactic;
    const forcedKey = forced?.round === round ? forced.tactic : null;
    // Another enemy's choice, or the tactic another enemy is forced to and has not chosen yet, is taken. A ship
    // that is out of the fight takes nothing.
    const taken = new Set(Object.entries(state.ships)
        .filter(([id, ship]) => id !== enemyId && ship.side === "enemy" && !ship.flags?.includes("out"))
        .map(([, ship]) => ship.tactic ?? (ship.forcedTactic?.round === round ? ship.forcedTactic.tactic : null))
        .filter(Boolean));
    return Object.keys(NARRATIVE_TACTICS).map(key => {
        let reason = null;
        // The ship's own forced tactic is never taken: Draw Fire's rule wins over the one-ship-per-tactic rule.
        if (forcedKey && key !== forcedKey) reason = "forced";
        else if (key !== forcedKey && taken.has(key)) reason = "taken";
        else if (key === "allOutAttack" && round <= (state.allOutAttackLockedUntilRound ?? 0)) reason = "locked";
        return reason ? { key, disabled: true, reason } : { key, disabled: false };
    });
}

function withShip(state, id, change) {
    return { ...state, ships: { ...state.ships, [id]: { ...state.ships[id], ...change } } };
}

/** A reason the tactic cannot be used, or null. */
function tacticProblem(state, enemyId, tactic, targetId, round) {
    if (!NARRATIVE_TACTICS[tactic]) return "unknownTactic";
    if (state.ships[enemyId]?.side !== "enemy") return "notEnemy";
    if (state.ships[enemyId].flags?.includes("out")) return "shipOut";
    // A PC ship that is out of the fight can't be targeted.
    const outTarget = id => state.ships[id]?.flags?.includes("out");
    if (NARRATIVE_TACTICS[tactic].pcTarget && (state.ships[targetId]?.side !== "pc" || outTarget(targetId))) return "badTarget";
    const status = availableTactics(state, enemyId, round).find(t => t.key === tactic);
    if (status.disabled) return status.reason;
    const forced = state.ships[enemyId].forcedTactic;
    const forcedTarget = forced?.round === round && forced.targetShip && !outTarget(forced.targetShip);
    if (forcedTarget && targetId !== forced.targetShip) return "forcedTarget";
    return null;
}

/**
 * Records the GM's tactic choice for an enemy ship. resolveRound clears it at the end of the round.
 * @param {object} state
 * @param {string} enemyId
 * @param {string} tactic
 * @param {string|null} targetId The PC ship, for tactics that target one.
 * @param {number} round
 * @returns {object} The new state.
 * @throws {Error} With the reason as message when the tactic cannot be chosen, including "alreadyChosen" when
 *   the enemy has a tactic this round.
 */
export function chooseTactic(state, enemyId, tactic, targetId, round) {
    if (state.ships[enemyId]?.tactic) throw new Error("alreadyChosen");
    const problem = tacticProblem(state, enemyId, tactic, targetId, round);
    if (problem) throw new Error(problem);
    return withShip(state, enemyId, { tactic, tacticTarget: targetId ?? null });
}

/**
 * Whether the GM still has to pick the enemy's tactic for next round because Prognosticate succeeded against it
 * this round. Prognosticate's revealTactic modifier lasts until the end of next round, so one that ends after
 * next round was written this round.
 * @param {object} state
 * @param {string} enemyId
 * @param {number} round
 * @returns {boolean}
 */
export function revealPending(state, enemyId, round) {
    const written = state.modifiers.some(m => m.target === enemyId && m.kind === "revealTactic" && m.expiresAfterRound === round + 1);
    return written && state.ships[enemyId]?.forcedTactic?.round !== round + 1;
}

/** The state as next round's choices see it: this round's tactics do not take a tactic next round. */
function nextRoundView(state) {
    const ships = Object.fromEntries(Object.entries(state.ships).map(([id, ship]) => [id, { ...ship, tactic: null }]));
    return { ...state, ships };
}

/**
 * availableTactics for the enemy's next round, for picking its tactic after Prognosticate.
 * @param {object} state
 * @param {string} enemyId
 * @param {number} round The current round.
 * @returns {Array<{key: string, disabled: boolean, reason?: "taken"|"locked"|"forced"}>}
 */
export function availableNextTactics(state, enemyId, round) {
    return availableTactics(nextRoundView(state), enemyId, round + 1);
}

/**
 * Records the tactic the GM picks for an enemy ship's next round after Prognosticate. It is stored as the
 * ship's forcedTactic, so availableTactics and chooseTactic lock it next round.
 * @param {object} state
 * @param {string} enemyId
 * @param {string} tactic
 * @param {string|null} targetId The PC ship, for tactics that target one.
 * @param {number} round The current round.
 * @returns {object} The new state.
 * @throws {Error} With the reason as message: "noReveal", or a reason chooseTactic would give next round.
 */
export function presetNextTactic(state, enemyId, tactic, targetId, round) {
    if (!revealPending(state, enemyId, round)) throw new Error("noReveal");
    const problem = tacticProblem(nextRoundView(state), enemyId, tactic, targetId, round + 1);
    if (problem) throw new Error(problem);
    const targetShip = NARRATIVE_TACTICS[tactic].pcTarget ? targetId : null;
    return withShip(state, enemyId, { forcedTactic: { tactic, targetShip, round: round + 1 } });
}

/**
 * Applies an enemy tactic.
 * @param {object} state
 * @param {object} input
 * @param {string} input.enemyId
 * @param {string} input.tactic
 * @param {string} [input.targetId] The PC ship.
 * @param {number[]} [input.rolls] Check totals, tacticRollCount of them, each d20 + skill bonus + enemyCheckBonus.
 * @param {{average: number, hard: number}} [input.dcs] The PC target ship's DCs.
 * @param {"average"|"hard"} [input.choice] The GM's DC choice for Cruel Taunt. Required for Cruel Taunt.
 * @param {number} [input.mantleRoll] The d100 for Displacement Mantle. Required when mantleCheckNeeded is true.
 * @param {number} round
 * @returns {{state: object, effects: Array<object>}} The caller applies hit and heal effects (target, value).
 *   manual means the GM runs it by hand; rejected has a reason and leaves the state unchanged; mantleBlocked
 *   means the Displacement Mantle made the tactic fail, and the state is unchanged.
 */
export function applyTactic(state, input, round) {
    const { enemyId, tactic, targetId, dcs } = input;
    const problem = tacticProblem(state, enemyId, tactic, targetId, round);
    if (problem) return { state, effects: [{ kind: "rejected", reason: problem }] };

    if (tactic === "cruelTaunt" && input.choice !== "average" && input.choice !== "hard") {
        return { state, effects: [{ kind: "rejected", reason: "noChoice" }] };
    }

    const rolls = (input.rolls ?? []).map(Number);
    const count = tacticRollCount(state, input, round);
    if (count > 0 && (rolls.length < count || !rolls.slice(0, count).every(Number.isFinite))) {
        return { state, effects: [{ kind: "rejected", reason: "badRoll" }] };
    }
    // Displacement Mantle: the tactic fails on a d100 of 20 or less, whatever the check result.
    if (mantleCheckNeeded(state, input, round)) {
        const mantleRoll = input.mantleRoll === null || input.mantleRoll === undefined ? NaN : Number(input.mantleRoll);
        if (!Number.isFinite(mantleRoll)) return { state, effects: [{ kind: "rejected", reason: "noMantleRoll" }] };
        if (mantleBlocks(mantleRoll)) return { state, effects: [{ kind: "mantleBlocked" }] };
    }
    const dc = count > 0 ? tacticDC(state, input, dcs, round) : null;
    // Open Fire with two rolls keeps the worse; All-Out Attack needs both.
    const worst = count > 0 ? Math.min(...rolls.slice(0, count)) : null;
    const success = count > 0 && worst >= dc;

    let next = state;
    const effects = [];
    const thisRound = { expiresAfterRound: round };
    const mod = (target, kind, value, extra = {}) => {
        next = addModifier(next, { target, kind, value, ...thisRound });
        if (Object.keys(extra).length) {
            const last = next.modifiers.length - 1;
            next.modifiers[last] = { ...next.modifiers[last], ...extra };
        }
    };
    const hit = (target, value) => {
        effects.push({ kind: "hit", target, value });
        next = withShip(next, target, { hitsThisRound: (next.ships[target].hitsThisRound ?? 0) + value });
    };
    const flag = name => {
        const flags = next.ships[enemyId].flags;
        if (!flags.includes(name)) next = withShip(next, enemyId, { flags: [...flags, name] });
    };

    switch (tactic) {
        case "allOutAttack":
            if (success) {
                hit(targetId, 2);
                next = { ...next, allOutAttackLockedUntilRound: round + 1 };
            }
            break;
        case "cruelTaunt":
            if (success) mod(targetId, "crewSkill", dc === dcs.hard ? -2 : -1);
            break;
        case "evasiveManeuvers":
            mod(enemyId, "dcHardVs", 1, { skills: [...EVASIVE_SKILLS] });
            break;
        case "flee":
            flag("fleeing");
            break;
        case "flybyStunt":
            mod(targetId, "crewDCHard", 1, { skills: [...FLYBY_SKILLS] });
            break;
        case "makeRepairs":
            effects.push({ kind: "heal", target: enemyId, value: 1 });
            mod(enemyId, "thresholdDelta", -1);
            break;
        case "openFire":
            if (success) hit(targetId, 1);
            break;
        case "raiseShields":
            mod(enemyId, "thresholdDelta", 1);
            break;
        case "ram":
            if (success) {
                hit(targetId, 1);
                hit(enemyId, 1);
                mod(targetId, "crewSkill", -1);
            }
            break;
        case "signalJam":
            mod(targetId, "crewDCHard", 1, { skills: [...SIGNAL_JAM_SKILLS] });
            break;
        case "takeCover":
            flag("takeCover");
            break;
        case "useSpecialAbility":
            effects.push({ kind: "manual" });
            break;
    }
    return { state: next, effects };
}
