/**
 * The 10 PC starship upgrades from Starfinder Enhanced p. 183 and the rules that apply by themselves. Pure.
 * Ablative Plating, Tractor Beam, and Virtual Intelligence are automatic. The once-per-combat upgrades are
 * buttons on the sheet. Drift Engine Upgrade and Expansion Bay only record what is installed.
 *
 * Modifier kinds written here:
 *   displacementMantle  The PC ship's mantle is on for the round (target is the PC ship). applyTactic and
 *                       mantleCheckNeeded in tactics.js read it.
 *   mines               A Mine Layer check the enemy ship makes next round before its tactic. The value is the
 *                       PC ship's Average DC. Removed by resolveMines.
 *   enemySkill          -2 from Nav-Scram Module, for 1d4 rounds starting with the round it is used.
 */
import { NARRATIVE_CREW_ACTIONS } from "./crew-actions.js";
import { addModifier } from "./state.js";

/**
 * maxCount is how many of the upgrade a ship can have (null for no limit). oncePerCombat upgrades are used once
 * per combat. minTier is 0 for all: the book mentions tier requirements but lists none.
 */
export const NARRATIVE_UPGRADES = {
    ablativePlating: { maxCount: 1, oncePerCombat: false, minTier: 0 },
    displacementMantle: { maxCount: 1, oncePerCombat: true, minTier: 0 },
    driftEngineUpgrade: { maxCount: 4, oncePerCombat: false, minTier: 0 },
    expansionBay: { maxCount: null, oncePerCombat: false, minTier: 0 },
    mineLayer: { maxCount: 1, oncePerCombat: true, minTier: 0 },
    navScramModule: { maxCount: 1, oncePerCombat: true, minTier: 0 },
    quantumDefender: { maxCount: 1, oncePerCombat: true, minTier: 0 },
    trackingWeapons: { maxCount: 1, oncePerCombat: true, minTier: 0 },
    tractorBeam: { maxCount: 1, oncePerCombat: false, minTier: 0 },
    virtualIntelligence: { maxCount: 1, oncePerCombat: false, minTier: 0 }
};

/**
 * @param {Record<string, number>|undefined} upgrades The ship's system.narrative.upgrades.
 * @param {string} key
 * @returns {boolean}
 */
export function hasUpgrade(upgrades, key) {
    return (upgrades?.[key] ?? 0) >= 1;
}

function withUsed(state, shipId, key) {
    const usedOnce = Object.fromEntries(Object.entries(state.usedOnce ?? {}).map(([id, list]) => [id, [...list]]));
    usedOnce[shipId] = [...(usedOnce[shipId] ?? []), key];
    return { ...state, usedOnce };
}

/**
 * Records a once-per-combat use. Refused when the key is not a once-per-combat upgrade or was already used.
 * @param {object} state
 * @param {string} shipId
 * @param {string} key
 * @returns {{state: object, ok: boolean}}
 */
export function useOnce(state, shipId, key) {
    if (!NARRATIVE_UPGRADES[key]?.oncePerCombat) return { state, ok: false };
    if ((state.usedOnce?.[shipId] ?? []).includes(key)) return { state, ok: false };
    return { state: withUsed(state, shipId, key), ok: true };
}

/**
 * Ablative Plating: the ship ignores the first hit it takes in a combat. Removes one hit the first time
 * hits is above 0 for a ship with the upgrade, and records it in usedOnce.
 * @param {object} state
 * @param {string} shipId
 * @param {number} hits
 * @param {Record<string, number>|undefined} upgrades The ship's system.narrative.upgrades.
 * @returns {{state: object, hits: number}}
 */
export function absorbHit(state, shipId, hits, upgrades) {
    if (!(hits > 0) || !hasUpgrade(upgrades, "ablativePlating")) return { state, hits };
    if ((state.usedOnce?.[shipId] ?? []).includes("ablativePlating")) return { state, hits };
    return { state: withUsed(state, shipId, "ablativePlating"), hits: hits - 1 };
}

/**
 * Virtual Intelligence: the Provide Aid bonus is the ship's tier + 3. A fractional tier counts as its floor.
 * @param {number} tier
 * @returns {number}
 */
export function virtualIntelligenceBonus(tier) {
    return Math.floor(tier) + 3;
}

/**
 * A count the sheet may save for an upgrade: a whole number from 0 to the upgrade's maxCount. Unknown keys give 0.
 * @param {string} key
 * @param {*} n
 * @returns {number}
 */
export function clampUpgradeCount(key, n) {
    const data = NARRATIVE_UPGRADES[key];
    if (!data) return 0;
    const count = Math.max(0, Math.floor(Number(n) || 0));
    return data.maxCount === null ? count : Math.min(data.maxCount, count);
}

