import { describe, expect, it } from "vitest";
import { applyCrewAction, crewActionDCShip, resolveNarrativeRound, rollBonuses } from "./apply-crew-action.js";
import { addModifier, addSuccesses, canAct, initialState, modifiersFor, recordAction, resolveRound } from "./state.js";

const SHIPS = [
    { id: "pc1", side: "pc" },
    { id: "e1", side: "enemy" },
    { id: "e2", side: "enemy" }
];
/** The crew list of the PC ship. The ids are named after the book roles, but narrative ships have no roles. */
const CREW = { pc1: ["cap", "cm", "eng", "g1", "g2", "mo", "pil", "sci"] };
const ROUND = 1;

/** Runs an action with passing defaults that each test overrides. */
function act(state, input) {
    return applyCrewAction(state, {
        shipId: "pc1",
        crew: CREW,
        total: 15,
        dc: 15,
        spentResolve: false,
        actorResolve: 1,
        actorSkills: ["acr", "ath", "blu", "com", "cul", "dip", "eng", "int", "lsc", "mys", "per", "phs", "pil", "pro", "sen", "ste"],
        ...input
    }, ROUND);
}

const fresh = () => initialState(SHIPS);
/** Ends the round with no hits, so this round's skills become last round's. */
const nextRound = s => resolveRound(s, {}, {}, 0).state;

