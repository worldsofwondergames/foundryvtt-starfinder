/**
 * Applies a rolled crew action to the narrative combat state (Starfinder Enhanced pp. 179-183).
 * Pure. The GM's client calls it and then applies the returned document effects.
 *
 * Modifier kinds written to state.modifiers. "Next round" ones carry fromRound: round + 1.
 *   nextCheck            +N to one actor's next check, used up by that check (Provide Aid, Give Orders and
 *                        Maximize Crew Efficiency Resolve riders).
 *   skill                +N to every check an actor attempts this round (Empower Crew).
 *   crewSkill            +N or -N to every check by the crew of a ship (target is the ship id). Read by
 *                        rollBonuses; nothing in this file writes it. For enemy tactics such as Cruel Taunt.
 *   skillVsTarget        +N to checks made against the target ship's DC this round (Search Database).
 *   firstVsTarget        +N to the first action that targets the ship; one entry per action (Prognosticate).
 *   allyVsTarget         +N to one gunner's success-granting actions against one ship; target is
 *                        "<actorId>|<shipId>" (Hold Steady).
 *   rollTwice            Roll the next check twice and keep the better. Target is an actor id (Access
 *                        Maintenance Panels) or "action:<actionKey>" (Engage Experimental Prototype rider).
 *   successMultiplier    Doubles the successes of the next success-granting action. Target is an actor id
 *                        (Maximize Crew Efficiency) or "action:<actionKey>" (Engage Experimental Prototype).
 *   freePatchHull        The engineer may Patch Hull once at -2 without spending an action (Improve
 *                        Countermeasures rider).
 *   enemySkill           Penalty to an enemy ship's tactic checks (Harry Enemy, Engage Full Thrusters).
 *   enemyHardDC          The enemy ship uses the PC ship's Hard DC for its tactics (Engage Full Thrusters).
 *   enemyRollTwiceWorse  The enemy rolls twice and keeps the worse when it fires on the PC ship (Draw Fire rider).
 *   ownDCHard            The PC ship uses its Hard DC against enemy tactics (Patch Hull rider,
 *                        Improve Countermeasures).
 *   revealTactic         The GM must pick the enemy's tactic for next round now (Prognosticate).
 *   thresholdDelta       Change to a ship's threshold (Channel Eldritch Energy).
 *   extraHitIfHit        One more hit at Resolve if the ship took at least one hit (Target System).
 *   virtualIntelligenceUsed  The PC ship's Virtual Intelligence has aided this round (target is the ship).
 *
 * Draw Fire also sets ships[target].forcedTactic = {tactic: "openFire", targetShip, round}.
 *
 * An enemy ship with the "takeCover" flag (Take Cover tactic) cannot be targeted. The only action allowed against
 * it is clearTakeCover, the pilot's special Piloting check, which removes the flag and gives no successes.
 */
import { NARRATIVE_CREW_ACTIONS, skillLockedFor, successesFor } from "./crew-actions.js";
import { addModifier, addSuccesses, canAct, grantExtraAction, modifiersFor, recordAction, resolveRound } from "./state.js";
import { absorbHit } from "./upgrades.js";

/** Actions that need an enemy ship chosen. */
const ENEMY_TARGET_ACTIONS = new Set(
    Object.keys(NARRATIVE_CREW_ACTIONS).filter(key => NARRATIVE_CREW_ACTIONS[key].dcOf === "target")
);

/** Own-DC actions whose Resolve rider counts as a success against a chosen enemy. */
const RESOLVE_SUCCESS_ACTIONS = new Set(["empowerCrew", "searchDatabase", "targetSystem"]);

/** Who may be chosen as the ally, and whether they must or must not have acted this round. */
const ALLY_RULES = {
    provideAid: { notSelf: true, acted: false },
    encourageCrewMember: { notSelf: true },
    giveOrders: { acted: true },
    accessMaintenancePanels: { notSelf: true, acted: false, roles: ["engineer", "scienceOfficer"] },
    maximizeCrewEfficiency: { notSelf: true, acted: false },
    holdSteady: { notSelf: true, acted: false, roles: ["gunner"] },
    improveCountermeasures: { resolveOnly: true, roles: ["engineer"] }
};

/** Resolve riders that need a second ally or a second enemy. */
const SECOND_ALLY_ACTIONS = new Set(["provideAid", "encourageCrewMember", "accessMaintenancePanels", "holdSteady"]);
const SECOND_ENEMY_ACTIONS = new Set(["harryEnemy"]);

