import { describe, expect, it } from "vitest";
import { limbHp, toughArmsHpGain, toughArmsTemplate, toughArmsUpdate } from "./mech-limb-hp.js";

const arms = (system = {}, name = "Tough Arms") => ({ type: "mechUpperLimb", name, system: { baseHp: 1, ...system } });

describe("limbHp", () => {
    it("adds a limb's base Hit Points and its advancement for each tier", () => {
        expect(limbHp({ baseHp: 4, hpAdvancement: 1 }, 6)).toBe(10);
    });

    it("gives Tough Arms +1 Hit Point per tier", () => {
        expect(limbHp({ baseHp: 0, hpAdvancement: 1 }, 6)).toBe(6);
    });

    it("gives nothing for a limb with neither, or no limb", () => {
        expect(limbHp({ baseHp: 0, hpAdvancement: 0 }, 6)).toBe(0);
        expect(limbHp(undefined, 6)).toBe(0);
    });
});

describe("toughArmsUpdate", () => {
    it("moves Tough Arms' flat +1 Hit Point to +1 per tier", () => {
        expect(toughArmsUpdate(arms())).toEqual({ "system.baseHp": 0, "system.hpAdvancement": 1 });
    });

    it("leaves Tough Arms that already have advancement alone", () => {
        expect(toughArmsUpdate(arms({ baseHp: 0, hpAdvancement: 1 }))).toEqual({});
    });

    it("brings any other Tough Arms in line with the compendium", () => {
        expect(toughArmsUpdate(arms({ baseHp: 3 }))).toEqual({ "system.baseHp": 0, "system.hpAdvancement": 1 });
        expect(toughArmsUpdate(arms({ baseHp: 1, hpAdvancement: 1 }))).toEqual({ "system.baseHp": 0, "system.hpAdvancement": 1 });
        expect(toughArmsUpdate(arms({ baseHp: 0, hpAdvancement: 2 }))).toEqual({ "system.baseHp": 0, "system.hpAdvancement": 1 });
    });

    it("leaves other upper limbs and other item types alone", () => {
        expect(toughArmsUpdate(arms({}, "Basic Arms"))).toEqual({});
        expect(toughArmsUpdate({ type: "mechLowerLimb", name: "Tough Arms", system: { baseHp: 1 } })).toEqual({});
    });
});

describe("toughArmsTemplate", () => {
    it("returns a mission pod's Tough Arms template with the advancement", () => {
        expect(toughArmsTemplate(arms()).system).toMatchObject({ baseHp: 0, hpAdvancement: 1 });
    });

    it("returns null for a template that needs no change", () => {
        expect(toughArmsTemplate(arms({}, "Thrusters"))).toBeNull();
    });
});

describe("toughArmsHpGain", () => {
    it("is the Hit Points the fix adds at the mech's tier", () => {
        expect(toughArmsHpGain(arms(), 6)).toBe(5);
    });

    it("is the change from a hand-edited base", () => {
        expect(toughArmsHpGain(arms({ baseHp: 3 }), 6)).toBe(3);
    });

    it("is nothing for Tough Arms already fixed, or another limb", () => {
        expect(toughArmsHpGain(arms({ baseHp: 0, hpAdvancement: 1 }), 6)).toBe(0);
        expect(toughArmsHpGain(arms({}, "Basic Arms"), 6)).toBe(0);
    });
});
