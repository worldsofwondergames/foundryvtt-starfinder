import { describe, expect, it, vi } from "vitest";
import { crewByShip, isNarrativeCombat, queueForCombat, sharedShipActors } from "./narrative-starship-combat.js";

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

describe("sharedShipActors", () => {
    it("names each starship actor with more than one combatant", () => {
        const starship = { type: "starship" };
        const combatants = [
            { actorId: "s1", actor: starship },
            { actorId: "s1", actor: starship },
            { actorId: "s2", actor: starship },
            { actorId: "c1", actor: { type: "character" } },
            { actorId: "c1", actor: { type: "character" } },
            { actorId: "gone", actor: null }
        ];
        expect(sharedShipActors(combatants)).toEqual(["s1"]);
        expect(sharedShipActors(combatants.slice(1))).toEqual([]);
    });
});

describe("queueForCombat", () => {
    it("runs a combat's jobs one after another", async () => {
        const order = [];
        let release;
        const first = queueForCombat("c1", () => new Promise(resolve => {
            release = resolve;
        }).then(() => order.push("first")));
        const second = queueForCombat("c1", async () => order.push("second"));
        await Promise.resolve();
        expect(order).toEqual([]);
        release();
        await Promise.all([first, second]);
        expect(order).toEqual(["first", "second"]);
    });

    it("still runs the next job after one throws", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const failing = queueForCombat("c2", async () => {
            throw new Error("boom");
        });
        const next = queueForCombat("c2", async () => "ran");
        await failing;
        expect(error).toHaveBeenCalledTimes(1);
        expect(await next).toBe("ran");
        error.mockRestore();
    });
});
