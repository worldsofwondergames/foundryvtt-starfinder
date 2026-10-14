import { describe, expect, test } from "vitest";
import { labelFormula, variableLabel } from "./variable-labels.js";

const localize = key => ({ "SFRPG.InitiativeLabel": "Initiative" })[key] ?? key;

describe("variableLabel", () => {
    test("names a combatant's initiative", () => {
        expect(variableLabel("combatant.attributes.init.total", localize)).toBe("Initiative");
    });

    test("names initiative read from the actor's own context", () => {
        expect(variableLabel("attributes.init.total", localize)).toBe("Initiative");
    });

    test("leaves a path it has no name for alone", () => {
        expect(variableLabel("combatant.attributes.fort.bonus", localize)).toBeNull();
    });
});

describe("labelFormula", () => {
    test("shows the initiative roll's formula with a name for its bonus", () => {
        expect(labelFormula("1d20 + @combatant.attributes.init.total", localize)).toBe("1d20 + Initiative");
    });

    test("leaves other variables in the formula as written", () => {
        expect(labelFormula("1d20 + @pilot.skills.pil.mod", localize)).toBe("1d20 + @pilot.skills.pil.mod");
    });
});