/**
 * What the crew action dialog must ask for with an action.
 * @param {string} actionKey
 * @returns {{enemy: boolean, ally: "always"|"resolve"|null, secondAlly: boolean, secondEnemy: boolean,
 *   resolveEnemy: boolean, targetAction: boolean}}
 */
export function actionNeeds(actionKey) {
    const allyRules = ALLY_RULES[actionKey];
    return {
        enemy: ENEMY_TARGET_ACTIONS.has(actionKey),
        ally: allyRules ? (allyRules.resolveOnly ? "resolve" : "always") : null,
        secondAlly: SECOND_ALLY_ACTIONS.has(actionKey),
        secondEnemy: SECOND_ENEMY_ACTIONS.has(actionKey),
        resolveEnemy: RESOLVE_SUCCESS_ACTIONS.has(actionKey) && !ENEMY_TARGET_ACTIONS.has(actionKey),
        targetAction: actionKey === "engageExperimentalPrototype"
    };
}

/**
 * Whether an action can give skill check successes toward a threshold.
 * @param {string} actionKey
 * @returns {boolean}
 */
export function grantsSuccesses(actionKey) {
    return successesFor(actionKey, 100, 0) > 0;
}

/**
 * Which ship's DCs a crew action is rolled against.
 * @param {string} actionKey
 * @param {{shipId: string, targetId?: string}} input
 * @returns {string}
 */
export function crewActionDCShip(actionKey, { shipId, targetId }) {
    return NARRATIVE_CREW_ACTIONS[actionKey]?.dcOf === "target" ? targetId : shipId;
}

/**
 * The roles each crew member holds on a ship.
 * @param {Record<string, string[]>} shipCrew role -> actor ids
 * @param {string} actorId
 * @returns {string[]}
 */
export function rolesOf(shipCrew, actorId) {
    return Object.entries(shipCrew ?? {}).filter(([, ids]) => ids.includes(actorId))
        .map(([role]) => role);
}

function active(m, round) {
    return m.expiresAfterRound >= round && (m.fromRound ?? 0) <= round;
}

/** Removes the active modifiers that match. With `limit`, removes only that many. */
function consume(state, target, kind, round, limit = Infinity) {
    let left = limit;
    const modifiers = state.modifiers.filter(m => {
        if (left > 0 && m.target === target && m.kind === kind && active(m, round)) {
            left -= 1;
            return false;
        }
        return true;
    });
    return { ...state, modifiers };
}

function firstActive(state, target, kind, round) {
    return state.modifiers.find(m => m.target === target && m.kind === kind && active(m, round));
}

/**
 * Bonuses the crew member's roll gets from the round's modifiers, as named parts.
 * @param {object} state
 * @param {{shipId: string, actorId: string, actionKey: string, targetId?: string}} who
 * @param {number} round
 * @returns {{parts: Array<{kind: string, value: number}>, total: number, rollTwice: boolean}}
 */
export function rollBonuses(state, { shipId, actorId, actionKey, targetId }, round) {
    const action = NARRATIVE_CREW_ACTIONS[actionKey];
    const targeted = ENEMY_TARGET_ACTIONS.has(actionKey) && targetId;
    const parts = [
        { kind: "skill", value: modifiersFor(state, actorId, "skill", round) },
        { kind: "crewSkill", value: modifiersFor(state, shipId, "crewSkill", round) },
        { kind: "nextCheck", value: modifiersFor(state, actorId, "nextCheck", round) }
    ];
    if (targeted && action.dcOf === "target") {
        parts.push({ kind: "skillVsTarget", value: modifiersFor(state, targetId, "skillVsTarget", round) });
    }
    if (targeted) {
        parts.push({ kind: "firstVsTarget", value: firstActive(state, targetId, "firstVsTarget", round)?.value ?? 0 });
    }
    if (targeted && grantsSuccesses(actionKey)) {
        parts.push({ kind: "allyVsTarget", value: modifiersFor(state, `${actorId}|${targetId}`, "allyVsTarget", round) });
    }
    const nonZero = parts.filter(p => p.value !== 0);
    const rollTwice = modifiersFor(state, actorId, "rollTwice", round) > 0
        || modifiersFor(state, `action:${actionKey}`, "rollTwice", round) > 0;
    return { parts: nonZero, total: nonZero.reduce((sum, p) => sum + p.value, 0), rollTwice };
}

