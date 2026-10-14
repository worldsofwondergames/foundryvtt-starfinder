import { describe, expect, it } from "vitest";
import { resolveEventData } from "./combat-event-data.js";

/** A combat holding the given combatants, looked up by id as Foundry's collection does. */
function combatOf(...combatants) {
    return { combatants: new Map(combatants.map(c => [c.id, c])) };
}

describe("resolveEventData", () => {
    const first = { id: "first", actor: { name: "Mech One" } };
    const last = { id: "last", actor: { name: "Mech Two" } };
    const combat = combatOf(first, last);

    it("finds the combatants that a player's update sent as plain data", () => {
        const sent = { oldCombatant: { _id: "last", name: "Mech Two" }, newCombatant: { _id: "first" } };

        const resolved = resolveEventData(sent, combat);

        expect(resolved.oldCombatant).toBe(last);
        expect(resolved.newCombatant).toBe(first);
    });

    it("finds the combatants when the update kept them as documents", () => {
        const resolved = resolveEventData({ oldCombatant: last, newCombatant: first }, combat);

        expect(resolved.oldCombatant).toBe(last);
        expect(resolved.newCombatant).toBe(first);
    });

    it("leaves out a combatant when the phase has no turns", () => {
        const resolved = resolveEventData({ oldCombatant: { _id: "last" }, newCombatant: null }, combat);

        expect(resolved.oldCombatant).toBe(last);
        expect(resolved.newCombatant).toBeNull();
    });

    it("points at the combat that was updated and keeps the rest of the event", () => {
        const sent = { combat: { _id: "plain" }, direction: 1, isNewTurn: true, oldRound: 3 };

        const resolved = resolveEventData(sent, combat);

        expect(resolved.combat).toBe(combat);
        expect(resolved).toMatchObject({ direction: 1, isNewTurn: true, oldRound: 3 });
    });
});
