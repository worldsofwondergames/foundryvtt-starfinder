import { describe, expect, test } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { superiorComputerUpdate, templatedPowerPoints, upgradeCostsPerTier, upgradeRefusal } from "./mech-upgrade-rules.js";
import { countedMechUpgrades } from "./mech-upgrade-limit.js";

const upgrade = (name, system = {}) => ({ type: "mechUpgrade", name, system: { mpCost: 2, ...system } });
const template = (name, system = {}) => upgrade(name, { coreTemplate: true, mpCost: 0.5, ...system });

describe("upgradeCostsPerTier", () => {
    test("each repeat of an upgrade costs 1 more per tier than the last", () => {
        const fleets = [upgrade("Fleet"), upgrade("Fleet"), upgrade("Fleet")];
        const costs = upgradeCostsPerTier(fleets);
        expect(fleets.map(f => costs.get(f))).toEqual([2, 3, 4]);
    });

    test("a different upgrade starts at its own cost", () => {
        const items = [upgrade("Fleet"), upgrade("Rapid Reflexes"), upgrade("Fleet (Second)")];
        const costs = upgradeCostsPerTier(items);
        expect(items.map(i => costs.get(i))).toEqual([2, 2, 3]);
    });

    test("an upgrade with no added cost, such as Superior Computer, stays the same", () => {
        const computers = [upgrade("Superior Computer", { mpCost: 0.5, repeatCostStep: 0 }), upgrade("Superior Computer", { mpCost: 0.5, repeatCostStep: 0 })];
        const costs = upgradeCostsPerTier(computers);
        expect(computers.map(c => costs.get(c))).toEqual([0.5, 0.5]);
    });

    test("leaves other components out", () => {
        const weapon = { type: "mechWeapon", name: "Fleet", system: { mpCost: 3 } };
        expect(upgradeCostsPerTier([weapon]).has(weapon)).toBe(false);
    });
});

describe("upgradeRefusal", () => {
    test("refuses a second copy of an upgrade that can be bought once", () => {
        const tail = upgrade("Tail", { repeatable: false });
        expect(upgradeRefusal([tail], upgrade("Tail", { repeatable: false }))).toBe("notRepeatable");
        expect(upgradeRefusal([], upgrade("Tail", { repeatable: false }))).toBeNull();
        expect(upgradeRefusal([upgrade("Fleet")], upgrade("Tail", { repeatable: false }))).toBeNull();
    });

    test("allows another copy of a repeatable upgrade", () => {
        expect(upgradeRefusal([upgrade("Fleet")], upgrade("Fleet"))).toBeNull();
    });

    test("refuses a second core template", () => {
        expect(upgradeRefusal([template("Battle Core Template")], template("Scrapper Core Template"))).toBe("oneCoreTemplate");
        expect(upgradeRefusal([upgrade("Fleet")], template("Scrapper Core Template"))).toBeNull();
    });
});

describe("templatedPowerPoints", () => {
    test("applies the template's rate, initial, and maximum adjustments", () => {
        const battle = template("Battle Core Template", { ppRegenBonus: -1, ppMaxBonus: 1 });
        expect(templatedPowerPoints({ initial: 3, max: 9, regen: 4 }, [battle])).toEqual({ initial: 3, max: 10, regen: 3 });
    });

    test("leaves the core alone without a template and never goes below 0", () => {
        expect(templatedPowerPoints({ initial: 1, max: 5, regen: 2 }, [upgrade("Fleet", { ppRegenBonus: -5 })])).toEqual({ initial: 1, max: 5, regen: 2 });
        expect(templatedPowerPoints({ initial: 0, max: 5, regen: 2 }, [template("Aeon", { ppInitialBonus: -1 })]).initial).toBe(0);
    });
});

describe("superiorComputerUpdate", () => {
    test("the compendium Superior Computer costs the same each time", () => {
        const file = join(__dirname, "../../items/mech-components/superior_computer.json");
        const computer = JSON.parse(readFileSync(file, "utf8"));
        expect(computer.system.repeatCostStep).toBe(0);
        expect(superiorComputerUpdate(computer)).toEqual({});
    });

    test("an older copy stops adding cost, and other upgrades are left alone", () => {
        expect(superiorComputerUpdate(upgrade("Superior Computer", { mpCost: 0.5 }))).toEqual({ repeatCostStep: 0 });
        expect(superiorComputerUpdate(upgrade("Fleet"))).toEqual({});
        expect(superiorComputerUpdate({ type: "mechAuxiliary", name: "Superior Computer", system: {} })).toEqual({});
    });
});

describe("countedMechUpgrades", () => {
    test("a core template doesn't count against the upgrade limit", () => {
        expect(countedMechUpgrades([upgrade("Fleet"), template("Battle Core Template")])).toBe(1);
    });
});
