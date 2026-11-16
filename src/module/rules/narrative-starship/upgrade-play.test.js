import { describe, expect, it } from "vitest";
import {
    activateMantle, applyActionUpgrades, canUseTrackingWeapons, clampUpgradeCount, mantleBlocks,
    navScramExpiry, onceButtons, pendingMines, quantumDefenderShip, resolveMines, upgradeRows, useOnce
} from "./upgrades.js";
import { applyVirtualIntelligenceAid } from "./apply-crew-action.js";
import { addModifier, initialState, knockOutAtZero, modifiersFor, recordAction } from "./state.js";
import { applyTactic, chooseTactic, enemyCheckBonus, mantleCheckNeeded } from "./tactics.js";

const SHIPS = [{ id: "pc1", side: "pc" }, { id: "pc2", side: "pc" }, { id: "e1", side: "enemy" }];
const ROUND = 2;
const fresh = () => initialState(SHIPS);
const ALL_ONCE = { displacementMantle: 1, mineLayer: 1, navScramModule: 1, quantumDefender: 1, trackingWeapons: 1 };

describe("clampUpgradeCount", () => {
    it("keeps a count-1 upgrade at 0 or 1", () => {
        expect(clampUpgradeCount("tractorBeam", 1)).toBe(1);
        expect(clampUpgradeCount("tractorBeam", 3)).toBe(1);
        expect(clampUpgradeCount("tractorBeam", 0)).toBe(0);
    });
    it("caps Drift Engine Upgrade at 4 and leaves Expansion Bay open", () => {
        expect(clampUpgradeCount("driftEngineUpgrade", 3)).toBe(3);
        expect(clampUpgradeCount("driftEngineUpgrade", 9)).toBe(4);
        expect(clampUpgradeCount("expansionBay", 12)).toBe(12);
    });
    it("turns negatives, fractions and junk into whole counts of 0 or more", () => {
        expect(clampUpgradeCount("expansionBay", -2)).toBe(0);
        expect(clampUpgradeCount("expansionBay", 2.7)).toBe(2);
        expect(clampUpgradeCount("expansionBay", "3")).toBe(3);
        expect(clampUpgradeCount("expansionBay", "abc")).toBe(0);
    });
    it("gives 0 for an unknown upgrade", () => {
        expect(clampUpgradeCount("bogus", 1)).toBe(0);
    });
});

describe("upgradeRows", () => {
    it("lists installed upgrades as rows and the rest as choices to add", () => {
        const { installed, available } = upgradeRows({ driftEngineUpgrade: 2, tractorBeam: 1, mineLayer: 0 });
        expect(installed.map(r => r.key)).toEqual(["driftEngineUpgrade", "tractorBeam"]);
        expect(installed[0]).toMatchObject({ numeric: true, count: 2, max: 4 });
        expect(installed[1]).toMatchObject({ numeric: false, count: 1 });
        expect(available.map(r => r.key)).toContain("mineLayer");
        expect(available.map(r => r.key)).not.toContain("tractorBeam");
        expect(installed.length + available.length).toBe(10);
    });

    it("offers every upgrade when none is installed", () => {
        const { installed, available } = upgradeRows(undefined);
        expect(installed).toEqual([]);
        expect(available.find(r => r.key === "expansionBay")).toMatchObject({ numeric: true, max: null });
    });
});

describe("onceButtons", () => {
    it("lists only installed once-per-combat upgrades and marks used ones", () => {
        const buttons = onceButtons({ ...ALL_ONCE, tractorBeam: 1, mineLayer: 0 }, ["navScramModule"]);
        expect(buttons.map(b => b.key)).toEqual(["displacementMantle", "navScramModule", "quantumDefender", "trackingWeapons"]);
        expect(buttons.find(b => b.key === "navScramModule").used).toBe(true);
        expect(buttons.find(b => b.key === "quantumDefender").used).toBe(false);
    });
    it("makes only an unused Displacement Mantle clickable", () => {
        expect(onceButtons(ALL_ONCE, []).filter(b => b.clickable)
            .map(b => b.key)).toEqual(["displacementMantle"]);
        expect(onceButtons(ALL_ONCE, ["displacementMantle"]).some(b => b.clickable)).toBe(false);
    });
});

