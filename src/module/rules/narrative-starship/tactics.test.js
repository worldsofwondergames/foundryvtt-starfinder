import { describe, expect, it } from "vitest";
import { dcFor, NARRATIVE_CREW_ACTIONS } from "./crew-actions.js";
import { resolveNarrativeRound, rollBonuses } from "./apply-crew-action.js";
import { addModifier, initialState, modifiersFor, resolveRound } from "./state.js";
import {
    NARRATIVE_TACTICS, applyTactic, availableTactics, chooseTactic, enemyCheckBonus, forceHardFor, tacticDC, tacticRollCount
} from "./tactics.js";

const SHIPS = [
    { id: "pc1", side: "pc" },
    { id: "pc2", side: "pc" },
    { id: "e1", side: "enemy" },
    { id: "e2", side: "enemy" }
];
const DCS = { average: 20, hard: 25 };
const ROUND = 2;
const fresh = () => initialState(SHIPS);

function tactic(state, input, round = ROUND) {
    return applyTactic(state, { enemyId: "e1", targetId: "pc1", rolls: [], dcs: DCS, ...input }, round);
}

const statusOf = (state, enemyId, key, round = ROUND) => availableTactics(state, enemyId, round).find(t => t.key === key);

describe("NARRATIVE_TACTICS", () => {
    it("has the 12 book tactics", () => {
        expect(Object.keys(NARRATIVE_TACTICS).sort()).toEqual([
            "allOutAttack",
            "cruelTaunt",
            "evasiveManeuvers",
            "flee",
            "flybyStunt",
            "makeRepairs",
            "openFire",
            "raiseShields",
            "ram",
            "signalJam",
            "takeCover",
            "useSpecialAbility"
        ]);
    });
});

describe("availableTactics", () => {
    it("disables a tactic another enemy chose this round with reason taken", () => {
        const state = chooseTactic(fresh(), "e2", "openFire", "pc1", ROUND);
        expect(statusOf(state, "e1", "openFire")).toEqual({ key: "openFire", disabled: true, reason: "taken" });
        expect(statusOf(state, "e1", "ram").disabled).toBe(false);
    });

    it("does not count the enemy's own choice as taken", () => {
        const state = chooseTactic(fresh(), "e1", "openFire", "pc1", ROUND);
        expect(statusOf(state, "e1", "openFire").disabled).toBe(false);
    });

    it("locks All-Out Attack through the round after a success and opens it the round after that", () => {
        const { state } = tactic(fresh(), { tactic: "allOutAttack", rolls: [30, 30] }, 2);
        expect(statusOf(state, "e2", "allOutAttack", 2)).toEqual({ key: "allOutAttack", disabled: true, reason: "locked" });
        expect(statusOf(state, "e2", "allOutAttack", 3)).toEqual({ key: "allOutAttack", disabled: true, reason: "locked" });
        expect(statusOf(state, "e2", "allOutAttack", 4).disabled).toBe(false);
    });

    it("leaves only Open Fire enabled for a ship forced by Draw Fire", () => {
        const state = fresh();
        state.ships.e1.forcedTactic = { tactic: "openFire", targetShip: "pc1", round: ROUND };
        const enabled = availableTactics(state, "e1", ROUND).filter(t => !t.disabled)
            .map(t => t.key);
        expect(enabled).toEqual(["openFire"]);
        expect(statusOf(state, "e1", "ram").reason).toBe("forced");
        // The forced choice is for its own round only.
        expect(availableTactics(state, "e1", ROUND + 1).every(t => !t.disabled)).toBe(true);
    });

    it("never marks a ship's own forced tactic taken, even after another enemy chose it first", () => {
        let state = fresh();
        state.ships.e1.forcedTactic = { tactic: "openFire", targetShip: "pc1", round: ROUND };
        state.ships.e2.tactic = "openFire";
        expect(statusOf(state, "e1", "openFire")).toEqual({ key: "openFire", disabled: false });
        state = chooseTactic(state, "e1", "openFire", "pc1", ROUND);
        expect(state.ships.e1.tactic).toBe("openFire");
        expect(tactic(state, { tactic: "openFire", rolls: [20] }).effects).toEqual([{ kind: "hit", target: "pc1", value: 1 }]);
    });

    it("marks a tactic another enemy is forced to as taken before that enemy chooses", () => {
        const state = fresh();
        state.ships.e1.forcedTactic = { tactic: "openFire", targetShip: "pc1", round: ROUND };
        expect(statusOf(state, "e2", "openFire")).toEqual({ key: "openFire", disabled: true, reason: "taken" });
        expect(() => chooseTactic(state, "e2", "openFire", "pc1", ROUND)).toThrow("taken");
        expect(statusOf(state, "e2", "openFire", ROUND + 1).disabled).toBe(false);
    });
});

