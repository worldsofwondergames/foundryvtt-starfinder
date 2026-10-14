import { describe, expect, it } from "vitest";
import { BURNING_FAMILY, attemptBonus, attemptRound, burningDC, checkSucceeds, endCheckFor, isCheckDue, recordAttempt, startEndCheck } from "./condition-end-check.js";

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
            kind: "save",
            id: "will",
            dc: 15,
            timing: "turnEnd",
            fullAction: false,
            attempts: 0,
            totalAttempts: 0,
            lastAttemptRound: null,
            consecutiveBonus: 0,
            cumulativeBonus: 0,
            smotherBonus: 0
        });
    });

    it("builds a skill check from the skills table", () => {
        expect(startEndCheck({ kind: "skill", id: "acr", dc: 20 }, IDS)).toMatchObject({ kind: "skill", id: "acr", dc: 20 });
    });

    it("refuses a save the system does not have", () => {
        expect(startEndCheck({ kind: "save", id: "luck", dc: 15 }, IDS)).toBeNull();
    });

    it("refuses a skill id under the saves table", () => {
        expect(startEndCheck({ kind: "save", id: "med", dc: 15 }, IDS)).toBeNull();
    });

    it("offers the save at the start of the turn or the end of the round when asked", () => {
        expect(startEndCheck({ kind: "save", id: "will", dc: 15, timing: "turnStart" }, IDS)).toMatchObject({ timing: "turnStart" });
        expect(startEndCheck({ kind: "save", id: "will", dc: 15, timing: "roundEnd" }, IDS)).toMatchObject({ timing: "roundEnd" });
    });

    it("refuses a timing the system does not offer", () => {
        expect(startEndCheck({ kind: "save", id: "will", dc: 15, timing: "onDemand" }, IDS)).toBeNull();
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

    it("is due only at the moment the check was set for", () => {
        const atStart = startEndCheck({ kind: "save", id: "will", dc: 15, timing: "turnStart" }, IDS);
        expect(isCheckDue(atStart, "turnStart")).toBe(true);
        expect(isCheckDue(atStart, "turnEnd")).toBe(false);
        expect(isCheckDue(atStart, "roundEnd")).toBe(false);
    });
});

describe("checkSucceeds", () => {
    const save = { kind: "save" };
    const skill = { kind: "skill" };

    it("succeeds when the total meets the DC", () => {
        expect(checkSucceeds(save, { total: 15, dc: 15, natural: 10 })).toBe(true);
        expect(checkSucceeds(skill, { total: 15, dc: 15, natural: 10 })).toBe(true);
    });

    it("fails when the total is below the DC", () => {
        expect(checkSucceeds(save, { total: 14, dc: 15, natural: 10 })).toBe(false);
        expect(checkSucceeds(skill, { total: 14, dc: 15, natural: 10 })).toBe(false);
    });

    it("fails a save on a natural 1 whatever the total", () => {
        expect(checkSucceeds(save, { total: 20, dc: 15, natural: 1 })).toBe(false);
    });

    it("passes a save on a natural 20 whatever the total", () => {
        expect(checkSucceeds(save, { total: 22, dc: 30, natural: 20 })).toBe(true);
    });

    it("judges a skill check by its total alone, even on a natural 1 or 20", () => {
        expect(checkSucceeds(skill, { total: 16, dc: 15, natural: 1 })).toBe(true);
        expect(checkSucceeds(skill, { total: 22, dc: 30, natural: 20 })).toBe(false);
    });
});

describe("attemptRound", () => {
    it("counts the end-of-turn save in the round the card was posted for", () => {
        expect(attemptRound({ smother: false, cardRound: 3, currentRound: 4 })).toBe(3);
    });

    it("counts smothering in the round it is done", () => {
        expect(attemptRound({ smother: true, cardRound: 3, currentRound: 4 })).toBe(4);
    });

    it("is null outside combat", () => {
        expect(attemptRound({ smother: false, cardRound: null, currentRound: null })).toBeNull();
    });
});

describe("cumulative bonus", () => {
    const transmogrification = () => startEndCheck({ kind: "save", id: "fort", dc: 18, timing: "turnEnd", cumulativeBonus: 1 }, IDS);

    it("stores a bonus per attempt set when the condition is applied", () => {
        expect(transmogrification()).toMatchObject({ cumulativeBonus: 1, totalAttempts: 0 });
    });

    it("refuses a negative or fractional bonus per attempt", () => {
        expect(startEndCheck({ kind: "save", id: "fort", dc: 18, cumulativeBonus: -1 }, IDS)).toBeNull();
        expect(startEndCheck({ kind: "save", id: "fort", dc: 18, cumulativeBonus: 1.5 }, IDS)).toBeNull();
    });

    it("adds the bonus once for each earlier failed attempt", () => {
        expect(attemptBonus({ ...transmogrification(), totalAttempts: 3, lastAttemptRound: 4 }, 5, { smother: false })).toBe(3);
    });

    it("keeps the bonus after a round without an attempt", () => {
        expect(attemptBonus({ ...transmogrification(), totalAttempts: 3, lastAttemptRound: 1 }, 5, { smother: false })).toBe(3);
    });

    it("counts each failed attempt, once per round", () => {
        const once = recordAttempt(transmogrification(), 2, false);
        expect(once.totalAttempts).toBe(1);
        expect(recordAttempt(once, 2, false).totalAttempts).toBe(1);
        expect(recordAttempt(once, 5, false).totalAttempts).toBe(2);
    });
});

describe("full action", () => {
    it("offers a full-action save at the start of the creature's turn", () => {
        const hold = startEndCheck({ kind: "save", id: "will", dc: 16, timing: "fullAction" }, IDS);
        expect(hold).toMatchObject({ timing: "turnStart", fullAction: true });
        expect(isCheckDue(hold, "turnStart")).toBe(true);
    });

    it("marks other saves as costing no action", () => {
        expect(startEndCheck({ kind: "save", id: "will", dc: 16, timing: "turnEnd" }, IDS).fullAction).toBe(false);
    });
});
