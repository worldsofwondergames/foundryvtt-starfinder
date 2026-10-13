import { describe, expect, it } from "vitest";
import { TIMED_CONDITIONS, keepsOwnTimer, startConditionTimer, tickConditionTimer } from "./condition-timer.js";

describe("TIMED_CONDITIONS", () => {
    it("leaves out conditions that end on something other than time", () => {
        expect(TIMED_CONDITIONS).toContain("stunned");
        for (const condition of ["dead", "dying", "stable", "encumbered", "overburdened", "broken", "burning", "bleeding", "prone", "grappled", "pinned", "helpless"]) {
            expect(TIMED_CONDITIONS).not.toContain(condition);
        }
    });
});

describe("startConditionTimer", () => {
    it("counts the given rounds", () => {
        expect(startConditionTimer(3, false)).toEqual({ rounds: 3, skipTurnEnd: false });
    });

    it("skips the end of the turn it was applied in when that is the creature's own turn", () => {
        expect(startConditionTimer(1, true)).toEqual({ rounds: 1, skipTurnEnd: true });
    });

    it("gives no timer for a blank, zero or fractional answer", () => {
        expect(startConditionTimer(null, false)).toBeNull();
        expect(startConditionTimer(0, false)).toBeNull();
        expect(startConditionTimer(1.5, false)).toBeNull();
    });
});

describe("tickConditionTimer", () => {
    it("counts down one round at the end of the creature's turn", () => {
        expect(tickConditionTimer({ rounds: 3, skipTurnEnd: false })).toEqual({ timer: { rounds: 2, skipTurnEnd: false }, expired: false });
    });

    it("ends the condition when the last round is used", () => {
        expect(tickConditionTimer({ rounds: 1, skipTurnEnd: false })).toEqual({ timer: null, expired: true });
    });

    it("does not count the turn the condition was applied in", () => {
        expect(tickConditionTimer({ rounds: 1, skipTurnEnd: true })).toEqual({ timer: { rounds: 1, skipTurnEnd: false }, expired: false });
    });

    it("leaves a condition with no timer alone", () => {
        expect(tickConditionTimer(undefined)).toEqual({ timer: null, expired: false });
    });
});

describe("keepsOwnTimer", () => {
    it("keeps flat-footed that has rounds of its own left", () => {
        expect(keepsOwnTimer({ rounds: 2, skipTurnEnd: false })).toBe(true);
    });

    it("lets flat-footed with no timer go with the condition that caused it", () => {
        expect(keepsOwnTimer(null)).toBe(false);
    });
});
