import { describe, expect, it } from "vitest";
import { BURNING_FAMILY, attemptBonus, burningDC, endCheckFor, isCheckDue, recordAttempt, startEndCheck } from "./condition-end-check.js";

const IDS = { saves: { fort: "", reflex: "", will: "" }, skills: { med: "", acr: "" } };

describe("endCheckFor", () => {
    it("gives the Burning family a Reflex save at the end of the turn", () => {
        for (const condition of BURNING_FAMILY) {
            expect(endCheckFor(condition, null)).toMatchObject({ kind: "save", id: "reflex", dc: null, timing: "turnEnd", consecutiveBonus: 2, smotherBonus: 4 });
        }
    });

    it("keeps the attempts stored on a Burning-family condition", () => {
        expect(endCheckFor("burning", { attempts: 2, lastAttemptRound: 4 })).toMatchObject({ attempts: 2, lastAttemptRound: 4, id: "reflex" });
    });

    it("gives Bleeding a DC 15 Medicine check made on demand", () => {
        expect(endCheckFor("bleeding", null)).toMatchObject({ kind: "skill", id: "med", dc: 15, timing: "onDemand" });
    });

    it("returns the stored check for any other condition", () => {
        const stored = { kind: "save", id: "will", dc: 15, timing: "turnEnd", attempts: 0, lastAttemptRound: null, consecutiveBonus: 0, smotherBonus: 0 };
        expect(endCheckFor("stunned", stored)).toEqual(stored);
    });

    it("returns null for a condition with no check", () => {
        expect(endCheckFor("stunned", null)).toBeNull();
    });
});

describe("startEndCheck", () => {
    it("builds a save at the end of the turn", () => {
        expect(startEndCheck({ kind: "save", id: "will", dc: 15 }, IDS)).toEqual({
            kind: "save", id: "will", dc: 15, timing: "turnEnd", attempts: 0, lastAttemptRound: null, consecutiveBonus: 0, smotherBonus: 0
        });
    });

    it("refuses a save the system does not have", () => {
        expect(startEndCheck({ kind: "save", id: "luck", dc: 15 }, IDS)).toBeNull();
    });

    it("refuses a skill id under the saves table", () => {
        expect(startEndCheck({ kind: "save", id: "med", dc: 15 }, IDS)).toBeNull();
    });

    it("refuses a blank, zero or fractional DC", () => {
        expect(startEndCheck({ kind: "save", id: "will", dc: null }, IDS)).toBeNull();
        expect(startEndCheck({ kind: "save", id: "will", dc: 0 }, IDS)).toBeNull();
        expect(startEndCheck({ kind: "save", id: "will", dc: 12.5 }, IDS)).toBeNull();
    });
});

describe("burningDC", () => {
    it("adds the damage taken this round to 10", () => {
        expect(burningDC({ round: 3, amount: 4 }, 3)).toBe(14);
    });

    it("is 10 when the stored damage belongs to another round", () => {
        expect(burningDC({ round: 2, amount: 4 }, 3)).toBe(10);
    });

    it("is 10 when no damage was stored", () => {
        expect(burningDC(null, 3)).toBe(10);
    });
});

describe("attemptBonus", () => {
    const burning = endCheckFor("burning", null);

    it("is +0 for the first attempt", () => {
        expect(attemptBonus(burning, 3, { smother: false })).toBe(0);
    });

    it("adds 2 for each attempt in consecutive rounds", () => {
        expect(attemptBonus({ ...burning, attempts: 2, lastAttemptRound: 2 }, 3, { smother: false })).toBe(4);
    });

    it("counts an attempt earlier in the same round", () => {
        expect(attemptBonus({ ...burning, attempts: 1, lastAttemptRound: 3 }, 3, { smother: false })).toBe(2);
    });

    it("drops back to +0 when a round passed without an attempt", () => {
        expect(attemptBonus({ ...burning, attempts: 2, lastAttemptRound: 1 }, 3, { smother: false })).toBe(0);
    });

    it("adds 4 for smothering the fire", () => {
        expect(attemptBonus({ ...burning, attempts: 1, lastAttemptRound: 2 }, 3, { smother: true })).toBe(6);
    });

    it("gives a check without a consecutive bonus nothing extra", () => {
        const will = startEndCheck({ kind: "save", id: "will", dc: 15 }, IDS);
        expect(attemptBonus({ ...will, attempts: 3, lastAttemptRound: 2 }, 3, { smother: true })).toBe(0);
    });

    it("gives no consecutive bonus outside combat", () => {
        expect(attemptBonus({ ...burning, attempts: 2, lastAttemptRound: null }, null, { smother: false })).toBe(0);
    });
});

describe("recordAttempt", () => {
    const burning = endCheckFor("burning", null);

    it("ends the condition on a success", () => {
        expect(recordAttempt(burning, 3, true)).toBeNull();
    });

    it("counts a failed attempt", () => {
        expect(recordAttempt(burning, 3, false)).toMatchObject({ attempts: 1, lastAttemptRound: 3 });
    });

    it("continues the run from the round before", () => {
        expect(recordAttempt({ ...burning, attempts: 1, lastAttemptRound: 2 }, 3, false)).toMatchObject({ attempts: 2, lastAttemptRound: 3 });
    });

    it("does not count a second attempt in the same round twice", () => {
        expect(recordAttempt({ ...burning, attempts: 1, lastAttemptRound: 3 }, 3, false)).toMatchObject({ attempts: 1, lastAttemptRound: 3 });
    });

    it("starts a new run after a round without an attempt", () => {
        expect(recordAttempt({ ...burning, attempts: 3, lastAttemptRound: 1 }, 3, false)).toMatchObject({ attempts: 1, lastAttemptRound: 3 });
    });
});

describe("isCheckDue", () => {
    it("is due at the end of the turn for a turn-end check", () => {
        expect(isCheckDue(endCheckFor("burning", null))).toBe(true);
    });

    it("is never due at the end of the turn for an on-demand check", () => {
        expect(isCheckDue(endCheckFor("bleeding", null))).toBe(false);
    });

    it("is not due without a check", () => {
        expect(isCheckDue(null)).toBe(false);
    });
});