function reject(state, reason) {
    return { state, effects: [{ kind: "rejected", reason }], success: false, successes: 0 };
}

function isEnemy(state, id) {
    return state.ships[id]?.side === "enemy";
}

function takingCover(state, id) {
    return Boolean(state.ships[id]?.flags.includes("takeCover"));
}

function allyProblem(state, input, allyId, rules) {
    const shipCrew = input.crew?.[input.shipId] ?? {};
    const roles = rolesOf(shipCrew, allyId);
    if (!allyId || roles.length === 0) return "badAlly";
    if (rules.notSelf && allyId === input.actorId) return "badAlly";
    if (rules.roles && !roles.some(role => rules.roles.includes(role))) return "badAlly";
    const acted = (state.actedThisRound[allyId] ?? 0) > 0;
    if (rules.acted === true && !acted) return "badAlly";
    if (rules.acted === false && acted) return "badAlly";
    return null;
}

/** Checks the input before anything changes. Returns a rejection reason or null. */
function validate(state, input, round) {
    const { actionKey, actorId, role, skillKey, targetId, spentResolve } = input;
    const action = NARRATIVE_CREW_ACTIONS[actionKey];
    if (!action) return "unknownAction";
    if (action.role !== "any" && action.role !== role) return "wrongRole";

    if (input.free) {
        if (actionKey !== "patchHull" || modifiersFor(state, actorId, "freePatchHull", round) <= 0) return "noFreeAction";
        if (spentResolve) return "noResolveRider";
        const check = canAct({ ...state, actedThisRound: {} }, input, input.crew);
        if (!check.ok) return check.reason;
    } else {
        const check = canAct(state, input, input.crew);
        if (!check.ok) return check.reason;
    }
    // Negate Take Cover is a special Piloting check, so the same-skill rule leaves it out.
    if (skillLockedFor(actionKey, skillKey, state.skillsLastRound?.[actorId])) return "sameSkill";
    if (!skillKey) return "noSkill";
    if (skillKey === "rangedAttack" && role !== "gunner") return "notGunner";
    if (skillKey !== "rangedAttack" && !(Array.isArray(input.actorSkills) && input.actorSkills.includes(skillKey))) return "badSkill";

    if (ENEMY_TARGET_ACTIONS.has(actionKey) && !isEnemy(state, targetId)) return "badTarget";
    if (spentResolve && RESOLVE_SUCCESS_ACTIONS.has(actionKey) && !isEnemy(state, targetId)) return "badTarget";
    if (actionKey === "clearTakeCover") {
        if (skillKey !== "pil") return "pilotingOnly";
        if (!takingCover(state, targetId)) return "notTakingCover";
    } else {
        const targeted = ENEMY_TARGET_ACTIONS.has(actionKey) || (spentResolve && RESOLVE_SUCCESS_ACTIONS.has(actionKey));
        if (targeted && takingCover(state, targetId)) return "takeCover";
        if (spentResolve && SECOND_ENEMY_ACTIONS.has(actionKey) && takingCover(state, input.secondTargetId)) return "takeCover";
    }

    if (spentResolve && !action.resolve) return "noResolveRider";
    if (spentResolve && !(Number(input.actorResolve) >= 1)) return "noResolve";

    const allyRules = ALLY_RULES[actionKey];
    if (allyRules && (!allyRules.resolveOnly || spentResolve)) {
        const problem = allyProblem(state, input, input.allyId, allyRules);
        if (problem) return problem;
    }
    if (spentResolve && SECOND_ALLY_ACTIONS.has(actionKey)) {
        if (input.secondAllyId === input.allyId) return "badAlly";
        const problem = allyProblem(state, input, input.secondAllyId, allyRules);
        if (problem) return problem;
        if (actionKey === "accessMaintenancePanels") {
            const shipCrew = input.crew[input.shipId];
            const first = rolesOf(shipCrew, input.allyId).filter(r => allyRules.roles.includes(r));
            const second = rolesOf(shipCrew, input.secondAllyId).filter(r => allyRules.roles.includes(r));
            if (second.every(r => first.includes(r))) return "badAlly";
        }
    }
    if (spentResolve && SECOND_ENEMY_ACTIONS.has(actionKey)) {
        if (!isEnemy(state, input.secondTargetId) || input.secondTargetId === targetId) return "badTarget";
    }
    if (actionKey === "engageExperimentalPrototype" && !grantsSuccesses(input.targetAction)) return "badAction";
    return null;
}