describe("Displacement Mantle", () => {
    it("mantleBlocks is true for 1 to 20 and false above", () => {
        expect(mantleBlocks(1)).toBe(true);
        expect(mantleBlocks(20)).toBe(true);
        expect(mantleBlocks(21)).toBe(false);
        expect(mantleBlocks(100)).toBe(false);
    });
    it("activateMantle uses the upgrade once and marks the ship for this round only", () => {
        const first = activateMantle(fresh(), "pc1", { displacementMantle: 1 }, ROUND);
        expect(first.ok).toBe(true);
        expect(first.state.usedOnce.pc1).toEqual(["displacementMantle"]);
        expect(modifiersFor(first.state, "pc1", "displacementMantle", ROUND)).toBe(1);
        expect(modifiersFor(first.state, "pc1", "displacementMantle", ROUND + 1)).toBe(0);
        expect(activateMantle(first.state, "pc1", { displacementMantle: 1 }, ROUND)).toMatchObject({ ok: false, reason: "upgradeUsed" });
    });
    it("activateMantle refuses a ship without it and an enemy ship", () => {
        expect(activateMantle(fresh(), "pc1", {}, ROUND)).toMatchObject({ ok: false, reason: "noUpgrade" });
        expect(activateMantle(fresh(), "e1", { displacementMantle: 1 }, ROUND)).toMatchObject({ ok: false, reason: "wrongSide" });
    });
    const mantled = () => activateMantle(fresh(), "pc1", { displacementMantle: 1 }, ROUND).state;
    const openFire = (state, mantleRoll, roll = 30) => applyTactic(chooseTactic(state, "e1", "openFire", "pc1", ROUND),
        { enemyId: "e1", tactic: "openFire", targetId: "pc1", dcs: { average: 15, hard: 20 }, rolls: [roll], mantleRoll }, ROUND);
    it("mantleCheckNeeded only for a tactic that targets the mantled ship", () => {
        expect(mantleCheckNeeded(mantled(), { tactic: "openFire", targetId: "pc1" }, ROUND)).toBe(true);
        expect(mantleCheckNeeded(mantled(), { tactic: "openFire", targetId: "pc2" }, ROUND)).toBe(false);
        expect(mantleCheckNeeded(mantled(), { tactic: "raiseShields", targetId: null }, ROUND)).toBe(false);
        expect(mantleCheckNeeded(fresh(), { tactic: "openFire", targetId: "pc1" }, ROUND)).toBe(false);
    });
    it("a d100 of 20 or less makes a successful Open Fire do nothing", () => {
        const blocked = openFire(mantled(), 20);
        expect(blocked.effects).toEqual([{ kind: "mantleBlocked" }]);
        expect(blocked.state.ships.pc1.hitsThisRound).toBe(0);
    });
    it("a d100 above 20 lets the tactic work", () => {
        expect(openFire(mantled(), 21).effects).toEqual([{ kind: "hit", target: "pc1", value: 1 }]);
    });
    it("blocks a tactic with no check too", () => {
        const state = chooseTactic(mantled(), "e1", "signalJam", "pc1", ROUND);
        const r = applyTactic(state, { enemyId: "e1", tactic: "signalJam", targetId: "pc1", dcs: {}, rolls: [], mantleRoll: 5 }, ROUND);
        expect(r.effects).toEqual([{ kind: "mantleBlocked" }]);
        expect(r.state.modifiers.some(m => m.kind === "crewDCHard")).toBe(false);
    });
    it("refuses a tactic against the mantled ship without the d100", () => {
        expect(openFire(mantled(), undefined).effects).toEqual([{ kind: "rejected", reason: "noMantleRoll" }]);
    });
});

describe("Nav-Scram Module expiry", () => {
    it("counts this round as the first of the 1d4", () => {
        expect(navScramExpiry(3, 1)).toBe(3);
        expect(navScramExpiry(3, 4)).toBe(6);
    });
});

