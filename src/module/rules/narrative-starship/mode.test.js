import { describe, expect, it } from "vitest";
import { combatTypesForMode, nextCombatType, startingCombatType, starshipCombatTypeForMode, narrativeSheetIsDefault, showStandardSheetToggle } from "./mode.js";

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

describe("showStandardSheetToggle", () => {
    it("is shown only in both mode", () => {
        expect(showStandardSheetToggle("both")).toBe(true);
        expect(showStandardSheetToggle("narrative")).toBe(false);
        expect(showStandardSheetToggle("standard")).toBe(false);
    });
});

describe("nextCombatType", () => {
    it("wraps forward past the last type", () => {
        expect(nextCombatType("vehicleChase", 1, "narrative")).toBe("normal");
    });

    it("wraps backward past the first type", () => {
        expect(nextCombatType("normal", -1, "narrative")).toBe("vehicleChase");
    });

    it("steps to the adjacent type", () => {
        expect(nextCombatType("normal", 1, "narrative")).toBe("narrativeStarship");
        expect(nextCombatType("narrativeStarship", -1, "narrative")).toBe("normal");
    });

    it("steps to the first type when the current type is not offered", () => {
        expect(nextCombatType("starship", 1, "narrative")).toBe("normal");
        expect(nextCombatType("starship", -1, "narrative")).toBe("normal");
        expect(nextCombatType("bogus", 1, "standard")).toBe("normal");
    });
});

describe("starshipCombatTypeForMode", () => {
    it("uses narrative starship combat in narrative mode", () => {
        expect(starshipCombatTypeForMode("narrative")).toBe("narrativeStarship");
    });

    it("uses standard starship combat in the other modes", () => {
        expect(starshipCombatTypeForMode("standard")).toBe("starship");
        expect(starshipCombatTypeForMode("both")).toBe("starship");
        expect(starshipCombatTypeForMode("bogus")).toBe("starship");
    });
});

describe("startingCombatType", () => {
    it("starts a normal combat of starships as the mode's starship type", () => {
        expect(startingCombatType("normal", ["starship", "starship"], "narrative")).toBe("narrativeStarship");
        expect(startingCombatType("normal", ["starship"], "standard")).toBe("starship");
    });
    it("keeps the normal type when a combatant is not a starship or there are no combatants", () => {
        expect(startingCombatType("normal", ["starship", "character"], "narrative")).toBe("normal");
        expect(startingCombatType("normal", ["starship", undefined], "narrative")).toBe("normal");
        expect(startingCombatType("normal", [], "narrative")).toBe("normal");
    });
    it("keeps a type that is already set", () => {
        expect(startingCombatType("starship", ["starship"], "narrative")).toBe("starship");
        expect(startingCombatType("vehicleChase", ["starship"], "narrative")).toBe("vehicleChase");
    });
});
