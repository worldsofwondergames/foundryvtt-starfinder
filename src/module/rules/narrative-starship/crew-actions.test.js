import { describe, expect, test } from "vitest";
import {
    NARRATIVE_CREW_ACTIONS, RANGED_ATTACK_BONUS, actionsForRoles, dcFor, skillAllowed, successesFor
} from "./crew-actions.js";

const DCS = { average: 20, hard: 25 };

describe("NARRATIVE_CREW_ACTIONS", () => {
    test("has all 29 actions", () => {
        expect(Object.keys(NARRATIVE_CREW_ACTIONS)).toHaveLength(29);
    });

    test("preferred skills are real system skill keys", () => {
        const valid = new Set(["acr", "ath", "blu", "com", "cul", "dip", "eng", "int", "lsc", "mys", "per", "pil", "phs", "pro", "sen", "ste", "rangedAttack"]);
        for (const action of Object.values(NARRATIVE_CREW_ACTIONS)) {
            if (action.preferred === "any") continue;
            for (const skill of action.preferred) expect(valid.has(skill)).toBe(true);
        }
    });

    test("gunner ranged attack bonus is 3", () => {
        expect(RANGED_ATTACK_BONUS).toBe(3);
    });
});

describe("dcFor", () => {
    test("a preferred skill uses the Average DC", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.outmaneuver, "pil", DCS)).toBe(20);
    });

    test("another skill uses the Hard DC", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.outmaneuver, "dip", DCS)).toBe(25);
    });

    test("a hard-always action uses the Hard DC for any skill", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.targetWeakSpot, "pil", DCS)).toBe(25);
    });

    test("ranged attack is a preferred skill for a gunner action", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.fireAtWill, "rangedAttack", DCS)).toBe(20);
    });

    test("an action preferring any skill uses the Average DC", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.provideAid, "dip", DCS)).toBe(20);
    });

    test("forceHard makes a preferred skill use the Hard DC", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.outmaneuver, "pil", DCS, true)).toBe(25);
        expect(dcFor(NARRATIVE_CREW_ACTIONS.outmaneuver, "pil", DCS, false)).toBe(20);
    });

    test("any Profession skill key matches Profession (captain)", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.enactCunningStratagem, "pro1", DCS)).toBe(20);
        expect(dcFor(NARRATIVE_CREW_ACTIONS.tauntEnemy, "pro1", DCS)).toBe(25);
    });
});

describe("successesFor", () => {
    test("a standard action gives 1 success, or 2 when the margin is 5 or more", () => {
        expect(successesFor("outmaneuver", 24, 20)).toBe(1);
        expect(successesFor("outmaneuver", 25, 20)).toBe(2);
        expect(successesFor("scanEnemy", 25, 20)).toBe(2);
    });

    test("a failed check gives nothing", () => {
        expect(successesFor("outmaneuver", 19, 20)).toBe(0);
        expect(successesFor("performAudaciousStunt", 24, 25)).toBe(0);
    });

    test("Perform Audacious Stunt gives 2 on any success", () => {
        expect(successesFor("performAudaciousStunt", 25, 25)).toBe(2);
    });

    test("Target Weak Spot and Channel Eldritch Energy give 1 whatever the margin", () => {
        expect(successesFor("targetWeakSpot", 40, 25)).toBe(1);
        expect(successesFor("channelEldritchEnergy", 40, 25)).toBe(1);
    });

    test("Resolve-dependent actions give 0 here", () => {
        expect(successesFor("empowerCrew", 40, 20)).toBe(0);
        expect(successesFor("searchDatabase", 40, 20)).toBe(0);
        expect(successesFor("targetSystem", 40, 25)).toBe(0);
    });

    test("other actions give 0", () => {
        expect(successesFor("drawFire", 30, 20)).toBe(0);
    });
});

describe("skillAllowed", () => {
    test("refuses the skill used last round", () => {
        expect(skillAllowed("a1", "pil", { a1: ["eng", "pil"] })).toBe(false);
    });

    test("allows a different skill or a crew member with no history", () => {
        expect(skillAllowed("a1", "acr", { a1: ["eng", "pil"] })).toBe(true);
        expect(skillAllowed("a2", "pil", { a1: ["pil"] })).toBe(true);
    });
});

describe("actionsForRoles", () => {
    test("includes any-crew actions and the role's own", () => {
        const actions = actionsForRoles(["pilot"]);
        expect(actions).toContain("provideAid");
        expect(actions).toContain("outmaneuver");
    });

    test("leaves out other roles' actions", () => {
        expect(actionsForRoles(["pilot"])).not.toContain("fireAtWill");
    });

    test("combines several roles", () => {
        const actions = actionsForRoles(["pilot", "gunner"]);
        expect(actions).toContain("fireAtWill");
        expect(actions).toContain("outmaneuver");
    });

    test("with no roles only any-crew actions remain", () => {
        expect(actionsForRoles([])).toEqual(["provideAid"]);
    });
});