describe("applyActionUpgrades", () => {
    const base = { shipId: "pc1", targetId: "e1", upgrades: ALL_ONCE, averageDC: 14, role: "gunner", actionKey: "fireAtWill" };
    it("does nothing when no upgrade is asked for", () => {
        const state = fresh();
        expect(applyActionUpgrades(state, base, ROUND)).toEqual({ state, ok: true });
    });
    it("Mine Layer: lays mines on the target for next round at this ship's Average DC", () => {
        const r = applyActionUpgrades(fresh(), { ...base, mineLayer: true }, ROUND);
        expect(r.ok).toBe(true);
        expect(r.state.usedOnce.pc1).toEqual(["mineLayer"]);
        expect(pendingMines(r.state, "e1", ROUND)).toBeNull();
        expect(pendingMines(r.state, "e1", ROUND + 1)).toEqual({ dc: 14 });
    });
    it("Nav-Scram Module: -2 on the target's checks for the rolled rounds", () => {
        const r = applyActionUpgrades(fresh(), { ...base, navScram: true, navScramRoll: 2 }, ROUND);
        expect(r.state.usedOnce.pc1).toEqual(["navScramModule"]);
        expect(enemyCheckBonus(r.state, "e1", ROUND)).toBe(-2);
        expect(enemyCheckBonus(r.state, "e1", ROUND + 1)).toBe(-2);
        expect(enemyCheckBonus(r.state, "e1", ROUND + 2)).toBe(0);
    });
    it("Nav-Scram Module needs a d4 result", () => {
        expect(applyActionUpgrades(fresh(), { ...base, navScram: true }, ROUND)).toMatchObject({ ok: false, reason: "badRoll" });
        expect(applyActionUpgrades(fresh(), { ...base, navScram: true, navScramRoll: 5 }, ROUND)).toMatchObject({ ok: false, reason: "badRoll" });
    });
    it("Tracking Weapons: records the use for a gunner's targeted action", () => {
        const r = applyActionUpgrades(fresh(), { ...base, trackingWeapons: true }, ROUND);
        expect(r.state.usedOnce.pc1).toEqual(["trackingWeapons"]);
        expect(applyActionUpgrades(fresh(), { ...base, role: "pilot", trackingWeapons: true }, ROUND)).toMatchObject({ ok: false, reason: "noTrackingWeapons" });
    });
    it("refuses a second use, a missing upgrade, and a target that is not an enemy", () => {
        const used = useOnce(fresh(), "pc1", "mineLayer").state;
        expect(applyActionUpgrades(used, { ...base, mineLayer: true }, ROUND)).toMatchObject({ ok: false, reason: "upgradeUsed" });
        expect(applyActionUpgrades(fresh(), { ...base, upgrades: {}, mineLayer: true }, ROUND)).toMatchObject({ ok: false, reason: "noUpgrade" });
        expect(applyActionUpgrades(fresh(), { ...base, targetId: "pc2", mineLayer: true }, ROUND)).toMatchObject({ ok: false, reason: "badTarget" });
    });
    it("refuses Mine Layer and Nav-Scram with an action that does not target an enemy", () => {
        for (const extra of [{ mineLayer: true }, { navScram: true, navScramRoll: 1 }]) {
            expect(applyActionUpgrades(fresh(), { ...base, actionKey: "provideAid", ...extra }, ROUND))
                .toMatchObject({ ok: false, reason: "noEnemyAction" });
        }
    });
    it("refuses Mine Layer and Nav-Scram with Negate Take Cover", () => {
        const covered = { ...fresh(), ships: { ...fresh().ships, e1: { ...fresh().ships.e1, flags: ["takeCover"] } } };
        for (const extra of [{ mineLayer: true }, { navScram: true, navScramRoll: 1 }]) {
            expect(applyActionUpgrades(covered, { ...base, role: "pilot", actionKey: "clearTakeCover", ...extra }, ROUND))
                .toMatchObject({ ok: false, reason: "noEnemyAction" });
        }
    });
    it("refuses Mine Layer and Nav-Scram against a ship taking cover", () => {
        const covered = { ...fresh(), ships: { ...fresh().ships, e1: { ...fresh().ships.e1, flags: ["takeCover"] } } };
        for (const extra of [{ mineLayer: true }, { navScram: true, navScramRoll: 1 }]) {
            expect(applyActionUpgrades(covered, { ...base, ...extra }, ROUND)).toMatchObject({ ok: false, reason: "takeCover" });
        }
    });
    it("refuses Mine Layer when the ship has no Average DC", () => {
        expect(applyActionUpgrades(fresh(), { ...base, averageDC: undefined, mineLayer: true }, ROUND))
            .toMatchObject({ ok: false, reason: "noAverageDC" });
        expect(applyActionUpgrades(fresh(), { ...base, averageDC: undefined, navScram: true, navScramRoll: 1 }, ROUND).ok).toBe(true);
    });
    it("leaves the state unchanged when one of two upgrades is refused", () => {
        const state = useOnce(fresh(), "pc1", "navScramModule").state;
        const r = applyActionUpgrades(state, { ...base, mineLayer: true, navScram: true, navScramRoll: 1 }, ROUND);
        expect(r).toMatchObject({ ok: false, reason: "upgradeUsed" });
        expect(r.state).toBe(state);
    });
});

