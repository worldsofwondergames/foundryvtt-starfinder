import { describe, expect, it } from "vitest";
import { actionUsesEnergyType, energyTypesFromName, hasEnergyTypes, showsEnergyTypeLabel, weaponCoreItemUpdate, weaponCoreTemplate } from "./weapon-core.js";

const ALLOWED = ["acid", "cold", "electricity", "fire", "sonic"];
const core = (system = {}, name = "Weapon Core") => ({ type: "mechAuxiliary", name, system: { choosesEnergyTypes: false, energyTypes: [], ...system } });

describe("hasEnergyTypes", () => {
    it("accepts two different energy types", () => {
        expect(hasEnergyTypes(["cold", "fire"], ALLOWED)).toBe(true);
    });

    it("refuses one, three, or the same type twice", () => {
        expect(hasEnergyTypes(["cold"], ALLOWED)).toBe(false);
        expect(hasEnergyTypes(["cold", "fire", "acid"], ALLOWED)).toBe(false);
        expect(hasEnergyTypes(["cold", "cold"], ALLOWED)).toBe(false);
    });

    it("refuses a type that is not an energy type", () => {
        expect(hasEnergyTypes(["cold", "piercing"], ALLOWED)).toBe(false);
    });

    it("refuses missing types", () => {
        expect(hasEnergyTypes(undefined, ALLOWED)).toBe(false);
    });
});

describe("energyTypesFromName", () => {
    it("reads two types from a name such as Weapon Core (Cold, Fire)", () => {
        expect(energyTypesFromName("Weapon Core (Cold, Fire)", ALLOWED)).toEqual(["cold", "fire"]);
    });

    it("reads nothing from a name without types", () => {
        expect(energyTypesFromName("Weapon Core", ALLOWED)).toEqual([]);
    });

    it("reads nothing when the parentheses do not hold two energy types", () => {
        expect(energyTypesFromName("Weapon Core (Mk 2)", ALLOWED)).toEqual([]);
        expect(energyTypesFromName("Weapon Core (Cold)", ALLOWED)).toEqual([]);
    });
});

describe("weaponCoreItemUpdate", () => {
    it("marks a Weapon Core that has no choice yet", () => {
        expect(weaponCoreItemUpdate(core(), ALLOWED)).toEqual({ "system.choosesEnergyTypes": true });
    });

    it("also fills in the types its name gives", () => {
        expect(weaponCoreItemUpdate(core({}, "Weapon Core (Cold, Fire)"), ALLOWED))
            .toEqual({ "system.choosesEnergyTypes": true, "system.energyTypes": ["cold", "fire"] });
    });

    it("keeps types already chosen", () => {
        expect(weaponCoreItemUpdate(core({ energyTypes: ["acid", "sonic"] }, "Weapon Core (Cold, Fire)"), ALLOWED))
            .toEqual({ "system.choosesEnergyTypes": true });
    });

    it("leaves an item that is already marked alone", () => {
        expect(weaponCoreItemUpdate(core({ choosesEnergyTypes: true }), ALLOWED)).toEqual({});
    });

    it("leaves other auxiliary systems and other item types alone", () => {
        expect(weaponCoreItemUpdate(core({}, "Thrusters"), ALLOWED)).toEqual({});
        expect(weaponCoreItemUpdate({ type: "mechUpgrade", name: "Weapon Core", system: {} }, ALLOWED)).toEqual({});
    });
});

describe("weaponCoreTemplate", () => {
    it("returns a mission pod's Weapon Core template with its choice filled in", () => {
        const template = core({}, "Weapon Core (Cold, Fire)");
        expect(weaponCoreTemplate(template, ALLOWED).system).toMatchObject({ choosesEnergyTypes: true, energyTypes: ["cold", "fire"] });
    });

    it("returns null for a template that needs no change", () => {
        expect(weaponCoreTemplate(core({}, "Thrusters"), ALLOWED)).toBeNull();
        expect(weaponCoreTemplate(core({ choosesEnergyTypes: true }), ALLOWED)).toBeNull();
    });
});

describe("actionUsesEnergyType", () => {
    it("is true for Energize Weapon, whose text names the energy types", () => {
        expect(actionUsesEnergyType({ description: "charge the weapon with one of the weapon core's energy types." })).toBe(true);
    });

    it("is false for Boomerang Strike", () => {
        expect(actionUsesEnergyType({ description: "infuse the weapon with telekinetic magic, granting the returning weapon fusion" })).toBe(false);
    });
});

describe("showsEnergyTypeLabel", () => {
    it("labels a Weapon Core whose name doesn't give its types", () => {
        expect(showsEnergyTypeLabel("Weapon Core", ["cold", "fire"], ALLOWED)).toBe(true);
    });

    it("leaves the label off when the name already gives the same types, in any order", () => {
        expect(showsEnergyTypeLabel("Weapon Core (Cold, Fire)", ["cold", "fire"], ALLOWED)).toBe(false);
        expect(showsEnergyTypeLabel("Weapon Core (Fire, Cold)", ["cold", "fire"], ALLOWED)).toBe(false);
    });

    it("labels it when the types chosen differ from the name", () => {
        expect(showsEnergyTypeLabel("Weapon Core (Cold, Fire)", ["acid", "sonic"], ALLOWED)).toBe(true);
    });

    it("shows no label without types", () => {
        expect(showsEnergyTypeLabel("Weapon Core", [], ALLOWED)).toBe(false);
        expect(showsEnergyTypeLabel("Weapon Core (Cold, Fire)", [], ALLOWED)).toBe(false);
    });
});
