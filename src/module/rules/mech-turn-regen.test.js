import { describe, expect, it } from "vitest";
import { isRegenDue, regeneratedPowerPoints, regeneratedShieldPoints } from "./mech-turn-regen.js";

/** A change of turn with a forward step, which is when regeneration is due. */
function turnChange({ direction = 1, isNewTurn = true, round = 2, lastRegenRound = null } = {}) {
    return { direction, isNewTurn, round, lastRegenRound };
}

describe("regeneratedPowerPoints", () => {
    it("regenerates the mech's Power Point regen", () => {
        expect(regeneratedPowerPoints({ value: 3, max: 9, regen: 4 })).toBe(7);
    });

    it("does not carry Power Points past the maximum", () => {
        expect(regeneratedPowerPoints({ value: 4, max: 5, regen: 3 })).toBe(5);
    });

    it("changes nothing for a mech already at full Power Points", () => {
        expect(regeneratedPowerPoints({ value: 5, max: 5, regen: 1 })).toBeNull();
    });

    it("changes nothing for a mech that regenerates none", () => {
        expect(regeneratedPowerPoints({ value: 1, max: 5, regen: 0 })).toBeNull();
    });

    it("halves the regeneration for a malfunctioning power core, rounding down", () => {
        expect(regeneratedPowerPoints({ value: 0, max: 9, regen: 5 }, 0.5)).toBe(2);
    });

    it("halves the regeneration before the maximum caps it", () => {
        expect(regeneratedPowerPoints({ value: 7, max: 9, regen: 5 }, 0.5)).toBe(9);
    });

    it("changes nothing for an inoperable power core", () => {
        expect(regeneratedPowerPoints({ value: 0, max: 9, regen: 4 }, 0)).toBeNull();
    });

    it("changes nothing when halving leaves nothing to regenerate", () => {
        expect(regeneratedPowerPoints({ value: 0, max: 9, regen: 1 }, 0.5)).toBeNull();
    });

    it("changes nothing when there are no Power Points to read", () => {
        expect(regeneratedPowerPoints()).toBeNull();
    });
});

describe("regeneratedShieldPoints", () => {
    it("regenerates the mech's tier", () => {
        expect(regeneratedShieldPoints({ value: 4, max: 20 }, 5)).toBe(9);
    });

    it("does not carry Shield Points past the maximum", () => {
        expect(regeneratedShieldPoints({ value: 18, max: 20 }, 5)).toBe(20);
    });

    it("changes nothing for a mech already at full Shield Points", () => {
        expect(regeneratedShieldPoints({ value: 20, max: 20 }, 5)).toBeNull();
    });

    it("changes nothing for a tier that recovers no shields", () => {
        expect(regeneratedShieldPoints({ value: 1, max: 20 }, 0)).toBeNull();
    });

    it("halves the regeneration for a malfunctioning power core, rounding down", () => {
        expect(regeneratedShieldPoints({ value: 0, max: 13 }, 5, 0.5)).toBe(2);
    });

    it("changes nothing for an inoperable power core", () => {
        expect(regeneratedShieldPoints({ value: 0, max: 13 }, 5, 0)).toBeNull();
    });
});

describe("isRegenDue", () => {
    it("regenerates when the turn changes", () => {
        expect(isRegenDue(turnChange())).toBe(true);
    });

    it("regenerates in the first round", () => {
        expect(isRegenDue(turnChange({ round: 1 }))).toBe(true);
    });

    it("skips a round this combatant has already regenerated in", () => {
        expect(isRegenDue(turnChange({ round: 4, lastRegenRound: 4 }))).toBe(false);
    });

    it("regenerates again once the combat reaches a later round", () => {
        expect(isRegenDue(turnChange({ round: 5, lastRegenRound: 4 }))).toBe(true);
    });

    it("skips a step backwards through the initiative order", () => {
        expect(isRegenDue(turnChange({ direction: -1 }))).toBe(false);
    });

    it("skips an update that changes no turn", () => {
        expect(isRegenDue(turnChange({ isNewTurn: false }))).toBe(false);
    });

    it("skips the start of a combat, which has no direction to move in", () => {
        expect(isRegenDue({ isNewTurn: true, round: 1 })).toBe(false);
    });
});
