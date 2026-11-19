import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";
import { PROJECT_DOUBLE, afterPaying, isEmergencySphere, sphereTriggered, upkeepCost, upkeepDataFix } from "./mech-upkeep.js";

const component = name => JSON.parse(readFileSync(join(__dirname, `../../items/mech-components/${name}.json`), "utf8"));

describe("upkeepCost", () => {
    test("the compendium Holodouble Projector costs 1 PP a turn, and other systems none", () => {
        expect(upkeepCost(component("holodouble_projector"))).toBe(1);
        expect(upkeepCost(component("emergency_defense_sphere"))).toBeNull();
        expect(upkeepCost({ ...component("holodouble_projector"), type: "mechWeapon" })).toBeNull();
    });
});

describe("isEmergencySphere", () => {
    test("matches the compendium sphere and nothing else", () => {
        expect(isEmergencySphere(component("emergency_defense_sphere"))).toBe(true);
        expect(isEmergencySphere(component("holodouble_projector"))).toBe(false);
    });
});

describe("sphereTriggered", () => {
    test("fires when damage crosses ¼ of the mech's Hit Points", () => {
        expect(sphereTriggered({ value: 10, previousValue: 11, max: 40 })).toBe(true);
        expect(sphereTriggered({ value: 0, previousValue: 40, max: 40 })).toBe(true);
    });

    test("does not fire above ¼, or for a mech already at ¼ or below", () => {
        expect(sphereTriggered({ value: 11, previousValue: 30, max: 40 })).toBe(false);
        expect(sphereTriggered({ value: 5, previousValue: 10, max: 40 })).toBe(false);
        expect(sphereTriggered({ value: 0, previousValue: 5, max: 0 })).toBe(false);
    });
});

describe("afterPaying", () => {
    test("takes the cost when the mech has enough, and refuses when it doesn't", () => {
        expect(afterPaying(3, 3)).toBe(0);
        expect(afterPaying(5, 1)).toBe(4);
        expect(afterPaying(2, 3)).toBeNull();
    });
});

describe("upkeepDataFix", () => {
    test("the compendium items need no change", () => {
        expect(upkeepDataFix(component("holodouble_projector"))).toBeNull();
        expect(upkeepDataFix(component("emergency_defense_sphere"))).toBeNull();
    });

    test("an older Holodouble Projector gets the compendium's action, and an older sphere its cost", () => {
        const holodouble = component("holodouble_projector");
        expect(upkeepDataFix({ ...holodouble, system: { ...holodouble.system, actions: [] } }))
            .toEqual({ actions: holodouble.system.actions });
        expect(PROJECT_DOUBLE).toEqual(holodouble.system.actions[0]);
        const sphere = component("emergency_defense_sphere");
        expect(upkeepDataFix({ ...sphere, system: { ...sphere.system, ppCost: 0 } })).toEqual({ ppCost: sphere.system.ppCost });
        expect(upkeepDataFix(component("offgasser"))).toBeNull();
    });
});
