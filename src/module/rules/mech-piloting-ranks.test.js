import { describe, expect, it } from "vitest";
import { autotargetUpdate, pilotingRanksActive, pilotingRanksTurn } from "./mech-piloting-ranks.js";

describe("pilotingRanksTurn", () => {
    it("records the combat, round and turn Accurate Strikes was used on", () => {
        expect(pilotingRanksTurn({ id: "c1", started: true, round: 2, turn: 1 }))
            .toEqual({ combatId: "c1", round: 2, turn: 1 });
    });

    it("records nothing outside a started combat", () => {
        expect(pilotingRanksTurn({ id: "c1", started: false, round: 0, turn: 0 })).toBeNull();
    });
});

describe("pilotingRanksActive", () => {
    const armed = { source: "Accurate Strikes", turn: { combatId: "c1", round: 2, turn: 1 } };
    const combat = (round, turn) => ({ id: "c1", started: true, round, turn });

    it("applies for the rest of the round it was used in", () => {
        expect(pilotingRanksActive(armed, combat(2, 1))).toBe(true);
        expect(pilotingRanksActive(armed, combat(2, 3))).toBe(true);
    });

    it("applies in the next round up to the mech's turn", () => {
        expect(pilotingRanksActive(armed, combat(3, 0))).toBe(true);
    });

    it("runs out when the mech's turn comes around again", () => {
        expect(pilotingRanksActive(armed, combat(3, 1))).toBe(false);
        expect(pilotingRanksActive(armed, combat(4, 0))).toBe(false);
    });

    it("runs out when the combat ends or is a different one", () => {
        expect(pilotingRanksActive(armed, null)).toBe(false);
        expect(pilotingRanksActive(armed, { ...combat(2, 1), id: "c2" })).toBe(false);
    });

    it("applies outside combat until an attack spends it", () => {
        expect(pilotingRanksActive({ source: "Accurate Strikes", turn: null }, null)).toBe(true);
    });

    it("does not apply when nothing was used", () => {
        expect(pilotingRanksActive(null, combat(2, 1))).toBe(false);
    });
});

describe("autotargetUpdate", () => {
    const oldCopy = () => ({
        type: "mechAuxiliary",
        name: "Autotarget",
        system: { actions: [{ name: "Accurate Strikes", description: "For 1 round...", ppCost: 1, armsPilotingRanks: false }] }
    });

    it("marks Accurate Strikes on an old copy and keeps its cost", () => {
        const [action] = autotargetUpdate(oldCopy())["system.actions"];
        expect(action.armsPilotingRanks).toBe(true);
        expect(action.ppCost).toBe(1);
    });

    it("leaves a marked copy alone", () => {
        const item = oldCopy();
        item.system.actions = autotargetUpdate(item)["system.actions"];
        expect(autotargetUpdate(item)).toEqual({});
    });

    it("leaves other components alone", () => {
        expect(autotargetUpdate({ ...oldCopy(), name: "Thrusters" })).toEqual({});
    });
});
