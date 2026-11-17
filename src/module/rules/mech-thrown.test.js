import { describe, expect, it } from "vitest";
import { autospearSystemUpdate, canThrow, houseRuleThrownFeet, thrownRange, thrownRangeInUse } from "./mech-thrown.js";

describe("thrownRange", () => {
    it("reads the range from the middle of the list", () => {
        expect(thrownRange("analog, penetrating, reach, thrown (40 ft.)")).toBe("40 ft.");
    });

    it("reads the range when thrown is listed first", () => {
        expect(thrownRange("thrown (20 ft.), cleave (2 PP)")).toBe("20 ft.");
    });

    it("returns null when the weapon is not thrown", () => {
        expect(thrownRange("analog, penetrating, reach")).toBeNull();
    });

    it("does not match a word that only ends in thrown", () => {
        expect(thrownRange("overthrown (10 ft.)")).toBeNull();
    });

    it("returns null for missing text", () => {
        expect(thrownRange(undefined)).toBeNull();
    });

    it("reads a bare thrown's range from the weapon's range field", () => {
        expect(thrownRange("reach, thrown, projectile mode (1 PP)", "40 ft.")).toBe("40 ft.");
    });

    it("returns null for a bare thrown with no range field", () => {
        expect(thrownRange("reach, thrown", "")).toBeNull();
    });
});

describe("canThrow", () => {
    it("is true for a melee weapon with the thrown property", () => {
        expect(canThrow({ weaponType: "melee", special: "reach, thrown (40 ft.)" })).toBe(true);
    });

    it("is false for a melee weapon without it", () => {
        expect(canThrow({ weaponType: "melee", special: "reach" })).toBe(false);
    });

    it("is false for a ranged weapon even with the thrown property", () => {
        expect(canThrow({ weaponType: "ranged", special: "thrown (20 ft.)" })).toBe(false);
    });
});

describe("canThrow with a bare thrown", () => {
    it("is true for a melee weapon whose range field gives the range", () => {
        expect(canThrow({ weaponType: "melee", special: "reach, thrown", range: "40 ft." })).toBe(true);
    });
});

describe("houseRuleThrownFeet", () => {
    it("reads a number of feet", () => {
        expect(houseRuleThrownFeet("60")).toBe(60);
    });

    it("keeps each weapon's own range when blank or not a positive number", () => {
        expect(["", "  ", "0", "-10", "far", undefined].map(houseRuleThrownFeet)).toEqual([null, null, null, null, null, null]);
    });
});

describe("thrownRangeInUse", () => {
    it("uses the house rule range when it is set", () => {
        expect(thrownRangeInUse("20 ft.", 60)).toBe("60 ft.");
    });

    it("uses the weapon's own range when the house rule is off", () => {
        expect(thrownRangeInUse("20 ft.", null)).toBe("20 ft.");
    });
});

describe("autospearSystemUpdate", () => {
    const old = () => ({ type: "mechWeapon", name: "Autospear", system: { weaponType: "ranged", special: "reach, thrown, projectile mode (1 PP)", range: "40 ft." } });

    it("gives an old Autospear thrown (40 ft.) as a melee weapon, so it can be thrown", () => {
        const update = autospearSystemUpdate(old());
        expect(update).toEqual({ special: "reach, thrown (40 ft.), projectile mode (1 PP)", range: "", weaponType: "melee" });
        expect(canThrow({ ...old().system, ...update })).toBe(true);
    });

    it("leaves an Autospear that already lists its thrown range alone", () => {
        expect(autospearSystemUpdate({ ...old(), system: { weaponType: "melee", special: "reach, thrown (40 ft.), projectile mode (1 PP)", range: "" } })).toEqual({});
    });

    it("leaves other weapons alone", () => {
        expect(autospearSystemUpdate({ ...old(), name: "Spear" })).toEqual({});
    });
});
