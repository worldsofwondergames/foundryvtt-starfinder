/**
 * Enemy tactic data and rules for narrative starship combat (Starfinder Enhanced pp. 178-179).
 * Pure. The GM's Enemy Tactics dialog builds on this.
 *
 * Modifier kinds tactics write. All last until the end of the round the tactic is used in.
 *   crewSkill      -N to every check by the crew of a PC ship (Cruel Taunt, Ram). Read by rollBonuses.
 *   thresholdDelta +1 or -1 to the enemy ship's threshold (Raise Shields, Make Repairs). Read by
 *                  resolveNarrativeRound, which keeps the threshold at 1 or more.
 *   dcHardVs       Checks with the listed skills made against the enemy ship use its Hard DC. The target is
 *                  the enemy ship and the modifier has a skills list (Evasive Maneuvers).
 *   crewDCHard     Checks with the listed skills made by the crew of a PC ship use the Hard DC. The target is
 *                  the PC ship and the modifier has a skills list (Flyby Stunt, Signal Jam).
 *
 * Modifier kinds crew actions write that tactics read: enemySkill (enemyCheckBonus), enemyHardDC and
 * ownDCHard (tacticDC), enemyRollTwiceWorse (tacticRollCount and Open Fire). Draw Fire's
 * ships[enemy].forcedTactic is read by availableTactics and chooseTactic.
 *
 * Ship flags tactics add for the round: "takeCover" and "fleeing". The round-end code clears them.
 */
import { addModifier, modifiersFor } from "./state.js";

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
    const taken = new Set(Object.entries(state.ships)
        .filter(([id, ship]) => id !== enemyId && ship.side === "enemy" && ship.tactic)
        .map(([, ship]) => ship.tactic));
    return Object.keys(NARRATIVE_TACTICS).map(key => {
        let reason = null;
        if (forcedKey && key !== forcedKey) reason = "forced";
        else if (taken.has(key)) reason = "taken";
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
    if (NARRATIVE_TACTICS[tactic].pcTarget && state.ships[targetId]?.side !== "pc") return "badTarget";
    const status = availableTactics(state, enemyId, round).find(t => t.key === tactic);
    if (status.disabled) return status.reason;
    const forced = state.ships[enemyId].forcedTactic;
    if (forced?.round === round && forced.targetShip && targetId !== forced.targetShip) return "forcedTarget";
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
 * @throws {Error} With the reason as message when the tactic cannot be chosen.
 */
export function chooseTactic(state, enemyId, tactic, targetId, round) {
    const problem = tacticProblem(state, enemyId, tactic, targetId, round);
    if (problem) throw new Error(problem);
    return withShip(state, enemyId, { tactic, tacticTarget: targetId ?? null });
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
 * @param {"average"|"hard"} [input.choice] The GM's DC choice for Cruel Taunt.
 * @param {number} round
 * @returns {{state: object, effects: Array<object>}} The caller applies hit and heal effects (target, value).
 *   manual means the GM runs it by hand; rejected has a reason and leaves the state unchanged.
 */
export function applyTactic(state, input, round) {
    const { enemyId, tactic, targetId, dcs } = input;
    const problem = tacticProblem(state, enemyId, tactic, targetId, round);
    if (problem) return { state, effects: [{ kind: "rejected", reason: problem }] };

    const rolls = (input.rolls ?? []).map(Number);
    const count = tacticRollCount(state, input, round);
    if (count > 0 && (rolls.length < count || !rolls.slice(0, count).every(Number.isFinite))) {
        return { state, effects: [{ kind: "rejected", reason: "badRoll" }] };
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
            if (success) mod(targetId, "crewSkill", worst >= dcs.hard ? -2 : -1);
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