/**
 * Rows for the upgrades checklist on the PC sheet. Upgrades with a count above 1 get a number input.
 * @param {Record<string, number>|undefined} upgrades
 * @returns {Array<{key: string, count: number, max: number|null, numeric: boolean, checked: boolean}>}
 */
export function upgradeChecklist(upgrades) {
    return Object.entries(NARRATIVE_UPGRADES).map(([key, data]) => {
        const count = upgrades?.[key] ?? 0;
        return { key, count, max: data.maxCount, numeric: data.maxCount !== 1, checked: count >= 1 };
    });
}

/** The once-per-combat upgrade with its own button. The others are used from the crew action and tactic flows. */
const BUTTON_UPGRADE = "displacementMantle";

/**
 * The once-per-combat upgrades a ship has installed, for the sheet's buttons.
 * @param {Record<string, number>|undefined} upgrades
 * @param {string[]} used The ship's usedOnce list.
 * @returns {Array<{key: string, used: boolean, clickable: boolean}>}
 */
export function onceButtons(upgrades, used) {
    return Object.keys(NARRATIVE_UPGRADES)
        .filter(key => NARRATIVE_UPGRADES[key].oncePerCombat && hasUpgrade(upgrades, key))
        .map(key => {
            const isUsed = (used ?? []).includes(key);
            return { key, used: isUsed, clickable: key === BUTTON_UPGRADE && !isUsed };
        });
}

function isSide(state, id, side) {
    return state.ships?.[id]?.side === side;
}

function upgradeProblem(state, shipId, key, upgrades) {
    if (!hasUpgrade(upgrades, key)) return "noUpgrade";
    if ((state.usedOnce?.[shipId] ?? []).includes(key)) return "upgradeUsed";
    return null;
}

/**
 * Displacement Mantle: a d100 roll of 20 or less makes the tactic fail.
 * @param {number} roll
 * @returns {boolean}
 */
export function mantleBlocks(roll) {
    return roll <= 20;
}

/**
 * Turns on the Displacement Mantle for the rest of the round. Uses it up for the combat.
 * @param {object} state
 * @param {string} shipId A PC ship.
 * @param {Record<string, number>|undefined} upgrades The ship's installed upgrades.
 * @param {number} round
 * @returns {{state: object, ok: boolean, reason?: string}}
 */
export function activateMantle(state, shipId, upgrades, round) {
    if (!isSide(state, shipId, "pc")) return { state, ok: false, reason: "wrongSide" };
    const problem = upgradeProblem(state, shipId, "displacementMantle", upgrades);
    if (problem) return { state, ok: false, reason: problem };
    const used = useOnce(state, shipId, "displacementMantle").state;
    return { state: addModifier(used, { target: shipId, kind: "displacementMantle", value: 1, expiresAfterRound: round }), ok: true };
}

/**
 * Nav-Scram Module: the last round of the penalty. The round it is used in is the first of the 1d4.
 * @param {number} round
 * @param {number} roll The 1d4 result.
 * @returns {number}
 */
export function navScramExpiry(round, roll) {
    return round + roll - 1;
}

function trackingProblem(state, { shipId, role, actionKey, targetId }, upgrades) {
    if (role !== "gunner" || NARRATIVE_CREW_ACTIONS[actionKey]?.dcOf !== "target" || !isSide(state, targetId, "enemy")) {
        return "noTrackingWeapons";
    }
    return upgradeProblem(state, shipId, "trackingWeapons", upgrades);
}

/**
 * Whether a gunner may reroll a check with Tracking Weapons: a failed check by a gunner, for an action that
 * targets an enemy ship, on a ship that has the upgrade and has not used it this combat.
 * @param {object} state
 * @param {{shipId: string, role: string, actionKey: string, targetId?: string, success: boolean}} input
 * @param {Record<string, number>|undefined} upgrades
 * @returns {boolean}
 */
export function canUseTrackingWeapons(state, input, upgrades) {
    if (input.success) return false;
    return !trackingProblem(state, input, upgrades);
}

/**
 * The upgrades a crew member uses with an action: Mine Layer and Nav-Scram Module with an action that targets an
 * enemy ship, and Tracking Weapons for a gunner's reroll. Each is used up for the combat. When any is refused,
 * the state is returned unchanged.
 * @param {object} state
 * @param {object} input
 * @param {string} input.shipId The crew member's ship.
 * @param {string} [input.targetId] The enemy ship the action targets.
 * @param {Record<string, number>|undefined} input.upgrades The ship's installed upgrades.
 * @param {number} [input.averageDC] The ship's Average DC, for Mine Layer.
 * @param {string} [input.role] The role the crew member acts in, for Tracking Weapons.
 * @param {string} [input.actionKey] For Tracking Weapons.
 * @param {boolean} [input.mineLayer]
 * @param {boolean} [input.navScram]
 * @param {number} [input.navScramRoll] The 1d4 for Nav-Scram Module.
 * @param {boolean} [input.trackingWeapons]
 * @param {number} round
 * @returns {{state: object, ok: boolean, reason?: string}}
 */
