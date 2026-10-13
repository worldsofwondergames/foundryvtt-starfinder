import { describe, expect, it } from "vitest";
import { canThrow, thrownRange } from "./mech-thrown.js";

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