/**
 * Provide Aid's effect: the ally gets +2 on their next check this round, or +3 when the aid check beat the DC by 5
 * or more. Used by Provide Aid and Virtual Intelligence.
 * @param {object} state
 * @param {string} allyId
 * @param {number} margin The aid check's total minus its DC. 0 or more.
 * @param {number} round
 * @returns {object}
 */
export function addAidBonus(state, allyId, margin, round) {
    return addModifier(state, { target: allyId, kind: "nextCheck", value: margin >= 5 ? 3 : 2, expiresAfterRound: round });
}

/**
 * Virtual Intelligence: once a round, the ship's computer attempts Provide Aid for a crew member of that ship who
 * has not acted yet. It uses no crew member's action. The roll is d20 + virtualIntelligenceBonus(tier) against the
 * ship's own Average DC.
 * @param {object} state
 * @param {object} input
 * @param {string} input.shipId The PC ship with the upgrade.
 * @param {string} input.allyId
 * @param {number} input.total
 * @param {number} input.dc
 * @param {Record<string, Record<string, string[]>>} input.crew Crew by ship and role.
 * @param {number} round
 * @returns {{state: object, ok: boolean, success?: boolean, reason?: string}}
 *   The ship's aid this round is recorded as a virtualIntelligenceUsed modifier, success or not.
 */
export function applyVirtualIntelligenceAid(state, { shipId, allyId, total, dc, crew }, round) {
    if (state.ships[shipId]?.side !== "pc") return { state, ok: false, reason: "wrongSide" };
    if (modifiersFor(state, shipId, "virtualIntelligenceUsed", round) > 0) return { state, ok: false, reason: "aidUsed" };
    if (allyProblem(state, { shipId, crew }, allyId, { acted: false })) return { state, ok: false, reason: "badAlly" };
    let next = addModifier(state, { target: shipId, kind: "virtualIntelligenceUsed", value: 1, expiresAfterRound: round });
    const success = Number(total) >= Number(dc);
    if (success) next = addAidBonus(next, allyId, Number(total) - Number(dc), round);
    return { state: next, ok: true, success };
}

/**
 * Applies one crew action.
 * @param {object} state The combat's narrative state.
 * @param {object} input
 * @param {string} input.shipId The crew member's ship.
 * @param {string} input.actorId
 * @param {string} input.role The role the crew member acts in.
 * @param {string} input.actionKey A key of NARRATIVE_CREW_ACTIONS.
 * @param {string} [input.targetId] Enemy ship.
 * @param {string} [input.secondTargetId] Second enemy ship (Harry Enemy with Resolve).
 * @param {string} [input.allyId] Allied crew member.
 * @param {string} [input.secondAllyId] Second allied crew member for Resolve riders.
 * @param {string} [input.targetAction] Action key chosen for Engage Experimental Prototype.
 * @param {string} input.skillKey
 * @param {string[]} input.actorSkills The skill keys the crew member can use. "rangedAttack" is checked by role.
 * @param {number} input.total The roll total.
 * @param {number} input.dc The DC, worked out by the GM.
 * @param {boolean} input.spentResolve
 * @param {number} input.actorResolve The crew member's current Resolve Points.
 * @param {boolean} [input.free] The free Patch Hull from Improve Countermeasures.
 * @param {Record<string, Record<string, string[]>>} input.crew Crew by ship and role.
 * @param {number} round
 * @returns {{state: object, effects: Array<object>, success: boolean, successes: number}}
 *   The caller applies the effects heal, hit, regainResolve, spendResolve (target and value), or rejected (reason).
 */
