import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { compendiumMpCosts, correctedMpCost, mechPointMinimum } from "./mech-points.js";

const componentDir = join(__dirname, "../../items/mech-components");
const components = readdirSync(componentDir)
    .filter(file => file.endsWith(".json") && !file.startsWith("_"))
    .map(file => JSON.parse(readFileSync(join(componentDir, file), "utf8")));

const uuid = id => `Compendium.sfrpg.mech-components.Item.${id}`;
const costs = compendiumMpCosts([
    { uuid: uuid("thrusters"), name: "Thrusters", type: "mechAuxiliary", system: { mpCost: 0 } },
    { uuid: uuid("weaponCore"), name: "Weapon Core", type: "mechAuxiliary", system: { mpCost: 0 } },
    { uuid: uuid("selfDestruct"), name: "Explosive Self-Destruct", type: "mechAuxiliary", system: { mpCost: 2.5 } },
    { uuid: uuid("eternal2"), name: "Eternal Core, Mk 2", type: "mechPowerCore", system: { mpCost: 2 } },
    { uuid: uuid("dynamo4"), name: "Dynamo Core, Mk 4", type: "mechPowerCore", system: { mpCost: 4 } },
    { uuid: uuid("reinforced"), name: "Reinforced Frame", type: "mechUpgrade", system: { mpCost: 1 } },
    { uuid: uuid("claws"), name: "Adamantine Claws", type: "mechWeapon", system: { mpCost: 2 } }
]);

describe("mechPointMinimum", () => {
    test("follows Table 4-2, 30 MP at tier 1 and 15 more for each tier after", () => {
        expect([1, 5, 20].map(mechPointMinimum)).toEqual([30, 90, 315]);
    });
});

describe("correctedMpCost", () => {
    test("frees an auxiliary system a copy still charges for", () => {
        expect(correctedMpCost({ type: "mechAuxiliary", name: "Thrusters", system: { mpCost: 1 } }, costs)).toBe(0);
    });

    test("prices a power core a copy has as free", () => {
        expect(correctedMpCost({ type: "mechPowerCore", name: "Dynamo Core, Mk 4", system: { mpCost: 0 } }, costs)).toBe(4);
    });

    test("matches a copy whose name adds a part in parentheses", () => {
        expect(correctedMpCost({ type: "mechPowerCore", name: "Eternal Core, Mk 2 (Scrapper)", system: { mpCost: 0 } }, costs)).toBe(2);
        expect(correctedMpCost({ type: "mechAuxiliary", name: "Weapon Core (Cold, Fire)", system: { mpCost: 1 } }, costs)).toBe(0);
    });

    test("prefers the compendium the copy came from over its name", () => {
        const renamed = { type: "mechAuxiliary", name: "Thrusters", system: { mpCost: 0 }, _stats: { compendiumSource: uuid("selfDestruct") } };
        expect(correctedMpCost(renamed, costs)).toBe(2.5);
    });

    test("leaves a copy that already has the compendium's cost", () => {
        expect(correctedMpCost({ type: "mechUpgrade", name: "Reinforced Frame", system: { mpCost: 1 } }, costs)).toBeNull();
    });

    test("leaves a weapon, whose cost is not checked", () => {
        expect(correctedMpCost({ type: "mechWeapon", name: "Adamantine Claws", system: { mpCost: 3 } }, costs)).toBeNull();
    });

    test("leaves a component the compendium does not have", () => {
        expect(correctedMpCost({ type: "mechAuxiliary", name: "Homebrew Widget", system: { mpCost: 3 } }, costs)).toBeNull();
    });

    test("finds every mission pod's systems, cores and upgrades at the compendium's cost", () => {
        const index = components.map(c => ({ uuid: uuid(c._id), name: c.name, type: c.type, system: c.system }));
        const compendium = compendiumMpCosts(index);
        const templates = components.filter(c => c.type === "mechMissionPod").flatMap(pod => pod.system.itemTemplates);

        expect(templates.filter(t => compendium.byName.has(`${t.type}:${t.name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase()}`)).length)
            .toBeGreaterThan(0);
        expect(templates.filter(t => correctedMpCost(t, compendium) !== null).map(t => t.name)).toEqual([]);
    });

    test("does not match a name across component types", () => {
        const sameName = compendiumMpCosts([{ uuid: uuid("x"), name: "Shield", type: "mechUpgrade", system: { mpCost: 3 } }]);
        expect(correctedMpCost({ type: "mechAuxiliary", name: "Shield", system: { mpCost: 1 } }, sameName)).toBeNull();
    });
});
