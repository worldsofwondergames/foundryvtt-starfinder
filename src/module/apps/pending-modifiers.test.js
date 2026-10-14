import { describe, expect, test } from "vitest";
import { pendingModifierData, splitPendingModifiers } from "./pending-modifiers.js";

describe("pendingModifierData", () => {
    test("adds an armed Aim of 3 as +3 under its own name, in the roll to start with", () => {
        expect(pendingModifierData({ source: "Aim", value: 3 })).toMatchObject({ name: "Aim", modifier: "+3", max: 3, enabled: true });
    });

    test("keeps the sign of a penalty", () => {
        expect(pendingModifierData({ source: "Strain", value: -2 }).modifier).toBe("-2");
    });
});

describe("splitPendingModifiers", () => {
    const fullAttack = { name: "Full Attack", enabled: false };
    const aim = { name: "Aim", enabled: true, pending: true };

    test("shows a pending bonus as a label, pointing back to its place among the modifiers", () => {
        expect(splitPendingModifiers([fullAttack, aim]).pending).toEqual([{ index: 1, modifier: aim }]);
    });

    test("keeps a ticked option, such as Full Attack, in the list rather than as a label", () => {
        expect(splitPendingModifiers([{ ...fullAttack, enabled: true }, aim]).pending.map(entry => entry.modifier.name)).toEqual(["Aim"]);
    });

    test("drops the label of a pending bonus left out of this roll", () => {
        expect(splitPendingModifiers([fullAttack, { ...aim, enabled: false }]).pending).toEqual([]);
    });

    test("keeps pending bonuses out of the list of modifiers to tick", () => {
        expect(splitPendingModifiers([aim]).hasListed).toBe(false);
        expect(splitPendingModifiers([aim, fullAttack]).hasListed).toBe(true);
    });
});