export function applyActionUpgrades(state, input, round) {
    const { shipId, targetId, upgrades } = input;
    const refuse = reason => ({ state, ok: false, reason });
    let next = state;
    if (input.mineLayer || input.navScram) {
        // Only an action that targets an enemy ship can carry them. Negate Take Cover targets a ship that can't be
        // targeted, so it can't.
        if (NARRATIVE_CREW_ACTIONS[input.actionKey]?.dcOf !== "target" || input.actionKey === "clearTakeCover") {
            return refuse("noEnemyAction");
        }
        if (!isSide(state, targetId, "enemy")) return refuse("badTarget");
        if (state.ships[targetId].flags?.includes("takeCover")) return refuse("takeCover");
    }
    if (input.mineLayer) {
        const problem = upgradeProblem(next, shipId, "mineLayer", upgrades);
        if (problem) return refuse(problem);
        if (!Number.isFinite(Number(input.averageDC)) || input.averageDC === null || input.averageDC === undefined) {
            return refuse("noAverageDC");
        }
        next = useOnce(next, shipId, "mineLayer").state;
        next = addModifier(next, { target: targetId, kind: "mines", value: Number(input.averageDC), expiresAfterRound: round + 1, fromRound: round + 1 });
    }
    if (input.navScram) {
        const roll = Number(input.navScramRoll);
        if (!Number.isInteger(roll) || roll < 1 || roll > 4) return refuse("badRoll");
        const problem = upgradeProblem(next, shipId, "navScramModule", upgrades);
        if (problem) return refuse(problem);
        next = useOnce(next, shipId, "navScramModule").state;
        next = addModifier(next, { target: targetId, kind: "enemySkill", value: -2, expiresAfterRound: navScramExpiry(round, roll) });
    }
    if (input.trackingWeapons) {
        const problem = trackingProblem(next, input, upgrades);
        if (problem) return refuse(problem);
        next = useOnce(next, shipId, "trackingWeapons").state;
    }
    return { state: next, ok: true };
}

function activeMines(state, enemyId, round) {
    return state.modifiers.find(m => m.target === enemyId && m.kind === "mines"
        && m.expiresAfterRound >= round && (m.fromRound ?? 0) <= round);
}

/**
 * The Mine Layer check an enemy ship must make this round before it chooses a tactic, or null.
 * @param {object} state
 * @param {string} enemyId
 * @param {number} round
 * @returns {{dc: number}|null}
 */
export function pendingMines(state, enemyId, round) {
    const mines = activeMines(state, enemyId, round);
    return mines ? { dc: mines.value } : null;
}

/**
 * Applies an enemy ship's Mine Layer check and clears those mines. Below the DC, the ship takes 1 hit.
 * @param {object} state
 * @param {string} enemyId
 * @param {number} total d20 + the ship's skill bonus + enemyCheckBonus.
 * @param {number} round
 * @returns {{state: object, effects: Array<object>, success?: boolean, dc?: number}}
 */
export function resolveMines(state, enemyId, total, round) {
    const mines = activeMines(state, enemyId, round);
    if (!mines) return { state, effects: [{ kind: "rejected", reason: "noMines" }] };
    const success = total >= mines.value;
    let next = { ...state, modifiers: state.modifiers.filter(m => m !== mines) };
    const effects = [];
    if (!success) {
        effects.push({ kind: "hit", target: enemyId, value: 1 });
        const ship = next.ships[enemyId];
        next = { ...next, ships: { ...next.ships, [enemyId]: { ...ship, hitsThisRound: (ship.hitsThisRound ?? 0) + 1 } } };
    }
    return { state: next, effects, success, dc: mines.value };
}

/**
 * The PC ship that can use Quantum Defender against a tactic's result: one that takes a hit from it and has
 * the upgrade unused, and whose Ablative Plating, if unused, does not take every hit. Null when there is none.
 * @param {object} state
 * @param {Array<object>} effects The tactic's effects.
 * @param {Record<string, Record<string, number>|undefined>} upgradesById Each ship's installed upgrades.
 * @returns {string|null}
 */
export function quantumDefenderShip(state, effects, upgradesById) {
    const hitsOn = id => effects.filter(e => e.kind === "hit" && e.target === id).reduce((sum, e) => sum + e.value, 0);
    const hit = effects.find(e => e.kind === "hit" && e.value > 0 && isSide(state, e.target, "pc")
        && !upgradeProblem(state, e.target, "quantumDefender", upgradesById?.[e.target])
        // Ablative Plating that will take the only hit leaves nothing to reroll against.
        && absorbHit(state, e.target, hitsOn(e.target), upgradesById?.[e.target]).hits > 0);
    return hit?.target ?? null;
}