describe("chooseTactic", () => {
    it("stores the tactic and target on the enemy ship", () => {
        const state = chooseTactic(fresh(), "e1", "ram", "pc1", ROUND);
        expect(state.ships.e1.tactic).toBe("ram");
        expect(state.ships.e1.tacticTarget).toBe("pc1");
    });

    it("refuses a tactic another enemy took this round", () => {
        const state = chooseTactic(fresh(), "e2", "ram", "pc1", ROUND);
        expect(() => chooseTactic(state, "e1", "ram", "pc1", ROUND)).toThrow("taken");
    });

    it("refuses a target other than the one Draw Fire forced", () => {
        const state = fresh();
        state.ships.e1.forcedTactic = { tactic: "openFire", targetShip: "pc1", round: ROUND };
        expect(() => chooseTactic(state, "e1", "openFire", "pc2", ROUND)).toThrow("forcedTarget");
    });

    it("is cleared by resolveRound at the end of the round", () => {
        const state = chooseTactic(fresh(), "e1", "ram", "pc1", ROUND);
        const after = resolveRound(state, {}, {}, ROUND).state;
        expect(after.ships.e1.tactic).toBeNull();
        expect(after.ships.e1.tacticTarget).toBeNull();
    });
});

describe("tacticDC", () => {
    const dc = (state, input) => tacticDC(state, { enemyId: "e1", targetId: "pc1", ...input }, DCS, ROUND);

    it("uses the Average DC for Open Fire", () => {
        expect(dc(fresh(), { tactic: "openFire" })).toBe(20);
    });

    it("uses the Hard DC for All-Out Attack", () => {
        expect(dc(fresh(), { tactic: "allOutAttack" })).toBe(25);
    });

    it("uses the Hard DC for Cruel Taunt only when the GM chose it", () => {
        expect(dc(fresh(), { tactic: "cruelTaunt", choice: "hard" })).toBe(25);
        expect(dc(fresh(), { tactic: "cruelTaunt", choice: "average" })).toBe(20);
    });

    it("uses the Hard DC when the enemy has enemyHardDC this round", () => {
        const state = addModifier(fresh(), { target: "e1", kind: "enemyHardDC", value: 1, expiresAfterRound: ROUND });
        expect(dc(state, { tactic: "openFire" })).toBe(25);
    });

    it("uses the Hard DC when the PC ship has ownDCHard this round", () => {
        const state = addModifier(fresh(), { target: "pc1", kind: "ownDCHard", value: 1, expiresAfterRound: ROUND });
        expect(dc(state, { tactic: "ram" })).toBe(25);
    });
});

describe("enemyCheckBonus and tacticRollCount", () => {
    it("sums the enemySkill modifiers on the enemy", () => {
        let state = addModifier(fresh(), { target: "e1", kind: "enemySkill", value: -2, expiresAfterRound: ROUND });
        state = addModifier(state, { target: "e1", kind: "enemySkill", value: -1, expiresAfterRound: ROUND });
        state = addModifier(state, { target: "e2", kind: "enemySkill", value: -5, expiresAfterRound: ROUND });
        expect(enemyCheckBonus(state, "e1", ROUND)).toBe(-3);
    });

    it("asks for two rolls for All-Out Attack and none for tactics without a check", () => {
        expect(tacticRollCount(fresh(), { enemyId: "e1", tactic: "allOutAttack" }, ROUND)).toBe(2);
        expect(tacticRollCount(fresh(), { enemyId: "e1", tactic: "openFire" }, ROUND)).toBe(1);
        expect(tacticRollCount(fresh(), { enemyId: "e1", tactic: "raiseShields" }, ROUND)).toBe(0);
    });

    it("asks for two rolls for Open Fire after the Draw Fire rider, and keeps the worse", () => {
        const state = addModifier(fresh(), { target: "e1", kind: "enemyRollTwiceWorse", value: 1, expiresAfterRound: ROUND });
        expect(tacticRollCount(state, { enemyId: "e1", tactic: "openFire" }, ROUND)).toBe(2);
        expect(tactic(state, { tactic: "openFire", rolls: [30, 10] }).effects).toEqual([]);
    });
});