export function applyCrewAction(state, input, round) {
    const problem = validate(state, input, round);
    if (problem) return reject(state, problem);

    const { actionKey, actorId, shipId, targetId, allyId, skillKey } = input;
    const action = NARRATIVE_CREW_ACTIONS[actionKey];
    const total = Number(input.total);
    const dc = Number(input.dc);
    const success = total >= dc;
    const margin = total - dc;
    const spent = Boolean(input.spentResolve) && success;
    const nextRound = { expiresAfterRound: round + 1, fromRound: round + 1 };
    const thisRound = { expiresAfterRound: round };
    const effects = [];
    let gained = 0;

    // The roll is made, so count the action and use up the bonuses it got.
    let next = state;
    if (input.free) {
        // Not an action, but the skill was still used this round.
        next = consume(next, actorId, "freePatchHull", round, 1);
        next = {
            ...next,
            skillsThisRound: { ...next.skillsThisRound, [actorId]: [...(next.skillsThisRound[actorId] ?? []), skillKey] }
        };
    } else if (actionKey === "clearTakeCover") {
        // It uses the pilot's action, but the Piloting use does not count against next round.
        next = { ...next, actedThisRound: { ...next.actedThisRound, [actorId]: (next.actedThisRound[actorId] ?? 0) + 1 } };
    } else {
        next = recordAction(next, actorId, skillKey);
    }
    next = consume(next, actorId, "nextCheck", round);
    next = consume(next, actorId, "rollTwice", round);
    next = consume(next, `action:${actionKey}`, "rollTwice", round, 1);
    if (ENEMY_TARGET_ACTIONS.has(actionKey)) next = consume(next, targetId, "firstVsTarget", round, 1);

    if (!success) return { state: next, effects, success, successes: 0 };

    // Successes toward the target's threshold, doubled by Maximize Crew Efficiency or
    // Engage Experimental Prototype. Two doublings give three times the successes.
    const base = successesFor(actionKey, total, dc);
    if (base > 0) {
        const doublers = [actorId, `action:${actionKey}`].filter(t => firstActive(next, t, "successMultiplier", round));
        const multiplier = 1 + doublers.length;
        for (const t of doublers) next = consume(next, t, "successMultiplier", round, 1);
        gained = base * multiplier;
        next = addSuccesses(next, targetId, gained);
    }

    const mod = (target, kind, value, when) => {
        next = addModifier(next, { target, kind, value, ...when });
    };
    const allies = spent && input.secondAllyId ? [allyId, input.secondAllyId] : [allyId];

    switch (action.effect) {
        case "successes":
            break;
        case "aidBonus":
            for (const ally of allies) next = addAidBonus(next, ally, margin, round);
            break;
        case "regainResolve":
            for (const ally of allies) effects.push({ kind: "regainResolve", target: ally, value: 1 });
            break;
        case "extraAction":
            next = grantExtraAction(next, allyId);
            if (spent) mod(allyId, "nextCheck", 2, thisRound);
            break;
        case "rollTwice":
            for (const ally of allies) mod(ally, "rollTwice", 1, thisRound);
            break;
        case "doubleNextSuccesses":
            mod(allyId, "successMultiplier", 2, thisRound);
            if (spent) mod(allyId, "nextCheck", 2, thisRound);
            break;
        case "doubleActionSuccesses":
            mod(`action:${input.targetAction}`, "successMultiplier", 2, thisRound);
            if (spent) mod(`action:${input.targetAction}`, "rollTwice", 1, thisRound);
            break;
        case "heal":
            effects.push({ kind: "heal", target: shipId, value: 1 });
            if (spent) mod(shipId, "ownDCHard", 1, nextRound);
            break;
        case "forceOpenFire":
            next = {
                ...next,
                ships: {
                    ...next.ships,
                    [targetId]: { ...next.ships[targetId], forcedTactic: { tactic: "openFire", targetShip: shipId, round: round + 1 } }
                }
            };
            if (spent) mod(targetId, "enemyRollTwiceWorse", 1, nextRound);
            break;
        case "penalizeEnemy":
            mod(targetId, "enemySkill", -2, nextRound);
            if (spent) mod(input.secondTargetId, "enemySkill", -2, nextRound);
            break;
        case "extraHitOnMargin":
            if (margin >= 10) {
                effects.push({ kind: "hit", target: targetId, value: 1 });
                next = { ...next, ships: { ...next.ships, [targetId]: { ...next.ships[targetId], hitsThisRound: (next.ships[targetId].hitsThisRound ?? 0) + 1 } } };
            }
            break;
        case "reduceThresholdOnMargin":
            if (margin >= 5) mod(targetId, "thresholdDelta", -1, nextRound);
            break;
        case "crewBonus": {
            const crew = Object.values(input.crew?.[shipId] ?? {}).flat();
            const waiting = [...new Set(crew)].filter(id => id !== actorId && !(next.actedThisRound[id] > 0));
            for (const id of waiting) mod(id, "skill", 1, thisRound);
            break;
        }
        case "forceTacticReveal":
            mod(targetId, "revealTactic", 1, { expiresAfterRound: round + 1 });
            mod(targetId, "firstVsTarget", 2, nextRound);
            if (spent) mod(targetId, "firstVsTarget", 2, nextRound);
            break;
        case "hardDCForEnemy":
            mod(targetId, "enemyHardDC", 1, nextRound);
            mod(targetId, "enemySkill", spent ? -3 : -1, nextRound);
            break;
        case "gunnerBonus":
            for (const ally of allies) mod(`${ally}|${targetId}`, "allyVsTarget", 3, thisRound);
            break;
        case "ownDCHard":
            mod(shipId, "ownDCHard", 1, nextRound);
            if (spent) mod(allyId, "freePatchHull", 1, thisRound);
            break;
        case "searchBonus":
            mod(targetId, "skillVsTarget", 1, thisRound);
            break;
        case "extraHitIfHit":
            mod(targetId, "extraHitIfHit", 1, thisRound);
            break;
        case "clearTakeCover": {
            const ship = next.ships[targetId];
            next = { ...next, ships: { ...next.ships, [targetId]: { ...ship, flags: ship.flags.filter(f => f !== "takeCover") } } };
            break;
        }
        default:
            break;
    }

    if (spent && RESOLVE_SUCCESS_ACTIONS.has(actionKey)) {
        next = addSuccesses(next, targetId, 1);
        gained += 1;
    }
    if (spent) effects.push({ kind: "spendResolve", target: actorId, value: 1 });

    return { state: next, effects, success, successes: gained };
}

