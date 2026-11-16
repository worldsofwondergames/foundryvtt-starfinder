import { describe, expect, it } from "vitest";
import {
    addCrewMember,
    crewActionGroups,
    crewActionDCGroups,
    dcNumbers,
    dcPlaceholders,
    tacticDCGroups,
    hpFromPipClick,
    hpPips,
    narrativeLayout,
    narrativeStatRows,
    normalizeNarrativeFormData,
    rollableCrew,
    skillModifierView,
    tacticButtonStates,
    tacticPrompt
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

describe("addCrewMember", () => {
    it("adds a new crew member at the end", () => {
        expect(addCrewMember(["a1"], "a2")).toEqual(["a1", "a2"]);
        expect(addCrewMember(undefined, "a1")).toEqual(["a1"]);
    });

    it("refuses a duplicate or a missing id", () => {
        expect(addCrewMember(["a1", "a2"], "a2")).toBeNull();
        expect(addCrewMember(["a1"], "")).toBeNull();
    });
});

describe("rollableCrew", () => {
    const ship = { crewPhase: true, side: "pc", out: false };
    const owns = id => id !== "other";

    it("lists the crew members the user owns during the Crew Actions phase", () => {
        expect(rollableCrew(ship, ["a1", "other", "a2", "a1"], owns)).toEqual(["a1", "a2"]);
    });

    it("lists no one outside the phase, on an enemy ship, or on a ship that is out", () => {
        expect(rollableCrew({ ...ship, crewPhase: false }, ["a1"], owns)).toEqual([]);
        expect(rollableCrew({ ...ship, side: "enemy" }, ["a1"], owns)).toEqual([]);
        expect(rollableCrew({ ...ship, out: true }, ["a1"], owns)).toEqual([]);
    });
});

describe("tacticButtonStates", () => {
    const statuses = [
        { key: "openFire", disabled: false },
        { key: "allOutAttack", disabled: true, reason: "locked" }
    ];

    it("uses the reason availableTactics gives for each tactic", () => {
        expect(tacticButtonStates(statuses, { chosen: false, minesPending: false })).toEqual({
            openFire: { disabled: false, reason: null },
            allOutAttack: { disabled: true, reason: "locked" }
        });
    });

    it("disables every tactic once the ship chose, or while its mines check is pending", () => {
        const chosen = tacticButtonStates(statuses, { chosen: true, minesPending: true });
        expect(chosen.openFire).toEqual({ disabled: true, reason: "alreadyChosen" });
        expect(chosen.allOutAttack.reason).toBe("alreadyChosen");
        const mines = tacticButtonStates(statuses, { chosen: false, minesPending: true });
        expect(mines.openFire).toEqual({ disabled: true, reason: "minesFirst" });
    });
});

describe("tacticPrompt", () => {
    const base = { pcTarget: true, pcShips: ["pc1", "pc2"], forced: null, round: 2 };

    it("asks for the target when there is more than one PC ship", () => {
        expect(tacticPrompt("openFire", base)).toEqual({ targetId: null, askTarget: true, askChoice: false });
    });

    it("uses the only PC ship without asking", () => {
        expect(tacticPrompt("openFire", { ...base, pcShips: ["pc2"] })).toEqual({ targetId: "pc2", askTarget: false, askChoice: false });
    });

    it("uses this round's forced target for the forced tactic, while that ship is in the fight", () => {
        const forced = { tactic: "openFire", targetShip: "pc2", round: 2 };
        expect(tacticPrompt("openFire", { ...base, forced })).toEqual({ targetId: "pc2", askTarget: false, askChoice: false });
        expect(tacticPrompt("openFire", { ...base, forced: { ...forced, round: 1 } }).askTarget).toBe(true);
        expect(tacticPrompt("openFire", { ...base, pcShips: ["pc1", "pc3"], forced }).askTarget).toBe(true);
    });

    it("asks nothing for a tactic without a PC target, and always asks Cruel Taunt's DC", () => {
        expect(tacticPrompt("takeCover", { ...base, pcTarget: false })).toEqual({ targetId: null, askTarget: false, askChoice: false });
        expect(tacticPrompt("cruelTaunt", { ...base, pcShips: ["pc1"] })).toEqual({ targetId: "pc1", askTarget: false, askChoice: true });
    });
});

describe("dcNumbers", () => {
    it("gives one number when every ship shares the DC", () => {
        const ships = [{ name: "Bow", average: 19, hard: 24 }, { name: "Stern", average: 19, hard: 24 }];
        expect(dcNumbers("hard", ships)).toEqual([{ dc: 24, name: null }]);
        expect(dcNumbers("average", ships)).toEqual([{ dc: 19, name: null }]);
    });

    it("names each ship when their DCs differ", () => {
        const ships = [{ name: "Bow", average: 19, hard: 24 }, { name: "Stern", average: 21, hard: 26 }];
        expect(dcNumbers("hard", ships)).toEqual([{ dc: 24, name: "Bow" }, { dc: 26, name: "Stern" }]);
    });

    it("gives nothing when no DC is known", () => {
        expect(dcNumbers("hard", [])).toEqual([]);
        expect(dcNumbers("hard", [{ name: "Bow", average: 19 }])).toEqual([]);
    });
});

describe("crewActionDCGroups", () => {
    const own = { name: "Kestra", average: 20, hard: 25 };
    const enemies = [{ name: "Bow", average: 19, hard: 24 }];
    const dcs = groups => groups.map(g => [g.label, g.dcs[0]?.dc]);

    it("gives the Average DC for preferred skills and the Hard DC for other skills", () => {
        const action = { preferred: ["pil"], hardAlways: false, dcOf: "target" };
        expect(dcs(crewActionDCGroups(action, own, enemies))).toEqual([[null, 19], ["otherSkills", 24]]);
    });

    it("gives only the Hard DC for an action that always uses it", () => {
        const action = { preferred: "any", hardAlways: true, dcOf: "target" };
        expect(dcs(crewActionDCGroups(action, own, enemies))).toEqual([[null, 24]]);
    });

    it("gives only the Average DC when every skill is preferred", () => {
        const action = { preferred: "any", hardAlways: false, dcOf: "target" };
        expect(dcs(crewActionDCGroups(action, own, enemies))).toEqual([[null, 19]]);
    });

    it("uses this ship's DC for an action that uses your ship's DC", () => {
        const action = { preferred: "any", hardAlways: true, dcOf: "own" };
        expect(dcs(crewActionDCGroups(action, own, enemies))).toEqual([[null, 25]]);
    });
});

describe("tacticDCGroups", () => {
    const pcShips = [{ name: "Kestra", average: 20, hard: 25 }];
    const dcs = groups => groups.map(g => [g.label, g.dcs[0]?.dc]);

    it("gives the PC ship's DC of the tactic's category", () => {
        expect(dcs(tacticDCGroups({ dc: "average" }, pcShips))).toEqual([[null, 20]]);
        expect(dcs(tacticDCGroups({ dc: "hard" }, pcShips))).toEqual([[null, 25]]);
    });

    it("gives both DCs when the GM chooses", () => {
        expect(dcs(tacticDCGroups({ dc: "choice" }, pcShips))).toEqual([["average", 20], ["hard", 25]]);
    });

    it("gives nothing for a tactic with no check", () => {
        expect(tacticDCGroups({ dc: null }, pcShips)).toEqual([]);
    });
});

describe("dcPlaceholders", () => {
    const labels = { dc: dc => `DC ${dc}`, dcFor: (dc, name) => `DC ${dc} for ${name}` };
    const kestra = { name: "Kestra", average: 20, hard: 25 };

    it("gives this ship's and the other side's DCs in parentheses", () => {
        const values = dcPlaceholders([kestra], [{ name: "Bow", average: 19, hard: 24 }], labels);
        expect(values).toEqual({ ownAverage: " (DC 20)", ownHard: " (DC 25)", targetAverage: " (DC 19)", targetHard: " (DC 24)" });
    });

    it("names each ship when the other side's DCs differ", () => {
        const targets = [{ name: "Bow", average: 19, hard: 24 }, { name: "Stern", average: 21, hard: 26 }];
        expect(dcPlaceholders([kestra], targets, labels).targetHard).toBe(" (DC 24 for Bow, DC 26 for Stern)");
    });

    it("leaves a placeholder empty when the DC is not known", () => {
        expect(dcPlaceholders([kestra], [], labels).targetHard).toBe("");
    });
});
