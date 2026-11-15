/**
 * The 10 PC starship upgrades from Starfinder Enhanced p. 183 and the rules that apply by themselves. Pure.
 * Ablative Plating, Tractor Beam, and Virtual Intelligence are automatic. The once-per-combat upgrades are
 * buttons on the sheet. Drift Engine Upgrade and Expansion Bay only record what is installed.
 */

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