describe("applyTactic", () => {
    it("Open Fire hits the PC ship on a success and records the hit", () => {
        const { state, effects } = tactic(fresh(), { tactic: "openFire", rolls: [20] });
        expect(effects).toEqual([{ kind: "hit", target: "pc1", value: 1 }]);
        expect(state.ships.pc1.hitsThisRound).toBe(1);
    });

    it("Open Fire does nothing on a failure", () => {
        const { state, effects } = tactic(fresh(), { tactic: "openFire", rolls: [19] });
        expect(effects).toEqual([]);
        expect(state.ships.pc1.hitsThisRound).toBe(0);
    });

    it("All-Out Attack with one failed roll of two gives no hits and no lock", () => {
        const { state, effects } = tactic(fresh(), { tactic: "allOutAttack", rolls: [30, 24] });
        expect(effects).toEqual([]);
        expect(state.allOutAttackLockedUntilRound).toBe(0);
    });

    it("All-Out Attack with both rolls at the Hard DC gives 2 hits", () => {
        const { state, effects } = tactic(fresh(), { tactic: "allOutAttack", rolls: [25, 25] });
        expect(effects).toEqual([{ kind: "hit", target: "pc1", value: 2 }]);
        expect(state.ships.pc1.hitsThisRound).toBe(2);
    });

    it("Ram on a success hits both ships and gives the PC ship's crew -1 this round", () => {
        const { state, effects } = tactic(fresh(), { tactic: "ram", rolls: [20] });
        expect(effects).toEqual([{ kind: "hit", target: "pc1", value: 1 }, { kind: "hit", target: "e1", value: 1 }]);
        expect(state.ships.e1.hitsThisRound).toBe(1);
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND)).toBe(-1);
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND + 1)).toBe(0);
        const bonus = rollBonuses(state, { shipId: "pc1", actorId: "a", actionKey: "outmaneuver", targetId: "e1" }, ROUND);
        expect(bonus.total).toBe(-1);
    });

    it("Ram on a failure does nothing", () => {
        const { state, effects } = tactic(fresh(), { tactic: "ram", rolls: [19] });
        expect(effects).toEqual([]);
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND)).toBe(0);
    });

    it("Cruel Taunt against the Average DC gives -1", () => {
        const { state } = tactic(fresh(), { tactic: "cruelTaunt", choice: "average", rolls: [20] });
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND)).toBe(-1);
    });

    it("Cruel Taunt against the Average DC that also meets the Hard DC gives -1", () => {
        const { state } = tactic(fresh(), { tactic: "cruelTaunt", choice: "average", rolls: [25] });
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND)).toBe(-1);
    });

    it("Cruel Taunt forced to the Hard DC by ownDCHard gives -2", () => {
        const state = addModifier(fresh(), { target: "pc1", kind: "ownDCHard", value: 1, expiresAfterRound: ROUND });
        const result = tactic(state, { tactic: "cruelTaunt", choice: "average", rolls: [25] });
        expect(modifiersFor(result.state, "pc1", "crewSkill", ROUND)).toBe(-2);
    });

    it("Cruel Taunt without a DC choice is rejected", () => {
        const before = fresh();
        const { state, effects } = tactic(before, { tactic: "cruelTaunt", rolls: [30] });
        expect(effects).toEqual([{ kind: "rejected", reason: "noChoice" }]);
        expect(state).toBe(before);
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND)).toBe(0);
    });

    it("Cruel Taunt against the Hard DC gives -2", () => {
        const { state } = tactic(fresh(), { tactic: "cruelTaunt", choice: "hard", rolls: [25] });
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND)).toBe(-2);
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND + 1)).toBe(0);
    });

    it("Cruel Taunt that fails the Hard DC gives nothing", () => {
        const { state } = tactic(fresh(), { tactic: "cruelTaunt", choice: "hard", rolls: [24] });
        expect(modifiersFor(state, "pc1", "crewSkill", ROUND)).toBe(0);
    });

    it("Make Repairs restores 1 HP and lowers the threshold by 1 with a floor of 1", () => {
        const { state, effects } = tactic(fresh(), { tactic: "makeRepairs" });
        expect(effects).toEqual([{ kind: "heal", target: "e1", value: 1 }]);
        expect(modifiersFor(state, "e1", "thresholdDelta", ROUND)).toBe(-1);
        state.ships.e1.successes = 2;
        state.ships.e2.successes = 2;
        const result = resolveNarrativeRound(state, { e1: { threshold: 1, hpValue: 5 }, e2: { threshold: 2, hpValue: 5 } }, ROUND);
        // Threshold 1 stays 1, so 2 successes are 2 hits, not a division by zero or more hits.
        expect(result.hits.e1).toBe(2);
        state.ships.e1.successes = 2;
        const higher = resolveNarrativeRound(state, { e1: { threshold: 3, hpValue: 5 } }, ROUND);
        expect(higher.hits.e1).toBe(1);
    });

    it("Raise Shields raises the threshold by 1 this round", () => {
        const { state } = tactic(fresh(), { tactic: "raiseShields" });
        expect(modifiersFor(state, "e1", "thresholdDelta", ROUND)).toBe(1);
        expect(modifiersFor(state, "e1", "thresholdDelta", ROUND + 1)).toBe(0);
        state.ships.e1.successes = 2;
        expect(resolveNarrativeRound(state, { e1: { threshold: 2, hpValue: 5 } }, ROUND).hits.e1).toBe(0);
    });

    it("Evasive Maneuvers puts the Hard DC on Piloting checks and ranged attacks against that ship for the round", () => {
        const { state } = tactic(fresh(), { tactic: "evasiveManeuvers", targetId: undefined });
        const hard = (skillKey, targetId = "e1", round = ROUND) => forceHardFor(state, { shipId: "pc1", targetId, skillKey }, round);
        expect(hard("pil")).toBe(true);
        expect(hard("rangedAttack")).toBe(true);
        expect(hard("acr")).toBe(false);
        expect(hard("pil", "e2")).toBe(false);
        expect(hard("pil", "e1", ROUND + 1)).toBe(false);
        expect(dcFor(NARRATIVE_CREW_ACTIONS.outmaneuver, "pil", DCS, hard("pil"))).toBe(25);
    });

    it("Flyby Stunt puts the Hard DC on Acrobatics and Athletics checks by the PC ship's crew", () => {
        const { state } = tactic(fresh(), { tactic: "flybyStunt" });
        const hard = (skillKey, shipId = "pc1") => forceHardFor(state, { shipId, targetId: "e1", skillKey }, ROUND);
        expect(hard("acr")).toBe(true);
        expect(hard("ath")).toBe(true);
        expect(hard("com")).toBe(false);
        expect(hard("acr", "pc2")).toBe(false);
    });

    it("Signal Jam puts the Hard DC on Computers and Mysticism checks by the PC ship's crew", () => {
        const { state } = tactic(fresh(), { tactic: "signalJam" });
        const hard = skillKey => forceHardFor(state, { shipId: "pc1", targetId: "e1", skillKey }, ROUND);
        expect(hard("com")).toBe(true);
        expect(hard("mys")).toBe(true);
        expect(hard("acr")).toBe(false);
        expect(forceHardFor(state, { shipId: "pc1", targetId: "e1", skillKey: "com" }, ROUND + 1)).toBe(false);
    });

    it("Take Cover and Flee flag the enemy ship", () => {
        expect(tactic(fresh(), { tactic: "takeCover" }).state.ships.e1.flags).toEqual(["takeCover"]);
        expect(tactic(fresh(), { tactic: "flee" }).state.ships.e1.flags).toEqual(["fleeing"]);
    });

    it("Use a Special Ability returns a manual effect", () => {
        expect(tactic(fresh(), { tactic: "useSpecialAbility" }).effects).toEqual([{ kind: "manual" }]);
    });

    it("leaves the input state untouched", () => {
        const before = fresh();
        const copy = JSON.parse(JSON.stringify(before));
        tactic(before, { tactic: "ram", rolls: [30] });
        tactic(before, { tactic: "takeCover" });
        expect(before).toEqual(copy);
    });
});

describe("Target System reads tactic hits", () => {
    it("adds its extra hit when the ship's only hit this round came from Ram", () => {
        let { state } = tactic(fresh(), { tactic: "ram", rolls: [30] });
        state = addModifier(state, { target: "e1", kind: "extraHitIfHit", value: 1, expiresAfterRound: ROUND });
        const result = resolveNarrativeRound(state, { e1: { threshold: 2, hpValue: 4 } }, ROUND);
        expect(result.hits.e1).toBe(1);
    });
});
