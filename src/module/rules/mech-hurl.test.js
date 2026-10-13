import { describe, expect, it } from "vitest";
import { HURL_DAMAGE_LEVELS, hurlSizeOptions, hurlStillActive, hurlWeaponSystem, isActorsTurn } from "./mech-hurl.js";

const SIZES = ["fine", "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"];

const table = {
    1: { low: "1d4", medium: "1d6", high: "1d10", extreme: "1d12" },
    5: { low: "2d6", medium: "3d6", high: "3d8", extreme: "4d8" },
    20: { low: "8d6", medium: "10d6", high: "10d8", extreme: "12d8" }
};

describe("hurlWeaponSystem", () => {
    it("rolls the medium column for a large object", () => {
        const system = hurlWeaponSystem({ tier: 5, damageLevel: HURL_DAMAGE_LEVELS.large, damageTable: table });
        expect(system.damage.parts[0].formula).toBe("3d6");
    });

    it("rolls the low column for a small object", () => {
        const system = hurlWeaponSystem({ tier: 5, damageLevel: HURL_DAMAGE_LEVELS.small, damageTable: table });
        expect(system.damage.parts[0].formula).toBe("2d6");
    });

    it("deals bludgeoning damage, so the attack targets KAC", () => {
        const system = hurlWeaponSystem({ tier: 5, damageLevel: "medium", damageTable: table });
        expect(system.damage.parts[0].types).toEqual({ bludgeoning: true });
    });

    it("is a thrown melee weapon with a 30 ft. range", () => {
        const system = hurlWeaponSystem({ tier: 5, damageLevel: "medium", damageTable: table });
        expect(system.weaponType).toBe("melee");
        expect(system.special).toBe("thrown (30 ft.)");
    });

    it("clamps a tier above the table to tier 20", () => {
        const system = hurlWeaponSystem({ tier: 25, damageLevel: "medium", damageTable: table });
        expect(system.damage.parts[0].formula).toBe("10d6");
    });

    it("returns null for a level the table does not have", () => {
        expect(hurlWeaponSystem({ tier: 5, damageLevel: "light", damageTable: table })).toBeNull();
    });
});

describe("hurlSizeOptions", () => {
    it("lets a Huge mech throw Medium and Small objects for medium damage", () => {
        const options = hurlSizeOptions("huge", SIZES);
        expect(options.slice(0, 2)).toEqual([
            { size: "medium", damageLevel: "medium", orSmaller: false },
            { size: "small", damageLevel: "medium", orSmaller: false }
        ]);
    });

    it("gives a Huge mech Tiny or smaller for light damage", () => {
        expect(hurlSizeOptions("huge", SIZES)[2]).toEqual({ size: "tiny", damageLevel: "low", orSmaller: true });
    });

    it("moves every option up one size for a Colossal mech", () => {
        expect(hurlSizeOptions("colossal", SIZES).map(o => o.size)).toEqual(["huge", "large", "medium"]);
    });

    it("does not offer smaller sizes below Fine", () => {
        expect(hurlSizeOptions("small", SIZES)).toEqual([
            { size: "diminutive", damageLevel: "medium", orSmaller: false },
            { size: "fine", damageLevel: "medium", orSmaller: false }
        ]);
    });

    it("marks the lightest option as a single size when it is Fine", () => {
        expect(hurlSizeOptions("medium", SIZES)[2]).toEqual({ size: "fine", damageLevel: "low", orSmaller: false });
    });

    it("returns null for an unknown size", () => {
        expect(hurlSizeOptions(undefined, SIZES)).toBeNull();
    });
});

describe("isActorsTurn", () => {
    const mech = { id: "mech" };

    it("allows the action outside combat", () => {
        expect(isActorsTurn(null, mech)).toBe(true);
    });

    it("allows it on the mech's own turn", () => {
        expect(isActorsTurn({ started: true, combatant: { actor: { id: "mech" } } }, mech)).toBe(true);
    });

    it("refuses it on another combatant's turn", () => {
        expect(isActorsTurn({ started: true, combatant: { actor: { id: "goblin" } } }, mech)).toBe(false);
    });
});

describe("hurlStillActive", () => {
    it("is false with no flag", () => {
        expect(hurlStillActive(null, { started: true, round: 1, turn: 0 })).toBe(false);
    });

    it("is true on the round and turn it was granted", () => {
        expect(hurlStillActive({ round: 2, turn: 1 }, { started: true, round: 2, turn: 1 })).toBe(true);
    });

    it("is false once the turn has moved on", () => {
        expect(hurlStillActive({ round: 2, turn: 1 }, { started: true, round: 2, turn: 2 })).toBe(false);
    });

    it("is false in a later round on the same turn index", () => {
        expect(hurlStillActive({ round: 2, turn: 1 }, { started: true, round: 3, turn: 1 })).toBe(false);
    });

    it("is true outside combat for a flag granted outside combat", () => {
        expect(hurlStillActive({ round: null, turn: null }, null)).toBe(true);
    });

    it("is false outside combat for a flag granted during one", () => {
        expect(hurlStillActive({ round: 2, turn: 1 }, null)).toBe(false);
    });
});
