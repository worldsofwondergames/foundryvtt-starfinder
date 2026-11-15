import { describe, expect, it } from "vitest";
import { combatTypesForMode, narrativeSheetIsDefault } from "./mode.js";

describe("combatTypesForMode", () => {
    it("lists standard starship combat for standard mode", () => {
        expect(combatTypesForMode("standard")).toEqual(["normal", "starship", "vehicleChase"]);
    });

    it("swaps in narrative starship combat for narrative mode", () => {
        expect(combatTypesForMode("narrative")).toEqual(["normal", "narrativeStarship", "vehicleChase"]);
    });

    it("lists both starship combat types for both mode", () => {
        expect(combatTypesForMode("both")).toEqual(["normal", "starship", "narrativeStarship", "vehicleChase"]);
    });

    it("falls back to standard for an unknown mode", () => {
        expect(combatTypesForMode("bogus")).toEqual(["normal", "starship", "vehicleChase"]);
    });
});

describe("narrativeSheetIsDefault", () => {
    it("is true only in narrative mode", () => {
        expect(narrativeSheetIsDefault("narrative")).toBe(true);
        expect(narrativeSheetIsDefault("both")).toBe(false);
        expect(narrativeSheetIsDefault("standard")).toBe(false);
    });
});
