import { describe, expect, it } from "vitest";
import { NARRATIVE_UPGRADES, absorbHit, hasUpgrade, useOnce, virtualIntelligenceBonus } from "./upgrades.js";
import { initialState } from "./state.js";
import { endOfRound } from "./round-end.js";
import { applyTactic, chooseTactic } from "./tactics.js";

const SHIPS = [{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }];
const KEYS = ["ablativePlating",
    "displacementMantle",
    "driftEngineUpgrade",
    "expansionBay",
    "mineLayer",
    "navScramModule",
    "quantumDefender",
    "trackingWeapons",
    "tractorBeam",
    "virtualIntelligence"];

describe("NARRATIVE_UPGRADES", () => {
    it("has the 10 book upgrades, each with a count limit, a once-per-combat flag and a tier", () => {
        expect(Object.keys(NARRATIVE_UPGRADES).sort()).toEqual([...KEYS].sort());
        for (const data of Object.values(NARRATIVE_UPGRADES)) {
            expect(Object.keys(data).sort()).toEqual(["maxCount", "minTier", "oncePerCombat"]);
            expect(data.minTier).toBe(0);
        }
    });
    it("caps Drift Engine Upgrade at 4, leaves Expansion Bay unlimited and the rest at 1", () => {
        expect(NARRATIVE_UPGRADES.driftEngineUpgrade.maxCount).toBe(4);
        expect(NARRATIVE_UPGRADES.expansionBay.maxCount).toBeNull();
        const others = KEYS.filter(k => k !== "driftEngineUpgrade" && k !== "expansionBay");
        expect(others.every(k => NARRATIVE_UPGRADES[k].maxCount === 1)).toBe(true);
    });
    it("marks exactly the five button upgrades as once per combat", () => {
        const once = KEYS.filter(k => NARRATIVE_UPGRADES[k].oncePerCombat).sort();
        expect(once).toEqual(["displacementMantle", "mineLayer", "navScramModule", "quantumDefender", "trackingWeapons"]);
    });
});

describe("hasUpgrade", () => {
    it("is true only for a count of 1 or more", () => {
        expect(hasUpgrade({ tractorBeam: 1 }, "tractorBeam")).toBe(true);
        expect(hasUpgrade({ tractorBeam: 0 }, "tractorBeam")).toBe(false);
        expect(hasUpgrade({}, "tractorBeam")).toBe(false);
        expect(hasUpgrade(undefined, "tractorBeam")).toBe(false);
    });
});

describe("useOnce", () => {
    it("allows the first use and refuses the second", () => {
        const first = useOnce(initialState(SHIPS), "pc1", "mineLayer");
        expect(first.ok).toBe(true);
        expect(first.state.usedOnce.pc1).toEqual(["mineLayer"]);
        expect(useOnce(first.state, "pc1", "mineLayer").ok).toBe(false);
    });
    it("tracks each ship separately", () => {
        const state = useOnce(initialState(SHIPS), "pc1", "mineLayer").state;
        expect(useOnce(state, "e1", "mineLayer").ok).toBe(true);
    });
    it("refuses upgrades that are not once per combat and unknown keys", () => {
        expect(useOnce(initialState(SHIPS), "pc1", "expansionBay").ok).toBe(false);
        expect(useOnce(initialState(SHIPS), "pc1", "bogus").ok).toBe(false);
    });
    it("leaves its input untouched", () => {
        const state = initialState(SHIPS);
        useOnce(state, "pc1", "mineLayer");
        expect(state.usedOnce.pc1).toEqual([]);
    });
});

describe("absorbHit (Ablative Plating)", () => {
    const upgrades = { ablativePlating: 1 };
    it("cancels one hit the first time and not the second", () => {
        const first = absorbHit(initialState(SHIPS), "pc1", 1, upgrades);
        expect(first.hits).toBe(0);
        expect(first.state.usedOnce.pc1).toEqual(["ablativePlating"]);
        const second = absorbHit(first.state, "pc1", 1, upgrades);
        expect(second.hits).toBe(1);
        expect(second.state).toBe(first.state);
    });
    it("removes only one of several hits", () => {
        expect(absorbHit(initialState(SHIPS), "pc1", 3, upgrades).hits).toBe(2);
    });
    it("does not use up the plating when no hit lands", () => {
        const r = absorbHit(initialState(SHIPS), "pc1", 0, upgrades);
        expect(r.hits).toBe(0);
        expect(r.state.usedOnce.pc1).toEqual([]);
    });
    it("does nothing for a ship without the upgrade", () => {
        const state = initialState(SHIPS);
        expect(absorbHit(state, "pc1", 2, {})).toEqual({ state, hits: 2 });
        expect(absorbHit(state, "pc1", 2, { ablativePlating: 0 }).hits).toBe(2);
    });
    it("leaves its input untouched", () => {
        const state = initialState(SHIPS);
        absorbHit(state, "pc1", 1, upgrades);
        expect(state.usedOnce.pc1).toEqual([]);
    });
});

describe("virtualIntelligenceBonus", () => {
    it("is the ship's tier plus 3, flooring a fractional tier", () => {
        expect(virtualIntelligenceBonus(5)).toBe(8);
        expect(virtualIntelligenceBonus(0)).toBe(3);
        expect(virtualIntelligenceBonus(0.5)).toBe(3);
        expect(virtualIntelligenceBonus(1 / 3)).toBe(3);
    });
});

describe("Tractor Beam through endOfRound", () => {
    const fleeing = () => {
        const state = initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }, { id: "e2", side: "enemy" }]);
        const chosen = chooseTactic(state, "e1", "flee", null, 1);
        return applyTactic(chosen, { enemyId: "e1", tactic: "flee", targetId: null, dcs: {}, rolls: [] }, 1).state;
    };
    const hp = { pc1: 5, e1: 3, e2: 3 };
    it("keeps a fleeing enemy whose roll misses the Hard DC and clears its flag", () => {
        const r = endOfRound(fleeing(), hp, { tractorRolls: { e1: 14 }, tractorDC: 15 });
        expect(r.fled).toEqual([]);
        expect(r.held).toEqual(["e1"]);
        expect(r.state.ships.e1.flags).not.toContain("fleeing");
        expect(r.ended).toBeNull();
    });
    it("lets the enemy go when the roll meets the DC", () => {
        const r = endOfRound(fleeing(), hp, { tractorRolls: { e1: 15 }, tractorDC: 15 });
        expect(r.fled).toEqual(["e1"]);
        expect(r.held).toEqual([]);
    });
    it("lets the enemy go with no Tractor Beam", () => {
        expect(endOfRound(fleeing(), hp).fled).toEqual(["e1"]);
    });
    it("needs a roll for every fleeing enemy when a DC is set", () => {
        expect(() => endOfRound(fleeing(), hp, { tractorRolls: {}, tractorDC: 15 })).toThrow();
    });
});
