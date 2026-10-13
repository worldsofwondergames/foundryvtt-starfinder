import { describe, expect, it } from "vitest";
import { addOngoingSource, averageOf, mergeRounds, ongoingConditionOf, ongoingFromCritical, ongoingSources, remainingHealth, sourceOf, tickRounds } from "./ongoing-damage.js";

describe("ongoingFromCritical", () => {
    it("reads Corrode's amount from its critical damage part", () => {
        expect(ongoingFromCritical({ effect: "Corrode", parts: [{ formula: "3d4" }] }))
            .toEqual({ condition: "corrode", formula: "3d4" });
    });

    it("reads Bleed's amount from the effect text", () => {
        expect(ongoingFromCritical({ effect: "Bleed 1d4", parts: [] })).toEqual({ condition: "bleeding", formula: "1d4" });
    });

    it("maps Burn to the Burning condition", () => {
        expect(ongoingFromCritical({ effect: "Burn", parts: [{ formula: "2d4" }] })).toEqual({ condition: "burning", formula: "2d4" });
    });

    it("reads Frostbite's amount from the effect text", () => {
        expect(ongoingFromCritical({ effect: "Frostbite 3d6", parts: [] })).toEqual({ condition: "frostbite", formula: "3d6" });
    });

    it("skips an empty critical part and returns no amount", () => {
        expect(ongoingFromCritical({ effect: "Corrode", parts: [{ formula: "" }] })).toEqual({ condition: "corrode", formula: null });
    });

    it("prefers the critical damage part over dice in the effect text", () => {
        expect(ongoingFromCritical({ effect: "Bleed 1d4", parts: [{ formula: "2d6" }] })).toEqual({ condition: "bleeding", formula: "2d6" });
    });

    it("uses the first critical part that has a formula", () => {
        expect(ongoingFromCritical({ effect: "Corrode", parts: [{ formula: "" }, { formula: "1d8" }] }))
            .toEqual({ condition: "corrode", formula: "1d8" });
    });

    it("returns null for an effect with no ongoing damage", () => {
        expect(ongoingFromCritical({ effect: "Staggered", parts: [] })).toBeNull();
    });

    it("returns null for a weapon with no critical data", () => {
        expect(ongoingFromCritical(undefined)).toBeNull();
    });
});

describe("averageOf", () => {
    it("averages dice with a bonus", () => {
        expect(averageOf("2d6+3")).toBe(10);
    });

    it("averages a flat number", () => {
        expect(averageOf("4")).toBe(4);
    });

    it("treats an unreadable formula as 0", () => {
        expect(averageOf("@abilities.str.mod")).toBe(0);
    });
});

describe("addOngoingSource", () => {
    it("gives Corrode an acid turn event at the start of the turn", () => {
        expect(addOngoingSource([], { condition: "corrode", formula: "3d4", name: "Corrode" })).toEqual([
            { trigger: "onTurnStart", type: "roll", formula: "3d4", damageTypes: { acid: true }, name: "Corrode" }
        ]);
    });

    it("keeps both sources of Burning, whose damage adds up", () => {
        const first = addOngoingSource([], { condition: "burning", formula: "1d6", name: "A" });
        const both = addOngoingSource(first, { condition: "burning", formula: "2d6", name: "B" });
        expect(both.map(e => e.formula)).toEqual(["1d6", "2d6"]);
    });

    it("keeps only the worse bleed", () => {
        const first = addOngoingSource([], { condition: "bleeding", formula: "2d6", name: "A" });
        const second = addOngoingSource(first, { condition: "bleeding", formula: "1d4", name: "B" });
        expect(second.map(e => e.formula)).toEqual(["2d6"]);
    });

    it("replaces a bleed with a worse one", () => {
        const first = addOngoingSource([], { condition: "bleeding", formula: "1d4", name: "A" });
        const second = addOngoingSource(first, { condition: "bleeding", formula: "2d6", name: "B" });
        expect(second.map(e => e.formula)).toEqual(["2d6"]);
    });

    it("gives Bleeding untyped damage", () => {
        expect(addOngoingSource([], { condition: "bleeding", formula: "1d4", name: "A" })[0].damageTypes).toEqual({});
    });

    it("leaves turn events it does not manage alone", () => {
        const note = { trigger: "onTurnEnd", type: "note", content: "x" };
        const out = addOngoingSource([note], { condition: "bleeding", formula: "1d4", name: "A" });
        expect(out[0]).toBe(note);
    });
});

describe("mergeRounds", () => {
    it("starts a new condition with its rounds", () => {
        expect(mergeRounds(null, 3, true)).toBe(3);
    });

    it("keeps the longer timer when a source is added", () => {
        expect(mergeRounds(2, 5, false)).toBe(5);
        expect(mergeRounds(5, 2, false)).toBe(5);
    });

    it("drops the timer when the new source has none", () => {
        expect(mergeRounds(4, null, false)).toBeNull();
    });

    it("leaves an untimed condition untimed", () => {
        expect(mergeRounds(null, 3, false)).toBeNull();
    });
});

describe("tickRounds", () => {
    it("counts down one round", () => {
        expect(tickRounds(3)).toEqual({ rounds: 2, expired: false });
    });

    it("expires on the last round", () => {
        expect(tickRounds(1)).toEqual({ rounds: 0, expired: true });
    });

    it("never expires a condition with no timer", () => {
        expect(tickRounds(null)).toEqual({ rounds: null, expired: false });
    });
});

describe("ongoingConditionOf", () => {
    it("finds the condition by slug", () => {
        expect(ongoingConditionOf({ type: "effect", name: "Corroded", system: { slug: "corrode" } })).toBe("corrode");
    });

    it("falls back to the name for items without a slug", () => {
        expect(ongoingConditionOf({ type: "effect", name: "Burning", system: {} })).toBe("burning");
    });

    it("ignores other conditions and other item types", () => {
        expect(ongoingConditionOf({ type: "effect", name: "Shaken", system: { slug: "shaken" } })).toBeNull();
        expect(ongoingConditionOf({ type: "feat", name: "Burning", system: { slug: "burning" } })).toBeNull();
    });
});

describe("ongoingSources", () => {
    it("keeps only the damage rolled at the start of the turn", () => {
        const events = [
            { type: "roll", trigger: "onTurnStart", formula: "1d6", name: "Corrode" },
            { type: "note", trigger: "onTurnStart", content: "x", formula: "1d4" },
            { type: "roll", trigger: "onTurnEnd", formula: "1d4" },
            { type: "roll", trigger: "onTurnStart", formula: "" }
        ];
        expect(ongoingSources(events)).toEqual([events[0]]);
    });
});

describe("remainingHealth", () => {
    it("adds Hit Points, Stamina Points and temporary Hit Points", () => {
        expect(remainingHealth({ hp: { value: 20, temp: "5" }, sp: { value: 7 } })).toBe(32);
    });

    it("counts a creature with no Stamina or temporary Hit Points", () => {
        expect(remainingHealth({ hp: { value: 20 } })).toBe(20);
    });
});

describe("sourceOf", () => {
    it("reads the weapon from a source's name", () => {
        expect(sourceOf("Corrode (Acid cannon)")).toBe("Acid cannon");
    });

    it("returns nothing for a source set by hand", () => {
        expect(sourceOf("Corrode")).toBe("");
        expect(sourceOf(undefined)).toBe("");
    });
});
