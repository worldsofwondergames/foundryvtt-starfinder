import { describe, expect, it } from "vitest";
import { chatCardItem } from "./card-item.js";

describe("chatCardItem", () => {
    const actor = { name: "Test PC" };
    const weapon = { name: "Arc Pulserifle" };

    it("returns null for a save or skill roll, whose only context is the actor", () => {
        const rollContext = { mainContext: "actor", allContexts: { actor: { entity: actor } } };
        expect(chatCardItem(rollContext)).toBeNull();
    });

    it("returns the item of an item roll", () => {
        const rollContext = { mainContext: "item", allContexts: { owner: { entity: actor }, item: { entity: weapon } } };
        expect(chatCardItem(rollContext)).toBe(weapon);
    });

    it("returns the weapon when a roll has a weapon context and no item context", () => {
        const rollContext = { mainContext: "", allContexts: { mech: { entity: actor }, weapon: { entity: weapon } } };
        expect(chatCardItem(rollContext)).toBe(weapon);
    });
});
