import { describe, expect, it } from "vitest";
import { countedMechUpgrades, maxMechUpgrades, upgradeLimitRefusal } from "./mech-upgrade-limit.js";

describe("maxMechUpgrades", () => {
    it("allows half the tier, rounded down", () => {
        expect([1, 2, 3, 4, 5, 20].map(maxMechUpgrades)).toEqual([0, 1, 1, 2, 2, 10]);
    });
});

describe("countedMechUpgrades", () => {
    it("counts the mech's upgrades and leaves out other components and those a mission pod added", () => {
        const items = [
            { type: "mechUpgrade" },
            { type: "mechUpgrade", flags: { sfrpg: { fromMissionPod: "pod1" } } },
            { type: "mechAuxiliary" },
            { type: "mechUpgrade" }
        ];
        expect(countedMechUpgrades(items)).toBe(2);
    });
});

describe("upgradeLimitRefusal", () => {
    it("refuses an upgrade beyond the limit, naming it", () => {
        expect(upgradeLimitRefusal({ enabled: true, tier: 5, current: 2 })).toEqual({ max: 2 });
    });

    it("allows an upgrade under the limit", () => {
        expect(upgradeLimitRefusal({ enabled: true, tier: 5, current: 1 })).toBeNull();
    });

    it("allows any number of upgrades with the house rule off", () => {
        expect(upgradeLimitRefusal({ enabled: false, tier: 1, current: 6 })).toBeNull();
    });
});
