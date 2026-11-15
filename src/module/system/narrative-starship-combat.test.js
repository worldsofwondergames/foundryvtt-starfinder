import { describe, expect, it } from "vitest";
import { crewByShip, isNarrativeCombat } from "./narrative-starship-combat.js";

function fakeCombat({ started = true, type = "narrativeStarship", ships = [] } = {}) {
    return {
        started,
        getCombatType: () => type,
        combatants: ships.map(ship => ({ actorId: ship.id, actor: ship }))
    };
}

describe("isNarrativeCombat", () => {
    it("is true only for a started narrative starship combat", () => {
        expect(isNarrativeCombat(fakeCombat())).toBe(true);
        expect(isNarrativeCombat(fakeCombat({ started: false }))).toBe(false);
        expect(isNarrativeCombat(fakeCombat({ type: "starship" }))).toBe(false);
    });
});

describe("crewByShip", () => {
    it("reads each player ship's crew from its actor and skips enemy ships", () => {
        const pc = { id: "pc1", system: { crew: { pilot: { actorIds: ["a1"] }, gunner: { actorIds: ["a2", "a3"] } } } };
        const enemy = { id: "e1", system: { crew: { pilot: { actorIds: ["x"] } } } };
        const state = { ships: { pc1: { side: "pc" }, e1: { side: "enemy" } } };
        const crew = crewByShip(fakeCombat({ ships: [pc, enemy] }), state);
        expect(Object.keys(crew)).toEqual(["pc1"]);
        expect(crew.pc1.gunner).toEqual(pc.system.crew.gunner.actorIds);
        expect(crew.pc1.pilot).toEqual(pc.system.crew.pilot.actorIds);
        expect(crew.pc1.captain).toEqual([]);
    });
});