describe("applyCrewAction", () => {
    it("Outmaneuver beating the DC by 5 adds 2 successes to the target", () => {
        const r = act(fresh(), { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil", total: 20 });
        expect(r.state.ships.e1.successes).toBe(2);
    });

    it("Maximize Crew Efficiency doubles the target's next success-granting action", () => {
        let r = act(fresh(), { actorId: "cm", actionKey: "maximizeCrewEfficiency", allyId: "pil", skillKey: "dip" });
        r = act(r.state, { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        expect(r.state.ships.e1.successes).toBe(2);
    });

    it("Target Weak Spot beating the Hard DC by 10 deals a hit", () => {
        const r = act(fresh(), { actorId: "g1", actionKey: "targetWeakSpot", targetId: "e1", skillKey: "rangedAttack", total: 25 });
        expect(r.effects).toContainEqual({ kind: "hit", target: "e1", value: 1 });
        const short = act(fresh(), { actorId: "g1", actionKey: "targetWeakSpot", targetId: "e1", skillKey: "rangedAttack", total: 24 });
        expect(short.effects.some(e => e.kind === "hit")).toBe(false);
    });

    it("Target Weak Spot's extra hit counts as a hit for Target System at Resolve", () => {
        const r = act(fresh(), { actorId: "g1", actionKey: "targetWeakSpot", targetId: "e1", skillKey: "rangedAttack", total: 25 });
        expect(r.state.ships.e1.hitsThisRound).toBe(1);
        const state = addModifier(r.state, { target: "e1", kind: "extraHitIfHit", value: 1, expiresAfterRound: ROUND });
        // The 1 success is under threshold 2, so the only hit at Resolve is Target System's.
        expect(resolveNarrativeRound(state, { e1: { threshold: 2, hpValue: 4 } }, ROUND).hits.e1).toBe(1);
    });

    it("Harry Enemy gives the target -2 to skill checks next round", () => {
        const r = act(fresh(), { actorId: "g1", actionKey: "harryEnemy", targetId: "e1", skillKey: "blu" });
        expect(r.state.modifiers).toContainEqual({ target: "e1", kind: "enemySkill", value: -2, expiresAfterRound: ROUND + 1, fromRound: ROUND + 1 });
        expect(modifiersFor(r.state, "e1", "enemySkill", ROUND + 1)).toBe(-2);
    });

    it("Encourage Crew Member can't name the captain who uses it as the ally", () => {
        const encourage = { actorId: "cap", actionKey: "encourageCrewMember", skillKey: "dip" };
        expect(act(fresh(), { ...encourage, allyId: "pil" }).effects).toContainEqual({ kind: "regainResolve", target: "pil", value: 1 });
        expect(act(fresh(), { ...encourage, allyId: "cap" }).effects).toEqual([{ kind: "rejected", reason: "badAlly" }]);
    });

    it("Encourage Crew Member's Resolve rider can't name the captain as the second ally", () => {
        const encourage = { actorId: "cap", actionKey: "encourageCrewMember", skillKey: "dip", spentResolve: true, allyId: "pil" };
        expect(act(fresh(), { ...encourage, secondAllyId: "eng" }).effects).toContainEqual({ kind: "regainResolve", target: "eng", value: 1 });
        expect(act(fresh(), { ...encourage, secondAllyId: "cap" }).effects).toEqual([{ kind: "rejected", reason: "badAlly" }]);
    });

    it("Patch Hull heals the crew member's ship by 1", () => {
        const r = act(fresh(), { actorId: "eng", actionKey: "patchHull", skillKey: "eng" });
        expect(r.effects).toContainEqual({ kind: "heal", target: "pc1", value: 1 });
    });

    it("rejects a crew member who fails canAct and leaves the state alone", () => {
        const s = fresh();
        const r = act(s, { actorId: "stranger", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        expect(r.state).toBe(s);
        expect(r.effects).toEqual([{ kind: "rejected", reason: "notCrew" }]);
    });

    it("Provide Aid gives +2, or +3 when the check beats the DC by 5", () => {
        const low = act(fresh(), { actorId: "cap", actionKey: "provideAid", allyId: "pil", skillKey: "dip", total: 19 });
        expect(modifiersFor(low.state, "pil", "nextCheck", ROUND)).toBe(2);
        const high = act(fresh(), { actorId: "cap", actionKey: "provideAid", allyId: "pil", skillKey: "dip", total: 20 });
        expect(modifiersFor(high.state, "pil", "nextCheck", ROUND)).toBe(3);
    });

    it("Give Orders lets a crew member who already acted act again", () => {
        let r = act(fresh(), { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        const who = { shipId: "pc1", actorId: "pil" };
        expect(canAct(r.state, who, CREW).ok).toBe(false);
        r = act(r.state, { actorId: "cap", actionKey: "giveOrders", allyId: "pil", skillKey: "dip" });
        expect(canAct(r.state, who, CREW).ok).toBe(true);
    });

    it("Empower Crew with Resolve adds a success to the chosen enemy", () => {
        const plain = act(fresh(), { actorId: "mo", actionKey: "empowerCrew", targetId: "e1", skillKey: "mys" });
        expect(plain.state.ships.e1.successes).toBe(0);
        const spent = act(fresh(), { actorId: "mo", actionKey: "empowerCrew", targetId: "e1", skillKey: "mys", spentResolve: true });
        expect(spent.state.ships.e1.successes).toBe(1);
        expect(spent.effects).toContainEqual({ kind: "spendResolve", target: "mo", value: 1 });
    });

    it("rejects the skill the crew member used last round", () => {
        const s = nextRound(recordAction(fresh(), "pil", "pil"));
        const r = act(s, { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        expect(r.state.ships.e1.successes).toBe(0);
        expect(r.effects).toEqual([{ kind: "rejected", reason: "sameSkill" }]);
    });

    it("lets a second action this round reuse this round's skill but not last round's", () => {
        let s = nextRound(recordAction(fresh(), "pil", "acr"));
        s = act(s, { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" }).state;
        s = act(s, { actorId: "cap", actionKey: "giveOrders", allyId: "pil", skillKey: "dip" }).state;
        const pilot = { actorId: "pil", actionKey: "outmaneuver", targetId: "e1" };
        expect(act(s, { ...pilot, skillKey: "acr" }).effects).toEqual([{ kind: "rejected", reason: "sameSkill" }]);
        expect(act(s, { ...pilot, skillKey: "pil" }).success).toBe(true);
    });

    it("checks next round against every skill used this round", () => {
        let s = recordAction(fresh(), "pil", "acr");
        s = nextRound(recordAction(s, "pil", "pil"));
        const pilot = { actorId: "pil", actionKey: "outmaneuver", targetId: "e1" };
        expect(act(s, { ...pilot, skillKey: "acr" }).effects).toEqual([{ kind: "rejected", reason: "sameSkill" }]);
    });

    it("forgets the skills of a crew member who skipped a round", () => {
        const s = nextRound(nextRound(recordAction(fresh(), "pil", "pil")));
        const r = act(s, { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        expect(r.success).toBe(true);
    });

    it("applies the same-skill rule to the free Patch Hull", () => {
        let s = nextRound(recordAction(fresh(), "eng", "eng"));
        s = addModifier(s, { target: "eng", kind: "freePatchHull", value: 1, expiresAfterRound: ROUND });
        const free = { actorId: "eng", actionKey: "patchHull", free: true };
        expect(act(s, { ...free, skillKey: "eng" }).effects).toEqual([{ kind: "rejected", reason: "sameSkill" }]);
    });

    it("refuses Resolve at 0 RP", () => {
        const r = act(fresh(), { actorId: "eng", actionKey: "patchHull", skillKey: "eng", spentResolve: true, actorResolve: 0 });
        expect(r.effects).toEqual([{ kind: "rejected", reason: "noResolve" }]);
    });

    it("spends Resolve only when the check succeeds", () => {
        const failed = act(fresh(), { actorId: "eng", actionKey: "patchHull", skillKey: "eng", spentResolve: true, total: 14 });
        expect(failed.effects).toEqual([]);
        expect(failed.state.actedThisRound.eng).toBe(1);
    });

    it("Channel Eldritch Energy beating the DC by 5 lowers the threshold next round only", () => {
        const r = act(fresh(), { actorId: "mo", actionKey: "channelEldritchEnergy", targetId: "e1", skillKey: "mys", total: 20 });
        expect(r.state.ships.e1.successes).toBe(1);
        expect(modifiersFor(r.state, "e1", "thresholdDelta", ROUND)).toBe(0);
        expect(modifiersFor(r.state, "e1", "thresholdDelta", ROUND + 1)).toBe(-1);
    });

    it("rejects a skill the crew member doesn't have", () => {
        const r = act(fresh(), { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil", actorSkills: ["acr"] });
        expect(r.effects).toEqual([{ kind: "rejected", reason: "badSkill" }]);
    });

    it("allows a ranged attack only for a gunner action, by any crew member", () => {
        const r = act(fresh(), { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "rangedAttack" });
        expect(r.effects).toEqual([{ kind: "rejected", reason: "notGunner" }]);
        const gunnerAction = act(fresh(), { actorId: "pil", actionKey: "fireAtWill", targetId: "e1", skillKey: "rangedAttack", actorSkills: [] });
        expect(gunnerAction.success).toBe(true);
        expect(gunnerAction.state.ships.e1.successes).toBe(1);
    });

    it("lets any crew member take any action", () => {
        const r = act(fresh(), { actorId: "cap", actionKey: "patchHull", skillKey: "eng" });
        expect(r.effects).toContainEqual({ kind: "heal", target: "pc1", value: 1 });
        expect(act(fresh(), { actorId: "eng", actionKey: "tauntEnemy", targetId: "e1", skillKey: "int" }).state.ships.e1.successes).toBe(1);
    });

    it("gives the free Patch Hull to any crew member with the modifier", () => {
        const s = addModifier(fresh(), { target: "pil", kind: "freePatchHull", value: 1, expiresAfterRound: ROUND });
        const r = act(s, { actorId: "pil", actionKey: "patchHull", skillKey: "eng", free: true });
        expect(r.effects).toContainEqual({ kind: "heal", target: "pc1", value: 1 });
        expect(act(fresh(), { actorId: "pil", actionKey: "patchHull", skillKey: "eng", free: true }).effects)
            .toEqual([{ kind: "rejected", reason: "noFreeAction" }]);
    });

    it("accepts any crew member of the ship as an ally, but not someone off the crew list", () => {
        const steady = { actorId: "pil", actionKey: "holdSteady", targetId: "e1", skillKey: "pil" };
        expect(act(fresh(), { ...steady, allyId: "sci" }).success).toBe(true);
        expect(act(fresh(), { ...steady, allyId: "pil" }).effects).toEqual([{ kind: "rejected", reason: "badAlly" }]);
        expect(act(fresh(), { ...steady, allyId: "stranger" }).effects).toEqual([{ kind: "rejected", reason: "badAlly" }]);
    });

    it("Access Maintenance Panels' Resolve rider takes any two different crew members", () => {
        const panels = { actorId: "cap", actionKey: "accessMaintenancePanels", skillKey: "ath", spentResolve: true, allyId: "g1" };
        const r = act(fresh(), { ...panels, secondAllyId: "g2" });
        expect(modifiersFor(r.state, "g1", "rollTwice", ROUND)).toBe(1);
        expect(modifiersFor(r.state, "g2", "rollTwice", ROUND)).toBe(1);
        expect(act(fresh(), { ...panels, secondAllyId: "g1" }).effects).toEqual([{ kind: "rejected", reason: "badAlly" }]);
    });

    it("Improve Countermeasures' Resolve rider gives the free Patch Hull to any crew member", () => {
        const r = act(fresh(), { actorId: "sci", actionKey: "improveCountermeasures", skillKey: "com", spentResolve: true, allyId: "g1" });
        expect(modifiersFor(r.state, "g1", "freePatchHull", ROUND)).toBe(1);
    });
});

describe("Take Cover", () => {
    const covered = () => {
        const s = fresh();
        return { ...s, ships: { ...s.ships, e1: { ...s.ships.e1, flags: ["takeCover"] } } };
    };

    it("rejects an action that targets a ship taking cover", () => {
        const r = act(covered(), { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        expect(r.effects).toEqual([{ kind: "rejected", reason: "takeCover" }]);
        expect(r.state.ships.e1.successes).toBe(0);
    });

    it("still allows actions against another enemy", () => {
        const r = act(covered(), { actorId: "pil", actionKey: "outmaneuver", targetId: "e2", skillKey: "pil" });
        expect(r.successes).toBe(1);
    });

    it("rejects a Resolve rider that gives the covered ship a success", () => {
        const r = act(covered(), {
            actorId: "mo", actionKey: "empowerCrew", skillKey: "mys", spentResolve: true, targetId: "e1"
        });
        expect(r.effects).toEqual([{ kind: "rejected", reason: "takeCover" }]);
    });

    it("rejects Harry Enemy's second target when it is taking cover", () => {
        const r = act(covered(), {
            actorId: "g1", actionKey: "harryEnemy", skillKey: "blu", targetId: "e2", secondTargetId: "e1", spentResolve: true
        });
        expect(r.effects).toEqual([{ kind: "rejected", reason: "takeCover" }]);
    });

    it("the pilot's check clears the cover without a success, and then others can target the ship", () => {
        const cleared = act(covered(), { actorId: "pil", actionKey: "clearTakeCover", targetId: "e1", skillKey: "pil" });
        expect(cleared.success).toBe(true);
        expect(cleared.successes).toBe(0);
        expect(cleared.state.ships.e1.successes).toBe(0);
        expect(cleared.state.ships.e1.flags).not.toContain("takeCover");
        const after = act(cleared.state, { actorId: "g1", actionKey: "fireAtWill", targetId: "e1", skillKey: "acr" });
        expect(after.state.ships.e1.successes).toBe(1);
    });

    it("a failed pilot check leaves the cover in place", () => {
        const r = act(covered(), { actorId: "pil", actionKey: "clearTakeCover", targetId: "e1", skillKey: "pil", total: 10 });
        expect(r.success).toBe(false);
        expect(r.state.ships.e1.flags).toContain("takeCover");
        expect(r.state.actedThisRound.pil).toBe(1);
    });

    it("a pilot who used Piloting last round can still negate Take Cover", () => {
        const used = act(fresh(), { actorId: "pil", actionKey: "outmaneuver", targetId: "e2", skillKey: "pil" });
        const state = { ...nextRound(used.state) };
        state.ships = { ...state.ships, e1: { ...state.ships.e1, flags: ["takeCover"] } };
        expect(state.skillsLastRound.pil).toEqual(["pil"]);
        const r = act(state, { actorId: "pil", actionKey: "clearTakeCover", targetId: "e1", skillKey: "pil" });
        expect(r.success).toBe(true);
        expect(r.state.ships.e1.flags).not.toContain("takeCover");
    });

    it("negating Take Cover uses the action but leaves Piloting open next round", () => {
        const r = act(covered(), { actorId: "pil", actionKey: "clearTakeCover", targetId: "e1", skillKey: "pil" });
        expect(r.state.actedThisRound.pil).toBe(1);
        const after = act(nextRound(r.state), { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        expect(after.effects).not.toContainEqual({ kind: "rejected", reason: "sameSkill" });
        expect(after.successes).toBe(1);
    });

    it("the pilot's check needs Piloting and a ship that is taking cover", () => {
        expect(act(covered(), { actorId: "pil", actionKey: "clearTakeCover", targetId: "e1", skillKey: "acr" }).effects)
            .toEqual([{ kind: "rejected", reason: "pilotingOnly" }]);
        expect(act(fresh(), { actorId: "pil", actionKey: "clearTakeCover", targetId: "e1", skillKey: "pil" }).effects)
            .toEqual([{ kind: "rejected", reason: "notTakingCover" }]);
    });
});

describe("rollBonuses", () => {
    it("adds Provide Aid to the ally's next check, then uses it up", () => {
        let r = act(fresh(), { actorId: "cap", actionKey: "provideAid", allyId: "pil", skillKey: "dip" });
        const who = { shipId: "pc1", actorId: "pil", actionKey: "outmaneuver", targetId: "e1" };
        expect(rollBonuses(r.state, who, ROUND).total).toBe(2);
        r = act(r.state, { actorId: "pil", actionKey: "outmaneuver", targetId: "e1", skillKey: "pil" });
        expect(rollBonuses(r.state, who, ROUND).total).toBe(0);
    });

    it("adds Hold Steady only to the ally's success-granting actions against the same ship", () => {
        const r = act(fresh(), { actorId: "pil", actionKey: "holdSteady", allyId: "g1", targetId: "e1", skillKey: "pil" });
        expect(rollBonuses(r.state, { shipId: "pc1", actorId: "g1", actionKey: "fireAtWill", targetId: "e1" }, ROUND).total).toBe(3);
        expect(rollBonuses(r.state, { shipId: "pc1", actorId: "g1", actionKey: "fireAtWill", targetId: "e2" }, ROUND).total).toBe(0);
        expect(rollBonuses(r.state, { shipId: "pc1", actorId: "g1", actionKey: "harryEnemy", targetId: "e1" }, ROUND).total).toBe(0);
    });
});

describe("crewActionDCShip", () => {
    it("uses the target's DC for target actions and the crew's ship otherwise", () => {
        expect(crewActionDCShip("outmaneuver", { shipId: "pc1", targetId: "e1" })).toBe("e1");
        expect(crewActionDCShip("empowerCrew", { shipId: "pc1", targetId: "e1" })).toBe("pc1");
    });
});

describe("resolveNarrativeRound", () => {
    const ships = { pc1: { threshold: 2, hpValue: 4 }, e1: { threshold: 3, hpValue: 5 }, e2: { threshold: 3, hpValue: 5 } };

    it("adds Target System's extra hit only to a ship that took a hit", () => {
        let s = addSuccesses(fresh(), "e1", 3);
        s = act(s, { actorId: "sci", actionKey: "targetSystem", targetId: "e1", skillKey: "com" }).state;
        s = act(s, { actorId: "g1", actionKey: "targetSystem", targetId: "e2", skillKey: "acr" }).state;
        const r = resolveNarrativeRound(s, ships, ROUND);
        expect(r.hits.e1).toBe(2);
        expect(r.hits.e2 ?? 0).toBe(0);
        expect(r.hp.e1).toBe(3);
    });

    it("applies a threshold change during its round", () => {
        let s = addSuccesses(fresh(), "e1", 2);
        s = { ...s, modifiers: [{ target: "e1", kind: "thresholdDelta", value: -1, expiresAfterRound: ROUND, fromRound: ROUND }] };
        expect(resolveNarrativeRound(s, ships, ROUND).hits.e1).toBe(1);
    });

    it("puts out ships at 0 HP once and reports the winner", () => {
        const two = initialState([SHIPS[0], SHIPS[1]]);
        const r = resolveNarrativeRound(addSuccesses(two, "e1", 6), { pc1: ships.pc1, e1: { threshold: 3, hpValue: 2 } }, ROUND);
        expect(r.out).toEqual(["e1"]);
        expect(r.ended).toBe("pcWin");
        expect(resolveNarrativeRound(r.state, { pc1: ships.pc1, e1: { threshold: 3, hpValue: 0 } }, ROUND + 1).out).toEqual([]);
    });

    describe("Ablative Plating", () => {
        const plated = { ...ships, pc1: { ...ships.pc1, upgrades: { ablativePlating: 1 } } };
        it("removes one hit the first round the PC ship is hit and not the next", () => {
            const first = resolveNarrativeRound(addSuccesses(fresh(), "pc1", 4), plated, ROUND);
            expect(first.hits.pc1).toBe(1);
            expect(first.hp.pc1).toBe(3);
            expect(first.state.usedOnce.pc1).toEqual(["ablativePlating"]);
            const second = resolveNarrativeRound(addSuccesses(first.state, "pc1", 4), plated, ROUND + 1);
            expect(second.hits.pc1).toBe(2);
        });
        it("does nothing for a ship without the upgrade or for an enemy", () => {
            expect(resolveNarrativeRound(addSuccesses(fresh(), "pc1", 4), ships, ROUND).hits.pc1).toBe(2);
            const enemyPlated = { ...ships, e1: { ...ships.e1, upgrades: { ablativePlating: 1 } } };
            expect(resolveNarrativeRound(addSuccesses(fresh(), "e1", 3), enemyPlated, ROUND).hits.e1).toBe(1);
        });
        it("counts a ship the plating saves as still standing", () => {
            const weak = { ...plated, pc1: { ...plated.pc1, hpValue: 1 } };
            const r = resolveNarrativeRound(addSuccesses(fresh(), "pc1", 2), weak, ROUND);
            expect(r.hp.pc1).toBe(1);
            expect(r.out).toEqual([]);
        });
    });
});
