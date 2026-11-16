import { describe, expect, it } from "vitest";
import { narrativeInputFromShip } from "./actor-input.js";

describe("narrativeInputFromShip", () => {
    it("handles an empty ship", () => {
        const system = { details: { tier: 3, size: "medium" }, crew: { useNPCCrew: true }, narrative: { hp: {} } };
        expect(narrativeInputFromShip(system, [], false)).toEqual({
            tier: 3,
            size: "medium",
            isPC: false,
            armorName: null,
            defensesName: null,
            shieldName: null,
            crewSkillMods: [],
            overrides: { averageDC: undefined, hardDC: undefined, hpMax: undefined, threshold: undefined, skillBonus: undefined },
            useAlternate: false
        });
    });

    it("collects item names, crew skills without gunnery, and overrides", () => {
        const system = {
            details: { tier: 8, size: "large" },
            crew: {
                useNPCCrew: false,
                npcData: {
                    captain: { skills: { dip: { mod: 12 }, gun: { mod: 20 }, eng: { mod: "x" } } },
                    gunner: { skills: { gun1: { mod: 25 }, pil: { mod: 9 } } }
                }
            },
            narrative: { averageDC: 22, hardDC: null, hp: { max: 7 }, threshold: 3, skillBonus: 15 }
        };
        const items = [
            { type: "weapon", name: "Laser" },
            { type: "starshipArmor", name: "Mk 5 armor" },
            { type: "starshipArmor", name: "Mk 9 armor" },
            { type: "starshipShield", name: "Heavy Shields 120" }
        ];
        const input = narrativeInputFromShip(system, items, true);
        expect(input.isPC).toBe(true);
        expect(input.armorName).toBe("Mk 5 armor");
        expect(input.defensesName).toBeNull();
        expect(input.shieldName).toBe("Heavy Shields 120");
        expect(input.crewSkillMods).toEqual([12, 9]);
        expect(input.overrides).toEqual({ averageDC: 22, hardDC: null, hpMax: 7, threshold: 3, skillBonus: 15 });
        expect(input.useAlternate).toBe(true);
    });
});
