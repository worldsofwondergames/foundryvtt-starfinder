import { describe, expect, it } from "vitest";
import {
    REPAIR_COOLDOWN_SECONDS,
    actionHeal,
    healDice,
    healFormula,
    healedHitPoints,
    naniteSwarmUpdate,
    repairCooldownRemaining
} from "./mech-heal.js";

describe("actionHeal", () => {
    it("reads a self heal", () => {
        expect(actionHeal({ healFormula: "1d6 * @tier", healTarget: "self" }))
            .toEqual({ formula: "1d6 * @tier", target: "self", range: null });
    });

    it("reads a targeted heal with its range", () => {
        expect(actionHeal({ healFormula: "1d6 * @tier", healTarget: "target", healRange: 100 }))
            .toEqual({ formula: "1d6 * @tier", target: "target", range: 100 });
    });

    it("returns null for an action that declares no heal", () => {
        expect(actionHeal({ name: "Aim" })).toBeNull();
        expect(actionHeal({ healFormula: "" })).toBeNull();
    });

    it("refuses a formula a roll could not use as a heal", () => {
        expect(actionHeal({ healFormula: "1d6 * @mech.attributes.hp.max" })).toBeNull();
    });
});

describe("healFormula", () => {
    it("multiplies one die by the mech's tier rather than rolling a die per tier", () => {
        expect(healFormula("1d6 * @tier", 3)).toBe("1d6 * 3");
    });
});

describe("healDice", () => {
    it("finds the dice the card's link was built from", () => {
        expect(healDice("1d6 * 3")).toBe("1d6");
    });
});

describe("healedHitPoints", () => {
    it("adds the roll to the mech's Hit Points", () => {
        expect(healedHitPoints({ value: 10, max: 40 }, 12)).toEqual({ value: 22, gained: 12 });
    });

    it("stops at the maximum and reports what the mech gained", () => {
        expect(healedHitPoints({ value: 35, max: 40 }, 12)).toEqual({ value: 40, gained: 5 });
    });
});

describe("repairCooldownRemaining", () => {
    it("lets a mech that was never repaired be repaired", () => {
        expect(repairCooldownRemaining(undefined, 5000)).toBe(0);
    });

    it("refuses a second repair within 24 in-world hours", () => {
        expect(repairCooldownRemaining(1000, 1000 + 3600)).toBe(REPAIR_COOLDOWN_SECONDS - 3600);
    });

    it("allows a repair once 24 in-world hours have passed", () => {
        expect(repairCooldownRemaining(1000, 1000 + REPAIR_COOLDOWN_SECONDS)).toBe(0);
    });

    it("allows a repair when the clock was wound back past the last one", () => {
        expect(repairCooldownRemaining(9000, 1000)).toBe(0);
    });
});

describe("naniteSwarmUpdate", () => {
    const oldCopy = () => ({
        type: "mechAuxiliary",
        name: "Nanite Swarm Repair",
        system: {
            actions: [
                { name: "Reconstruction", description: "Heal 1d6 x the mech's tier.", ppCost: 3, healFormula: "", healTarget: "", healRange: null },
                { name: "Builder Swarm", description: "Heal 1d6 x the mech's tier.", ppCost: 4, healFormula: "", healTarget: "", healRange: null }
            ]
        }
    });

    it("declares Reconstruction's heal on the mech itself and Builder Swarm's on a target within 100 feet", () => {
        const [reconstruction, builder] = naniteSwarmUpdate(oldCopy())["system.actions"];
        expect(actionHeal(reconstruction)).toEqual({ formula: "1d6 * @tier", target: "self", range: null });
        expect(actionHeal(builder)).toEqual({ formula: "1d6 * @tier", target: "target", range: 100 });
    });

    it("keeps each action's Power Point cost and text", () => {
        const actions = naniteSwarmUpdate(oldCopy())["system.actions"];
        expect(actions.map(action => [action.ppCost, action.description])).toEqual([
            [3, "Heal 1d6 x the mech's tier."],
            [4, "Heal 1d6 x the mech's tier."]
        ]);
    });

    it("leaves a copy that already has its heals alone", () => {
        const item = oldCopy();
        item.system.actions = naniteSwarmUpdate(item)["system.actions"];
        expect(naniteSwarmUpdate(item)).toEqual({});
    });

    it("leaves other components alone", () => {
        expect(naniteSwarmUpdate({ ...oldCopy(), name: "Thrusters" })).toEqual({});
    });
});
