import { describe, expect, test } from "vitest";
import { actionAttackBonus, actionSaveBonus, armedOverrideBanners, saveBonusActive, saveBonusTurn } from "./mech-attack-bonus.js";

describe("actionAttackBonus", () => {
    test("reads the formula an action declares", () => {
        expect(actionAttackBonus({ armsAttackBonus: { formula: "1d4" } })).toEqual({ formula: "1d4" });
    });

    test("accepts dice plus a flat bonus", () => {
        expect(actionAttackBonus({ armsAttackBonus: { formula: "2d6 + 3" } })).toEqual({ formula: "2d6 + 3" });
    });

    test("accepts a flat bonus on its own", () => {
        expect(actionAttackBonus({ armsAttackBonus: { formula: "2" } })).toEqual({ formula: "2" });
    });

    test("trims a formula written with surrounding spaces", () => {
        expect(actionAttackBonus({ armsAttackBonus: { formula: "  1d4  " } })).toEqual({ formula: "1d4" });
    });

    test("refuses a formula that reads an actor's data rather than rolling dice", () => {
        // The bonus is rolled from a chat card with no roll data behind it, so a
        // formula naming @mech.tier would evaluate to nothing.
        expect(actionAttackBonus({ armsAttackBonus: { formula: "@mech.details.tier" } })).toBeNull();
    });

    test("refuses a formula that is not a formula at all", () => {
        expect(actionAttackBonus({ armsAttackBonus: { formula: "one die" } })).toBeNull();
    });

    test("returns null for an action declaring no bonus", () => {
        expect(actionAttackBonus({ ppCost: 1 })).toBeNull();
    });

    test("returns null rather than reading through a missing action", () => {
        expect(actionAttackBonus(undefined)).toBeNull();
    });
});

describe("armedOverrideBanners", () => {
    test("returns nothing when neither override is armed", () => {
        expect(armedOverrideBanners({})).toEqual([]);
    });

    test("reports an armed damage level override", () => {
        expect(armedOverrideBanners({ damageLevelOverride: { source: "Devastating Hit", ppSpent: 3 } }))
            .toEqual([{ kind: "damage", source: "Devastating Hit", ppSpent: 3, value: null }]);
    });

    test("reports an armed attack bonus with the value that was rolled", () => {
        expect(armedOverrideBanners({ attackBonusOverride: { source: "Aim", ppSpent: 1, value: 3 } }))
            .toEqual([{ kind: "attack", source: "Aim", ppSpent: 1, value: 3 }]);
    });

    test("reports both when both are armed, damage first", () => {
        const banners = armedOverrideBanners({
            damageLevelOverride: { source: "Devastating Hit", ppSpent: 3 },
            attackBonusOverride: { source: "Aim", ppSpent: 1, value: 2 }
        });

        expect(banners.map(banner => banner.kind)).toEqual(["damage", "attack"]);
    });

    test("reports a free override as costing nothing rather than as undefined", () => {
        expect(armedOverrideBanners({ damageLevelOverride: { source: "Charged Barrel" } })[0].ppSpent).toBe(0);
    });

    test("returns nothing rather than reading through missing flags", () => {
        expect(armedOverrideBanners()).toEqual([]);
    });
});

describe("actionSaveBonus", () => {
    test("reads the formula Resist declares", () => {
        expect(actionSaveBonus({ armsSaveBonus: { formula: "1d4" } })).toEqual({ formula: "1d4" });
    });

    test("ignores an attack bonus, which belongs to the next attack", () => {
        expect(actionSaveBonus({ armsAttackBonus: { formula: "1d4" } })).toBeNull();
    });

    test("refuses a formula that reads an actor's data", () => {
        expect(actionSaveBonus({ armsSaveBonus: { formula: "@attributes.will.bonus" } })).toBeNull();
    });
});

describe("armedOverrideBanners with a save bonus", () => {
    test("reports an armed save bonus with the value that was rolled", () => {
        expect(armedOverrideBanners({ saveBonusOverride: { source: "Resist", ppSpent: 1, value: 3 } }))
            .toEqual([{ kind: "save", source: "Resist", ppSpent: 1, value: 3 }]);
    });

    test("lists the save bonus after the attack bonus", () => {
        const kinds = armedOverrideBanners({
            attackBonusOverride: { source: "Aim", value: 2 },
            saveBonusOverride: { source: "Resist", value: 3 }
        }).map(banner => banner.kind);

        expect(kinds).toEqual(["attack", "save"]);
    });
});

describe("saveBonusTurn", () => {
    test("records the combat turn a bonus was armed on", () => {
        expect(saveBonusTurn({ id: "c1", started: true, round: 2, turn: 1 })).toEqual({ combatId: "c1", round: 2, turn: 1 });
    });

    test("records no turn outside a started combat", () => {
        expect(saveBonusTurn({ id: "c1", started: false, round: 0, turn: 0 })).toBeNull();
        expect(saveBonusTurn(null)).toBeNull();
    });
});

describe("saveBonusActive", () => {
    const armed = turn => ({ source: "Resist", value: 3, turn });

    test("lasts through the combat turn it was armed on", () => {
        const combat = { id: "c1", started: true, round: 2, turn: 1 };
        expect(saveBonusActive(armed({ combatId: "c1", round: 2, turn: 1 }), combat)).toBe(true);
    });

    test("ends when the turn changes, whoever's turn it was", () => {
        const combat = { id: "c1", started: true, round: 2, turn: 2 };
        expect(saveBonusActive(armed({ combatId: "c1", round: 2, turn: 1 }), combat)).toBe(false);
    });

    test("ends when a new round starts on the same turn index", () => {
        const combat = { id: "c1", started: true, round: 3, turn: 1 };
        expect(saveBonusActive(armed({ combatId: "c1", round: 2, turn: 1 }), combat)).toBe(false);
    });

    test("ends when the combat it was armed in is gone", () => {
        expect(saveBonusActive(armed({ combatId: "c1", round: 2, turn: 1 }), null)).toBe(false);
    });

    test("lasts until used when armed outside combat", () => {
        expect(saveBonusActive(armed(null), null)).toBe(true);
    });

    test("is not active when nothing is armed", () => {
        expect(saveBonusActive(null, null)).toBe(false);
    });
});