describe("Mine Layer check", () => {
    const mined = () => applyActionUpgrades(fresh(), { shipId: "pc1", targetId: "e1", upgrades: ALL_ONCE, averageDC: 14, actionKey: "fireAtWill", mineLayer: true }, ROUND).state;
    it("a roll below the DC gives the enemy 1 hit and clears the mines", () => {
        const r = resolveMines(mined(), "e1", 13, ROUND + 1);
        expect(r.success).toBe(false);
        expect(r.dc).toBe(14);
        expect(r.effects).toEqual([{ kind: "hit", target: "e1", value: 1 }]);
        expect(r.state.ships.e1.hitsThisRound).toBe(1);
        expect(pendingMines(r.state, "e1", ROUND + 1)).toBeNull();
    });
    it("a roll that meets the DC clears the mines with no hit", () => {
        const r = resolveMines(mined(), "e1", 14, ROUND + 1);
        expect(r.success).toBe(true);
        expect(r.effects).toEqual([]);
        expect(pendingMines(r.state, "e1", ROUND + 1)).toBeNull();
    });
    it("refuses when no mines wait for the ship", () => {
        expect(resolveMines(fresh(), "e1", 1, ROUND).effects).toEqual([{ kind: "rejected", reason: "noMines" }]);
    });
});

describe("canUseTrackingWeapons", () => {
    const input = { shipId: "pc1", role: "gunner", actionKey: "fireAtWill", targetId: "e1", success: false };
    const upgrades = { trackingWeapons: 1 };
    it("allows a gunner's failed check that targets an enemy", () => {
        expect(canUseTrackingWeapons(fresh(), input, upgrades)).toBe(true);
    });
    it("refuses a success, another role, an action with no target, a missing or used upgrade", () => {
        expect(canUseTrackingWeapons(fresh(), { ...input, success: true }, upgrades)).toBe(false);
        expect(canUseTrackingWeapons(fresh(), { ...input, role: "pilot" }, upgrades)).toBe(false);
        expect(canUseTrackingWeapons(fresh(), { ...input, actionKey: "provideAid", targetId: undefined }, upgrades)).toBe(false);
        expect(canUseTrackingWeapons(fresh(), input, {})).toBe(false);
        expect(canUseTrackingWeapons(useOnce(fresh(), "pc1", "trackingWeapons").state, input, upgrades)).toBe(false);
    });
});