/**
 * Runs the Resolve phase for the crew action effects. Applies threshold changes, turns successes into
 * hits, adds Target System's extra hit, and finds the ships that are out.
 * @param {object} state
 * @param {Record<string, {threshold: number, hpValue: number, upgrades?: Record<string, number>}>} ships Each ship's
 *   derived threshold and remaining HP, and its installed upgrades (for Ablative Plating).
 * @param {number} round
 * @returns {{state: object, hits: Record<string, number>, hp: Record<string, number>, out: string[], ended: "pcWin"|"pcLoss"|null}}
 */
export function resolveNarrativeRound(state, ships, round) {
    const statsById = {};
    const hpById = {};
    for (const id of Object.keys(state.ships)) {
        const threshold = (ships[id]?.threshold ?? 1) + modifiersFor(state, id, "thresholdDelta", round);
        const hp = Math.max(0, ships[id]?.hpValue ?? 0);
        statsById[id] = { threshold: Math.max(1, threshold), hp };
        hpById[id] = hp;
    }
    const extra = {};
    for (const id of Object.keys(state.ships)) extra[id] = modifiersFor(state, id, "extraHitIfHit", round);

    const result = resolveRound(state, statsById, hpById, round);
    let next = { ...result.state, ships: { ...result.state.ships } };
    const hits = {};
    const hp = {};
    const out = [];
    for (const id of Object.keys(next.ships)) {
        const taken = result.hits[id] ?? 0;
        // Target System counts hits from tactics and crew actions earlier in the round too.
        const hitBefore = (state.ships[id].hitsThisRound ?? 0) > 0;
        const total = taken > 0 || hitBefore ? taken + extra[id] : 0;
        // Ablative Plating ignores the first hit a PC ship takes in the combat.
        const absorbed = next.ships[id].side === "pc" ? absorbHit(next, id, total, ships[id]?.upgrades) : { state: next, hits: total };
        next = { ...absorbed.state, ships: next.ships };
        hits[id] = absorbed.hits;
        hp[id] = Math.max(0, hpById[id] - hits[id]);
        const ship = next.ships[id];
        if (hp[id] === 0 && !ship.flags.includes("out")) {
            next.ships[id] = { ...ship, flags: [...ship.flags, "out"] };
            out.push(id);
        }
    }
    const sideOut = side => {
        const ids = Object.keys(next.ships).filter(id => next.ships[id].side === side);
        return ids.length > 0 && ids.every(id => hp[id] === 0);
    };
    let ended = null;
    if (sideOut("pc")) ended = "pcLoss";
    else if (sideOut("enemy")) ended = "pcWin";
    return { state: next, hits, hp, out, ended };
}
