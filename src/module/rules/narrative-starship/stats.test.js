import { describe, expect, it } from "vitest";
import { deriveNarrativeStats, markFromName, narrativeDCs, narrativeHP, shieldThreshold, skillBonusFromCrew } from "./stats.js";

describe("narrativeDCs", () => {
    it("uses the standard formula", () => {
        expect(narrativeDCs(7, false)).toEqual({ average: 20, hard: 25 });
        expect(narrativeDCs(1, false)).toEqual({ average: 11, hard: 16 });
        expect(narrativeDCs(0.5, false)).toEqual({ average: 10, hard: 15 });
    });

    it("uses the alternate table", () => {
        expect(narrativeDCs(1, true)).toEqual({ average: 12, hard: 17 });
        expect(narrativeDCs(14, true)).toEqual({ average: 24, hard: 29 });
        expect(narrativeDCs(20, true)).toEqual({ average: 28, hard: 33 });
    });

    it("uses the standard formula under tier 1 even when alternate", () => {
        expect(narrativeDCs(0.25, true)).toEqual({ average: 10, hard: 15 });
    });
});

describe("markFromName", () => {
    it("reads the Mk number", () => {
        expect(markFromName("Mk 10 armor")).toBe(10);
    });

    it("returns null with no Mk", () => {
        expect(markFromName("Basic Shields 10")).toBeNull();
    });
});

describe("shieldThreshold", () => {
    it("maps the first word to a category", () => {
        expect(shieldThreshold("Light Shields 60")).toBe(2);
        expect(shieldThreshold("Basic Deflector Shield 1")).toBe(2);
        expect(shieldThreshold("Medium Shields 90")).toBe(3);
        expect(shieldThreshold("Superior Shields 600")).toBe(4);
        expect(shieldThreshold("heavy shields 120")).toBe(4);
    });

    it("gives 2 for no shields and 3 for an unreadable name", () => {
        expect(shieldThreshold(null)).toBe(2);
        expect(shieldThreshold("Algal Shielding")).toBe(3);
    });
});

describe("narrativeHP", () => {
    it("adjusts for size", () => {
        expect(narrativeHP("tiny", false)).toBe(4);
        expect(narrativeHP("colossal", false)).toBe(6);
        expect(narrativeHP("gargantuan", false)).toBe(6);
        expect(narrativeHP("supercolossal", false)).toBe(6);
        expect(narrativeHP("medium", false)).toBe(5);
    });

    it("is always 5 for PC ships", () => {
        expect(narrativeHP("tiny", true)).toBe(5);
        expect(narrativeHP("colossal", true)).toBe(5);
    });
});

describe("skillBonusFromCrew", () => {
    it("uses the second-highest mod", () => {
        expect(skillBonusFromCrew([12, 15, 9], 7)).toEqual({ value: 12, guessed: false });
    });

    it("uses the only mod minus 3", () => {
        expect(skillBonusFromCrew([15], 7)).toEqual({ value: 12, guessed: false });
    });

    it("guesses from tier with no crew", () => {
        expect(skillBonusFromCrew([], 7)).toEqual({ value: 15, guessed: true });
    });
});

describe("deriveNarrativeStats", () => {
    const base = {
        tier: 7,
        size: "medium",
        isPC: false,
        armorName: null,
        defensesName: null,
        shieldName: null,
        crewSkillMods: [],
        overrides: {},
        useAlternate: false
    };

    it("adds 1 to both DCs when the highest mark reaches the tier", () => {
        const r = deriveNarrativeStats({ ...base, armorName: "Mk 7 armor" });
        expect([r.averageDC, r.hardDC]).toEqual([21, 26]);
        expect(r.sources.averageDC).toBe("SFRPG.NarrativeStarship.Source.ArmorMark");
    });

    it("subtracts 1 when every present mark is under half the tier", () => {
        const r = deriveNarrativeStats({ ...base, tier: 8, armorName: "Mk 3 armor", defensesName: "Mk 3 defenses" });
        expect([r.averageDC, r.hardDC]).toEqual([21, 26]);
    });

    it("does not adjust when a mark is between half and full tier", () => {
        const r = deriveNarrativeStats({ ...base, armorName: "Mk 5 armor", defensesName: "Mk 1 defenses" });
        expect([r.averageDC, r.hardDC]).toEqual([20, 25]);
        expect(r.sources.averageDC).toBe("SFRPG.NarrativeStarship.Source.Tier");
    });

    it("lets a non-null override win over each derived field", () => {
        const r = deriveNarrativeStats({
            ...base,
            crewSkillMods: [12, 15],
            overrides: { averageDC: 30, hardDC: 35, hpMax: 9, threshold: 4, skillBonus: 0 }
        });
        expect(r).toMatchObject({ averageDC: 30, hardDC: 35, hpMax: 9, threshold: 4, skillBonus: 0, skillBonusGuessed: false });
        for (const key of ["averageDC", "hardDC", "hpMax", "threshold", "skillBonus"]) {
            expect(r.sources[key]).toBe("SFRPG.NarrativeStarship.Source.Override");
        }
    });

    it("ignores null overrides", () => {
        const r = deriveNarrativeStats({ ...base, overrides: { averageDC: null, hpMax: undefined } });
        expect(r.averageDC).toBe(20);
        expect(r.hpMax).toBe(5);
    });

    it("handles an empty ship", () => {
        const r = deriveNarrativeStats(base);
        expect(r.threshold).toBe(2);
        expect(r.skillBonusGuessed).toBe(true);
        expect(r.skillBonus).toBe(15);
        expect(r.sources.skillBonus).toBe("SFRPG.NarrativeStarship.Source.Guessed");
    });

    it("derives hp and threshold from size and shields", () => {
        const r = deriveNarrativeStats({ ...base, size: "tiny", shieldName: "Heavy Shields 90" });
        expect(r.hpMax).toBe(4);
        expect(r.threshold).toBe(4);
        expect(r.sources.hpMax).toBe("SFRPG.NarrativeStarship.Source.Size");
        expect(r.sources.threshold).toBe("SFRPG.NarrativeStarship.Source.Shields");
    });

    it("clears the guessed flag when skillBonus is overridden on a ship with no crew", () => {
        const r = deriveNarrativeStats({ ...base, overrides: { skillBonus: 11 } });
        expect(r.skillBonus).toBe(11);
        expect(r.skillBonusGuessed).toBe(false);
    });
});
