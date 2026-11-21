import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { PLASMA_RIFLE_MP_COST, compendiumMpCosts, correctedMpCost, componentPpFix, ADDED_WEAPON_ACTIONS, attackPpCost, mechPointMinimum, plasmaRifleDescription, plasmaRifleMpCost } from "./mech-points.js";

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

describe("plasmaRifleMpCost", () => {
    test("the compendium Plasma Rifle has the corrected cost", () => {
        const rifle = components.find(c => c.type === "mechWeapon" && c.name === "Plasma Rifle");
        expect(rifle.system.mpCost).toBe(PLASMA_RIFLE_MP_COST);
        expect(plasmaRifleMpCost(rifle)).toBeNull();
    });

    test("lowers an old copy's 10 per level", () => {
        expect(plasmaRifleMpCost({ type: "mechWeapon", name: "Plasma Rifle", system: { mpCost: 10 } })).toBe(4);
        expect(plasmaRifleMpCost({ type: "mechWeapon", name: "Plasma Rifle (Left Arm)", system: { mpCost: 10 } })).toBe(4);
    });

    test("lowers a copy made while the compendium charged 4.5 per level", () => {
        expect(plasmaRifleMpCost({ type: "mechWeapon", name: "Plasma Rifle", system: { mpCost: 4.5 } })).toBe(4);
    });

    test("takes the paragraph about 4.5 per level out of an old copy's description", () => {
        const note = "<p>Tech Revolution prints this weapon's cost as 10 × tier. This system charges 4.5 × level, the same as the Flamethrower.</p>";
        const old = { type: "mechWeapon", name: "Plasma Rifle", system: { description: { value: `<p>Fires plasma.</p>\n${note}` } } };
        expect(plasmaRifleDescription(old)).toBe("<p>Fires plasma.</p>");
        expect(plasmaRifleDescription({ ...old, name: "Laser Rifle" })).toBeNull();
    });

    test("leaves the compendium Plasma Rifle's description alone", () => {
        const rifle = components.find(c => c.type === "mechWeapon" && c.name === "Plasma Rifle");
        expect(plasmaRifleDescription(rifle)).toBeNull();
    });

    test("leaves a cost the GM set and other weapons alone", () => {
        expect(plasmaRifleMpCost({ type: "mechWeapon", name: "Plasma Rifle", system: { mpCost: 6 } })).toBeNull();
        expect(plasmaRifleMpCost({ type: "mechWeapon", name: "Laser Rifle", system: { mpCost: 10 } })).toBeNull();
        expect(plasmaRifleMpCost({ type: "weapon", name: "Plasma Rifle", system: { mpCost: 10 } })).toBeNull();
    });
});

describe("componentPpFix", () => {
    const component = name => JSON.parse(readFileSync(join(__dirname, `../../items/mech-components/${name}.json`), "utf8"));
    const compendium = readdirSync(componentDir).filter(file => file.endsWith(".json"))
        .map(file => JSON.parse(readFileSync(join(componentDir, file), "utf8")))
        .filter(item => !Array.isArray(item));

    test("no compendium component needs a change, and only the Emergency Defense Sphere keeps a PP cost", () => {
        expect(compendium.filter(item => componentPpFix(item)).map(item => item.name)).toEqual([]);
        expect(compendium.filter(item => item.type !== "mechUpgrade" && item.system.ppCost > 0).map(item => item.name))
            .toEqual(["Emergency Defense Sphere"]);
    });

    test("the added actions match the compendium weapons", () => {
        for (const [file, name] of [["anti-materiel_gun_pod", "anti-materiel gun pod"], ["arc_pulserifle", "arc pulserifle"], ["buzzblade", "buzzblade"], ["flame_doshko", "flame doshko"], ["stinger_tail", "stinger tail"]]) {
            expect(component(file).system.actions).toEqual([ADDED_WEAPON_ACTIONS.get(name)]);
        }
    });

    test("an older copy gets its missing action and a PP cost of 0", () => {
        const buzzblade = component("buzzblade");
        expect(componentPpFix({ ...buzzblade, system: { ...buzzblade.system, actions: [], ppCost: 2 } }))
            .toEqual({ actions: buzzblade.system.actions, ppCost: 0 });
        const offgasser = component("offgasser");
        expect(componentPpFix({ ...offgasser, system: { ...offgasser.system, ppCost: 3 } })).toEqual({ ppCost: 0 });
        const auger = component("auger");
        expect(componentPpFix({ ...auger, system: { ...auger.system, ppCost: 2 } })).toEqual({ ppCost: 0 });
        const arms = component("assault_arms");
        expect(componentPpFix({ ...arms, system: { ...arms.system, ppCost: 1 } })).toEqual({ ppCost: 0 });
    });

    test("a component with no actions keeps its cost, and other item types are left alone", () => {
        const sphere = component("emergency_defense_sphere");
        expect(componentPpFix(sphere)).toBeNull();
        expect(componentPpFix({ type: "mechUpgrade", name: "Buzzblade", system: { ppCost: 2 } })).toBeNull();
        expect(componentPpFix({ type: "mechAuxiliary", name: "Buzzblade", system: { ppCost: 2, actions: [] } })).toBeNull();
    });
});

describe("attackPpCost", () => {
    test("a weapon's PP cost is spent on each attack, and no other item's is", () => {
        expect(attackPpCost({ type: "mechWeapon", system: { ppCost: 2 } })).toBe(2);
        expect(attackPpCost({ type: "mechWeapon", system: { ppCost: -1 } })).toBe(0);
        expect(attackPpCost({ type: "mechAuxiliary", system: { ppCost: 3 } })).toBe(0);
    });
});