describe("quantumDefenderShip", () => {
    const hit = [{ kind: "hit", target: "pc1", value: 1 }];
    it("finds the PC ship hit that has an unused Quantum Defender", () => {
        expect(quantumDefenderShip(fresh(), hit, { pc1: { quantumDefender: 1 } })).toBe("pc1");
    });
    it("ignores enemy hits, ships without it, and a used one", () => {
        expect(quantumDefenderShip(fresh(), [{ kind: "hit", target: "e1", value: 1 }], { e1: { quantumDefender: 1 } })).toBeNull();
        expect(quantumDefenderShip(fresh(), hit, { pc1: {} })).toBeNull();
        expect(quantumDefenderShip(useOnce(fresh(), "pc1", "quantumDefender").state, hit, { pc1: { quantumDefender: 1 } })).toBeNull();
        expect(quantumDefenderShip(fresh(), [], { pc1: { quantumDefender: 1 } })).toBeNull();
    });
    it("skips a ship whose unused Ablative Plating takes the only hit", () => {
        const both = { pc1: { quantumDefender: 1, ablativePlating: 1 } };
        expect(quantumDefenderShip(fresh(), hit, both)).toBeNull();
        expect(quantumDefenderShip(fresh(), [{ kind: "hit", target: "pc1", value: 2 }], both)).toBe("pc1");
        expect(quantumDefenderShip(useOnce(fresh(), "pc1", "mineLayer").state, hit, both)).toBeNull();
        const plated = { ...fresh(), usedOnce: { ...fresh().usedOnce, pc1: ["ablativePlating"] } };
        expect(quantumDefenderShip(plated, hit, both)).toBe("pc1");
    });
});

describe("applyVirtualIntelligenceAid", () => {
    const crew = { pc1: { captain: ["cap"], gunner: ["g1"], pilot: ["pil"] } };
    const aid = (state, input) => applyVirtualIntelligenceAid(state, { shipId: "pc1", allyId: "g1", dc: 15, crew, ...input }, ROUND);
    it("gives the ally +2 on a success and +3 when it beats the DC by 5", () => {
        const two = aid(fresh(), { total: 15 });
        expect(two).toMatchObject({ ok: true, success: true });
        expect(modifiersFor(two.state, "g1", "nextCheck", ROUND)).toBe(2);
        expect(modifiersFor(aid(fresh(), { total: 20 }).state, "g1", "nextCheck", ROUND)).toBe(3);
    });
    it("gives nothing on a failure but still counts as this round's aid", () => {
        const r = aid(fresh(), { total: 14 });
        expect(r).toMatchObject({ ok: true, success: false });
        expect(modifiersFor(r.state, "g1", "nextCheck", ROUND)).toBe(0);
        expect(aid(r.state, { total: 20 })).toMatchObject({ ok: false, reason: "aidUsed" });
    });
    it("does not use an action", () => {
        expect(aid(fresh(), { total: 15 }).state.actedThisRound).toEqual({});
    });
    it("allows one aid per ship per round", () => {
        const once = aid(fresh(), { total: 15 }).state;
        expect(aid(once, { total: 15, allyId: "pil" })).toMatchObject({ ok: false, reason: "aidUsed" });
        const nextRoundState = { ...once, modifiers: once.modifiers.filter(m => m.expiresAfterRound > ROUND) };
        expect(applyVirtualIntelligenceAid(nextRoundState, { shipId: "pc1", allyId: "g1", dc: 15, crew, total: 15 }, ROUND + 1).ok).toBe(true);
    });
    it("refuses an ally who already acted or is not on the crew", () => {
        const acted = recordAction(fresh(), "g1", "acr");
        expect(aid(acted, { total: 15 })).toMatchObject({ ok: false, reason: "badAlly" });
        expect(aid(fresh(), { total: 15, allyId: "stranger" })).toMatchObject({ ok: false, reason: "badAlly" });
    });
    it("refuses a ship that is out of the fight", () => {
        const out = knockOutAtZero(fresh(), "pc1", 0).state;
        expect(aid(out, { total: 15 })).toMatchObject({ ok: false, reason: "shipOut" });
    });
    it("refuses a ship that is not a PC ship", () => {
        expect(applyVirtualIntelligenceAid(addModifier(fresh(), { target: "x", kind: "y", value: 0, expiresAfterRound: 9 }),
            { shipId: "e1", allyId: "g1", dc: 15, crew, total: 15 }, ROUND)).toMatchObject({ ok: false, reason: "wrongSide" });
    });
});
