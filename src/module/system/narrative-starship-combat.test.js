import { describe, expect, it, vi } from "vitest";
import { crewByShip, isNarrativeCombat, queueForCombat, sharedShipActors, unlinkedPcShips, usableSkills } from "./narrative-starship-combat.js";

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

describe("usableSkills", () => {
    const skill = (enabled, extra = {}) => ({ enabled, isTrainedOnly: false, ranks: 0, ...extra });
    it("gives a character every skill although each has enabled false, leaving out trained-only skills without ranks", () => {
        const character = {
            type: "character",
            system: {
                skills: {
                    pil: skill(false, { ranks: 4 }),
                    acr: skill(false),
                    dis: skill(false, { isTrainedOnly: true }),
                    eng: skill(false, { isTrainedOnly: true, ranks: 2 })
                }
            }
        };
        expect(usableSkills(character)).toEqual(["pil", "acr", "eng"]);
    });
    it("gives an NPC only the skills it has enabled", () => {
        const npc = { type: "npc2", system: { skills: { pil: skill(true, { ranks: 10 }), acr: skill(false), eng: skill(true, { isTrainedOnly: true, ranks: 12 }) } } };
        expect(usableSkills(npc)).toEqual(["pil", "eng"]);
    });
    it("gives a drone only the skills its chassis and mods enable", () => {
        const drone = { type: "drone", system: { skills: { per: skill(true, { ranks: 3 }), ste: skill(false) } } };
        expect(usableSkills(drone)).toEqual(["per"]);
    });
});

describe("unlinkedPcShips", () => {
    const pcShip = { type: "starship", system: { crew: { useNPCCrew: false } } };
    const enemyShip = { type: "starship", system: { crew: { useNPCCrew: true } } };
    it("names each PC ship whose combatant token is not linked to its actor, once", () => {
        const combatants = [
            { actorId: "pc1", actor: pcShip, token: { actorLink: false } },
            { actorId: "pc1", actor: pcShip, token: { actorLink: false } },
            { actorId: "pc2", actor: pcShip, token: { actorLink: true } },
            { actorId: "e1", actor: enemyShip, token: { actorLink: false } },
            { actorId: "c1", actor: { type: "character", system: {} }, token: { actorLink: false } },
            { actorId: "pc3", actor: pcShip, token: null },
            { actorId: "gone", actor: null, token: { actorLink: false } }
        ];
        expect(unlinkedPcShips(combatants)).toEqual(["pc1"]);
        expect(unlinkedPcShips(combatants.slice(2))).toEqual([]);
    });
});
