import { describe, expect, it } from "vitest";
import { addModifier, addShipToState, addSuccesses, canAct, grantExtraAction, initialState, modifiersFor, recordAction, resolveRound } from "./state.js";

const SHIPS = [
    { id: "pc1", side: "pc", crew: {} },
    { id: "e1", side: "enemy", crew: {} },
    { id: "e2", side: "enemy", crew: {} }
];
const CREW = { pc1: { pilot: ["a1"], gunner: ["a2"] } };
const withSuccesses = (id, n, ships = SHIPS) => addSuccesses(initialState(ships), id, n);

function deepFreeze(value) {
    if (value && typeof value === "object") {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}

describe("canAct", () => {
    const s = initialState(SHIPS);
    it("refuses a player who is not assigned to the role", () => {
        expect(canAct(s, { shipId: "pc1", actorId: "stranger", role: "pilot" }, CREW).reason).toBe("notCrew");
    });
    it("refuses enemy ships and unknown ships", () => {
        expect(canAct(s, { shipId: "e1", actorId: "a1", role: "pilot" }, CREW).reason).toBe("wrongSide");
        expect(canAct(s, { shipId: "nope", actorId: "a1", role: "pilot" }, CREW).reason).toBe("wrongSide");
    });
    it("accepts assigned crew who have not acted", () => {
        expect(canAct(s, { shipId: "pc1", actorId: "a1", role: "pilot" }, CREW)).toEqual({ ok: true });
    });
    it("refuses the crew of a player ship that is out of the fight", () => {
        const who = { shipId: "pc1", actorId: "a1", role: "pilot" };
        const out = initialState(SHIPS);
        out.ships.pc1.flags = ["out"];
        expect(canAct(out, who, CREW)).toEqual({ ok: false, reason: "shipOut" });
    });
    it("refuses a second action unless Give Orders granted one", () => {
        const acted = recordAction(s, "a1", "piloting");
        const who = { shipId: "pc1", actorId: "a1", role: "pilot" };
        expect(canAct(acted, who, CREW).reason).toBe("alreadyActed");
        expect(canAct(grantExtraAction(acted, "a1"), who, CREW).ok).toBe(true);
    });
});

describe("addShipToState", () => {
    it("adds a ship that joins a started combat with a fresh entry and leaves the others alone", () => {
        const before = deepFreeze(withSuccesses("e1", 2));
        const next = addShipToState(before, { id: "e3", side: "enemy" });
        expect(next.ships.e3).toEqual({
            side: "enemy", successes: 0, hitsThisRound: 0, tactic: null, tacticTarget: null, forcedTactic: null, flags: []
        });
        expect(next.usedOnce.e3).toEqual([]);
        expect(next.ships.e1).toBe(before.ships.e1);
        expect(addShipToState(before, { id: "pc9", side: "pc" }).ships.pc9.side).toBe("pc");
    });

    it("changes nothing when the ship is already in the state", () => {
        const before = deepFreeze(withSuccesses("e1", 2));
        expect(addShipToState(before, { id: "e1", side: "pc" })).toBe(before);
    });
});

describe("recordAction", () => {
    it("counts actions and keeps every skill used this round", () => {
        let s = recordAction(initialState(SHIPS), "a1", "piloting");
        s = recordAction(s, "a1", "computers");
        expect(s.actedThisRound.a1).toBe(2);
        expect(s.skillsThisRound.a1).toEqual(["piloting", "computers"]);
    });
});

describe("modifiers", () => {
    it("expire after their round", () => {
        const s = addModifier(initialState(SHIPS), { target: "pc1", kind: "skill", value: -1, expiresAfterRound: 1 });
        expect(modifiersFor(s, "pc1", "skill", 1)).toBe(-1);
        expect(modifiersFor(s, "pc1", "skill", 2)).toBe(0);
    });
    it("sum only matching target and kind", () => {
        let s = addModifier(initialState(SHIPS), { target: "pc1", kind: "skill", value: 2, expiresAfterRound: 3 });
        s = addModifier(s, { target: "pc1", kind: "skill", value: 1, expiresAfterRound: 3 });
        s = addModifier(s, { target: "pc1", kind: "dc", value: 5, expiresAfterRound: 3 });
        s = addModifier(s, { target: "e1", kind: "skill", value: 7, expiresAfterRound: 3 });
        expect(modifiersFor(s, "pc1", "skill", 2)).toBe(3);
    });
    it("do not count before their first round", () => {
        const s = addModifier(initialState(SHIPS), { target: "e1", kind: "enemySkill", value: -2, expiresAfterRound: 2, fromRound: 2 });
        expect(modifiersFor(s, "e1", "enemySkill", 1)).toBe(0);
        expect(modifiersFor(s, "e1", "enemySkill", 2)).toBe(-2);
    });
});

describe("resolveRound", () => {
    const stats = { e1: { threshold: 3, hp: 5 }, e2: { threshold: 3, hp: 5 }, pc1: { threshold: 2, hp: 4 } };
    const hp = { e1: 5, e2: 5, pc1: 4 };

    it("converts successes to hits and carries the remainder", () => {
        const r = resolveRound(withSuccesses("e1", 8), stats, hp, 1);
        expect(r.hits.e1).toBe(2);
        expect(r.state.ships.e1.successes).toBe(2);
    });
    it("converts hits on player ships too", () => {
        const r = resolveRound(withSuccesses("pc1", 5), stats, hp, 1);
        expect(r.hits.pc1).toBe(2);
        expect(r.state.ships.pc1.successes).toBe(1);
    });
    it("puts a ship out and ends the combat when it is the last enemy", () => {
        const two = [SHIPS[0], SHIPS[1]];
        const r = resolveRound(withSuccesses("e1", 6, two), stats, { e1: 2, pc1: 4 }, 1);
        expect(r.out).toEqual(["e1"]);
        expect(r.ended).toBe("pcWin");
    });
    it("does not end while an enemy remains, and counts earlier casualties", () => {
        const r = resolveRound(withSuccesses("e1", 6), stats, { e1: 2, e2: 5, pc1: 4 }, 1);
        expect(r.ended).toBe(null);
        const r2 = resolveRound(withSuccesses("e1", 6), stats, { e1: 2, e2: 0, pc1: 4 }, 1);
        expect(r2.out).toEqual(["e1"]);
        expect(r2.ended).toBe("pcWin");
    });
    it("reports a loss, and a loss wins over a win", () => {
        const r = resolveRound(withSuccesses("pc1", 8), stats, { e1: 5, e2: 5, pc1: 4 }, 1);
        expect(r.out).toEqual(["pc1"]);
        expect(r.ended).toBe("pcLoss");
        const both = addSuccesses(withSuccesses("pc1", 8), "e1", 15);
        const two = resolveRound(both, stats, { e1: 5, e2: 0, pc1: 4 }, 1);
        expect(two.ended).toBe("pcLoss");
    });
    it("clears per-round data and moves this round's skills to last round", () => {
        let s = withSuccesses("e1", 3);
        s = recordAction(s, "a1", "piloting");
        s = grantExtraAction(s, "a1");
        s = addModifier(s, { target: "pc1", kind: "skill", value: 1, expiresAfterRound: 1 });
        s = addModifier(s, { target: "pc1", kind: "dc", value: 1, expiresAfterRound: 2 });
        const r = resolveRound(s, stats, hp, 1);
        expect(r.hits.e1).toBe(1);
        expect(r.state.ships.e1.hitsThisRound).toBe(0);
        expect(r.state.actedThisRound).toEqual({});
        expect(r.state.allowedActions).toEqual({});
        expect(r.state.skillsLastRound).toEqual({ a1: ["piloting"] });
        expect(r.state.skillsThisRound).toEqual({});
        expect(r.state.modifiers.map(m => m.kind)).toEqual(["dc"]);
    });
});

describe("purity", () => {
    it("never mutates input and stays plain JSON", () => {
        const s = deepFreeze(withSuccesses("e1", 4));
        const results = [
            addSuccesses(s, "e1", 1),
            recordAction(s, "a1", "piloting"),
            grantExtraAction(s, "a1"),
            addModifier(s, { target: "e1", kind: "skill", value: 1, expiresAfterRound: 1 }),
            resolveRound(s, { e1: { threshold: 3, hp: 5 } }, { e1: 5 }, 1).state
        ];
        for (const r of results) expect(JSON.parse(JSON.stringify(r))).toEqual(r);
        expect(s.ships.e1.successes).toBe(4);
    });
});
