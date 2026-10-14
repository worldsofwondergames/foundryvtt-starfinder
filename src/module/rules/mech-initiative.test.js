import { describe, expect, test } from "vitest";
import { mechInitiative } from "./mech-initiative.js";

describe("mechInitiative", () => {
    test("takes the lowest initiative among the operators", () => {
        expect(mechInitiative([4, 2, 6], 1).total).toBe(2);
    });

    test("uses the tier minimum as a floor, not a bonus", () => {
        expect(mechInitiative([4], 5).total).toBe(4);
    });

    test("raises an operator below the tier minimum to it", () => {
        expect(mechInitiative([0], 10).total).toBe(2);
    });

    test("gives no operator +0 below tier 5, which the sheet shows as the operators' part", () => {
        const { total, operatorMod } = mechInitiative([], 4);
        expect([total, operatorMod]).toEqual([0, 0]);
    });

    test("never goes below +0 for an operator with a penalty, in the total or the operators' part", () => {
        const { total, operatorMod } = mechInitiative([-2], 1);
        expect([total, operatorMod]).toEqual([0, 0]);
    });

    test("raises the minimum by 1 at tier 5 and every 5 tiers after", () => {
        expect([4, 5, 9, 10, 15].map(tier => mechInitiative([], tier).tierMinimum)).toEqual([0, 1, 1, 2, 3]);
    });

    test("reports which operator's initiative it used", () => {
        expect(mechInitiative([4, 2, 6], 1).lowestIndex).toBe(1);
    });

    test("reports no operator when none is assigned", () => {
        expect(mechInitiative([], 1).lowestIndex).toBeNull();
    });
});
