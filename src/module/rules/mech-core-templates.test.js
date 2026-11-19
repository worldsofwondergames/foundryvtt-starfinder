import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { aeonPowerPoints, aeonSlots, boostedPowerPoints, coreTemplateKind, salvageFastHealing, salvageRounds, usedThisRound } from "./mech-core-templates.js";

const template = name => JSON.parse(readFileSync(join(__dirname, `../../items/mech-components/${name}_core_template.json`), "utf8"));

describe("coreTemplateKind", () => {
    test("names each compendium template, and nothing for another template or none", () => {
        for (const kind of ["scrapper", "aeon", "junker", "photosynthesizer"]) {
            expect(coreTemplateKind([template(kind)])).toBe(kind);
        }
        expect(coreTemplateKind([template("battle")])).toBeNull();
        expect(coreTemplateKind([{ ...template("aeon"), system: { ...template("aeon").system, coreTemplate: false } }])).toBeNull();
        expect(coreTemplateKind([])).toBeNull();
    });
});

describe("boostedPowerPoints", () => {
    const pp = { initial: 3, max: 6, regen: 2 };

    test("light shifts all three values, and salvage adds 2 maximum and 1 rate", () => {
        expect(boostedPowerPoints(pp, { light: "bright" })).toEqual({ initial: 5, max: 8, regen: 4 });
        expect(boostedPowerPoints(pp, { light: "darkness", salvaging: true })).toEqual({ initial: 2, max: 7, regen: 2 });
        expect(boostedPowerPoints(pp)).toEqual(pp);
    });

    test("no value goes below 0", () => {
        expect(boostedPowerPoints({ initial: 0, max: 0, regen: 0 }, { light: "darkness" })).toEqual({ initial: 0, max: 0, regen: 0 });
    });
});

describe("salvage", () => {
    test("lasts 1 round per 4 levels and refuses a target below half the tier", () => {
        expect(salvageRounds(12, 10)).toBe(3);
        expect(salvageRounds(7, 10)).toBe(1);
        expect(salvageRounds(4, 10)).toBeNull();
    });

    test("fast healing is a quarter of the tier, at least 1", () => {
        expect(salvageFastHealing(9)).toBe(2);
        expect(salvageFastHealing(3)).toBe(1);
    });
});

describe("aeon", () => {
    test("a slot gives half its level, rounded down", () => {
        expect(aeonPowerPoints(5)).toBe(2);
        expect(aeonPowerPoints(6)).toBe(3);
    });

    test("lists unused slots of level 2 and up, per class when the caster has per-class slots", () => {
        const mystic = { id: "a",
            name: "Mystic",
            system: { spells: {
                spell1: { value: 3, perClass: { mystic: { value: 3 } } },
                spell2: { value: 9, perClass: { mystic: { value: 2 }, witchwarper: { value: 0 } } }
            } } };
        const general = { id: "b", name: "General", system: { spells: { spell3: { value: 1 }, spell4: { value: 0 } } } };
        expect(aeonSlots([mystic, general])).toEqual([
            { operatorId: "a", operatorName: "Mystic", level: 2, source: "mystic", path: "system.spells.spell2.perClass.mystic.value", value: 2 },
            { operatorId: "b", operatorName: "General", level: 3, source: "general", path: "system.spells.spell3.value", value: 1 }
        ]);
    });

    test("a use counts only in the same combat's current round", () => {
        const combat = { id: "c", round: 3, started: true };
        expect(usedThisRound({ combatId: "c", round: 3 }, combat)).toBe(true);
        expect(usedThisRound({ combatId: "c", round: 2 }, combat)).toBe(false);
        expect(usedThisRound({ combatId: "d", round: 3 }, combat)).toBe(false);
        expect(usedThisRound({ combatId: "c", round: 3 }, { ...combat, started: false })).toBe(false);
    });
});
