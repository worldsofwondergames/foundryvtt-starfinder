import { describe, expect, it } from "vitest";
import {
    crewActionGroups,
    hpFromPipClick,
    hpPips,
    narrativeLayout,
    narrativeStatRows,
    normalizeNarrativeFormData,
    skillModifierView
} from "./sheet-view.js";

const derived = {
    averageDC: 14,
    hardDC: 19,
    hpMax: 5,
    hpValue: 3,
    threshold: 3,
    skillBonus: 9,
    skillBonusGuessed: true,
    sources: {
        averageDC: "SFRPG.NarrativeStarship.Source.Tier",
        hardDC: "SFRPG.NarrativeStarship.Source.ArmorMark",
        hpMax: "SFRPG.NarrativeStarship.Source.Size",
        threshold: "SFRPG.NarrativeStarship.Source.Shields",
        skillBonus: "SFRPG.NarrativeStarship.Source.Guessed"
    }
};

describe("narrativeLayout", () => {
    it("uses the NPC layout for an NPC crew and the PC layout otherwise", () => {
        expect(narrativeLayout(true)).toBe("npc");
        expect(narrativeLayout(false)).toBe("pc");
    });
});

describe("hpPips", () => {
    it("fills pips up to the current HP", () => {
        expect(hpPips(3, 5).map(p => p.filled)).toEqual([true, true, true, false, false]);
    });

    it("makes one pip per max HP", () => {
        expect(hpPips(9, 4)).toHaveLength(4);
    });

    it("numbers pips from 1", () => {
        expect(hpPips(1, 2).map(p => p.index)).toEqual([1, 2]);
    });
});

describe("hpFromPipClick", () => {
    it("sets HP to the clicked pip", () => {
        expect(hpFromPipClick(2, 4)).toBe(2);
    });

    it("empties the last filled pip when it is clicked", () => {
        expect(hpFromPipClick(4, 4)).toBe(3);
    });
});

describe("narrativeStatRows", () => {
    it("lists the NPC stat block fields in order", () => {
        const rows = narrativeStatRows({ derived, hp: {} }, "npc");
        expect(rows.map(r => r.key)).toEqual(["averageDC", "hardDC", "hpMax", "threshold", "skillBonus"]);
    });

    it("leaves threshold and skill bonus off the PC layout", () => {
        const rows = narrativeStatRows({ derived, hp: {} }, "pc");
        expect(rows.map(r => r.key)).toEqual(["averageDC", "hardDC", "hpMax"]);
    });

    it("binds each row to the derived value and its source", () => {
        const rows = narrativeStatRows({ derived, hp: {} }, "npc");
        const hard = rows.find(r => r.key === "hardDC");
        expect(hard.value).toBe(derived.hardDC);
        expect(hard.source).toBe(derived.sources.hardDC);
    });

    it("shows a stored override and leaves an unset override blank", () => {
        const rows = narrativeStatRows({ derived, averageDC: 20, hardDC: null, hp: { max: 7 } }, "npc");
        expect(rows.find(r => r.key === "averageDC").override).toBe(20);
        expect(rows.find(r => r.key === "hardDC").override).toBe("");
        expect(rows.find(r => r.key === "hpMax").override).toBe(7);
    });

    it("binds the HP override input to hp.max", () => {
        const rows = narrativeStatRows({ derived, hp: {} }, "npc");
        expect(rows.find(r => r.key === "hpMax").name).toBe("system.narrative.hp.max");
    });

    it("flags only a guessed skill bonus", () => {
        const guessed = narrativeStatRows({ derived, hp: {} }, "npc");
        expect(guessed.find(r => r.key === "skillBonus").guessed).toBe(true);
        expect(guessed.find(r => r.key === "threshold").guessed).toBe(false);
        const known = narrativeStatRows({ derived: { ...derived, skillBonusGuessed: false }, hp: {} }, "npc");
        expect(known.find(r => r.key === "skillBonus").guessed).toBe(false);
    });
});

describe("skillModifierView", () => {
    const skills = { pil: "Piloting", eng: "Engineering", com: "Computers" };

    it("lists stored modifiers sorted by label", () => {
        const view = skillModifierView({ pil: 2, eng: -1 }, skills);
        expect(view.rows).toEqual([
            { key: "eng", label: "Engineering", value: -1 },
            { key: "pil", label: "Piloting", value: 2 }
        ]);
    });

    it("offers only skills that have no modifier yet", () => {
        const view = skillModifierView({ pil: 2 }, skills);
        expect(view.available.map(s => s.key)).toEqual(["com", "eng"]);
    });
});

describe("normalizeNarrativeFormData", () => {
    it("saves an empty override as null", () => {
        const data = normalizeNarrativeFormData({ "system.narrative.averageDC": "", "system.narrative.hp.max": null });
        expect(data["system.narrative.averageDC"]).toBeNull();
        expect(data["system.narrative.hp.max"]).toBeNull();
    });

    it("keeps a typed override as a number", () => {
        const data = normalizeNarrativeFormData({ "system.narrative.hardDC": "21" });
        expect(data["system.narrative.hardDC"]).toBe(21);
    });

    it("keeps an override of zero", () => {
        const data = normalizeNarrativeFormData({ "system.narrative.threshold": 0 });
        expect(data["system.narrative.threshold"]).toBe(0);
    });

    it("saves an empty skill modifier as 0", () => {
        const data = normalizeNarrativeFormData({ "system.narrative.skillModifiers.pil": null });
        expect(data["system.narrative.skillModifiers.pil"]).toBe(0);
    });

    it("does not add fields that were not submitted", () => {
        const data = normalizeNarrativeFormData({ name: "Ship" });
        expect(data).toEqual({ name: "Ship" });
    });
});

describe("crewActionGroups", () => {
    const actions = {
        b: { role: "gunner", preferred: ["pil", "rangedAttack"], hardAlways: false },
        a: { role: "captain", preferred: "any", hardAlways: true },
        c: { role: "captain", preferred: ["int"], hardAlways: false }
    };
    const skills = { pil: "Piloting", int: "Intimidate", rangedAttack: "Ranged attack" };

    it("groups actions by role in the given order and leaves out empty roles", () => {
        const groups = crewActionGroups(actions, ["any", "captain", "gunner"], skills);
        expect(groups.map(g => g.role)).toEqual(["captain", "gunner"]);
        expect(groups[0].actions.map(a => a.key)).toEqual(["a", "c"]);
    });

    it("names the preferred skills, or marks an action that takes any skill", () => {
        const [captain, gunner] = crewActionGroups(actions, ["captain", "gunner"], skills);
        expect(captain.actions[0]).toMatchObject({ anySkill: true, skills: "", hardAlways: true });
        expect(captain.actions[1]).toMatchObject({ anySkill: false, skills: "Intimidate", hardAlways: false });
        expect(gunner.actions[0].skills).toBe("Piloting, Ranged attack");
    });
});
