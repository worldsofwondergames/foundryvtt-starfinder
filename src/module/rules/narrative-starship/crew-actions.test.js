import { describe, expect, test } from "vitest";
import {
    NARRATIVE_CREW_ACTIONS, RANGED_ATTACK_BONUS, crewActionKeys, dcFor, skillAllowed, skillLockedFor, successesFor
} from "./crew-actions.js";

const DCS = { average: 20, hard: 25 };

describe("NARRATIVE_CREW_ACTIONS", () => {
    test("has the 29 book actions and the Take Cover pilot check", () => {
        expect(Object.keys(NARRATIVE_CREW_ACTIONS)).toHaveLength(30);
        expect(NARRATIVE_CREW_ACTIONS.clearTakeCover).toMatchObject({ role: "pilot", hardAlways: true, dcOf: "target" });
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

describe("clearTakeCover", () => {
    test("uses the Hard DC and gives no successes", () => {
        expect(dcFor(NARRATIVE_CREW_ACTIONS.clearTakeCover, "pil", DCS)).toBe(25);
        expect(successesFor("clearTakeCover", 40, 25)).toBe(0);
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

describe("skillLockedFor", () => {
    test("locks a skill used last round for an ordinary action and leaves the others open", () => {
        expect(skillLockedFor("outmaneuver", "pil", ["pil"])).toBe(true);
        expect(skillLockedFor("outmaneuver", "acr", ["pil"])).toBe(false);
        expect(skillLockedFor("outmaneuver", "pil", undefined)).toBe(false);
    });

    test("keeps Piloting open for Negate Take Cover after a round of Piloting", () => {
        expect(skillLockedFor("clearTakeCover", "pil", ["pil"])).toBe(false);
    });
});

describe("crewActionKeys", () => {
    test("lists every action in data order", () => {
        expect(crewActionKeys()).toEqual(Object.keys(NARRATIVE_CREW_ACTIONS));
    });

    test("puts the chosen action first and keeps each action once", () => {
        const keys = crewActionKeys("fireAtWill");
        expect(keys[0]).toBe("fireAtWill");
        expect([...keys].sort()).toEqual(Object.keys(NARRATIVE_CREW_ACTIONS).sort());
    });

    test("ignores an unknown action", () => {
        expect(crewActionKeys("nope")).toEqual(Object.keys(NARRATIVE_CREW_ACTIONS));
    });
});
