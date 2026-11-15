import { describe, expect, it } from "vitest";
import { resolveNarrativeRound } from "./apply-crew-action.js";
import { addModifier, addSuccesses, initialState } from "./state.js";
import { applyTactic, chooseTactic } from "./tactics.js";
import { endOfRound, missedResolveRound } from "./round-end.js";

const ROUND = 3;
const DCS = { average: 20, hard: 25 };

function withFlags(state, id, flags) {
    return { ...state, ships: { ...state.ships, [id]: { ...state.ships[id], flags } } };
}

/** Plays a tactic the way the GM's dialog does. */
function play(state, enemyId, tactic) {
    const chosen = chooseTactic(state, enemyId, tactic, null, ROUND);
    return applyTactic(chosen, { enemyId, tactic, dcs: DCS }, ROUND).state;
}

/** Resolve then the end of the round, the order the GM's client runs them in. */
function resolve(state, ships) {
    const result = resolveNarrativeRound(state, ships, ROUND);
    return { result, end: endOfRound(result.state, result.hp) };
}

describe("endOfRound", () => {
    it("removes a fleeing enemy with HP left and ends the combat when it was the last enemy", () => {
        const state = play(initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }]), "e1", "flee");
        const { end } = resolve(state, { pc1: { threshold: 2, hpValue: 5 }, e1: { threshold: 2, hpValue: 3 } });
        expect(end.fled).toEqual(["e1"]);
        expect(end.state.ships.e1).toBeUndefined();
        expect(end.ended).toBe("fled");
    });

    it("keeps the combat going when another enemy is still fighting", () => {
        const start = initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }, { id: "e2", side: "enemy" }]);
        const { end } = resolve(play(start, "e1", "flee"), {
            pc1: { threshold: 2, hpValue: 5 }, e1: { threshold: 2, hpValue: 3 }, e2: { threshold: 2, hpValue: 3 }
        });
        expect(end.fled).toEqual(["e1"]);
        expect(Object.keys(end.state.ships)).toEqual(["pc1", "e2"]);
        expect(end.ended).toBeNull();
    });

    it("a fleeing enemy knocked to 0 HP by this round's hits does not flee", () => {
        let state = play(initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }]), "e1", "flee");
        state = addSuccesses(state, "e1", 2);
        const { end } = resolve(state, { pc1: { threshold: 2, hpValue: 5 }, e1: { threshold: 2, hpValue: 1 } });
        expect(end.fled).toEqual([]);
        expect(end.state.ships.e1).toBeDefined();
        expect(end.ended).toBe("pcWin");
    });

    it("says fled when the last enemy flees and the others are already out", () => {
        const start = initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }, { id: "e2", side: "enemy" }]);
        const { end } = resolve(play(start, "e1", "flee"), {
            pc1: { threshold: 2, hpValue: 5 }, e1: { threshold: 2, hpValue: 3 }, e2: { threshold: 2, hpValue: 0 }
        });
        expect(end.ended).toBe("fled");
    });

    it("a PC loss wins over a flight", () => {
        const state = play(initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }]), "e1", "flee");
        const { end } = resolve(state, { pc1: { threshold: 2, hpValue: 0 }, e1: { threshold: 2, hpValue: 3 } });
        expect(end.ended).toBe("pcLoss");
    });

    it("drops the modifiers that target a ship that fled", () => {
        let state = play(initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }, { id: "e2", side: "enemy" }]), "e1", "flee");
        state = addModifier(state, { target: "e1", kind: "enemySkill", value: -2, expiresAfterRound: ROUND + 1, fromRound: ROUND + 1 });
        state = addModifier(state, { target: "e2", kind: "enemySkill", value: -2, expiresAfterRound: ROUND + 1, fromRound: ROUND + 1 });
        const { end } = resolve(state, {
            pc1: { threshold: 2, hpValue: 5 }, e1: { threshold: 2, hpValue: 3 }, e2: { threshold: 2, hpValue: 3 }
        });
        expect(end.state.modifiers.map(m => m.target)).toEqual(["e2"]);
        expect(end.state.usedOnce.e1).toBeUndefined();
    });

    it("clears Take Cover and keeps other flags", () => {
        const start = initialState([{ id: "pc1", side: "pc" }, { id: "e1", side: "enemy" }]);
        const state = withFlags(play(start, "e1", "takeCover"), "pc1", ["out"]);
        expect(state.ships.e1.flags).toContain("takeCover");
        const end = endOfRound(state, { pc1: 5, e1: 3 });
        expect(end.state.ships.e1.flags).toEqual([]);
        expect(end.state.ships.pc1.flags).toEqual(["out"]);
        expect(state.ships.e1.flags).toContain("takeCover");
    });
});

describe("missedResolveRound", () => {
    const base = { combatType: "narrativeStarship", isNewRound: true, direction: 1, oldRound: 2, resolvedRound: 1 };

    it("gives the old round when the round moved on from Enemy Tactics or Crew Actions before Resolve ran", () => {
        expect(missedResolveRound({ ...base, oldPhaseIndex: 1 })).toBe(2);
        expect(missedResolveRound({ ...base, oldPhaseIndex: 2 })).toBe(2);
    });

    it("is null when Resolve already ran for that round", () => {
        expect(missedResolveRound({ ...base, oldPhaseIndex: 2, resolvedRound: 2 })).toBeNull();
    });

    it("is null when the round moved on from Change Roles", () => {
        expect(missedResolveRound({ ...base, oldPhaseIndex: 0 })).toBeNull();
    });

    it("is null when the round moved on from Resolve", () => {
        expect(missedResolveRound({ ...base, oldPhaseIndex: 3 })).toBeNull();
    });

    it("is null when going back", () => {
        expect(missedResolveRound({ ...base, oldPhaseIndex: 2, direction: -1 })).toBeNull();
    });

    it("is null without a new round", () => {
        expect(missedResolveRound({ ...base, oldPhaseIndex: 2, isNewRound: false })).toBeNull();
    });

    it("is null in other combat types", () => {
        expect(missedResolveRound({ ...base, oldPhaseIndex: 2, combatType: "starship" })).toBeNull();
    });
});
