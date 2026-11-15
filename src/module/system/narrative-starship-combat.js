/**
 * The Foundry code for narrative starship combat. It keeps the combat's round state, handles crew
 * actions for the GM, and runs the Resolve phase. The rules are in rules/narrative-starship and are pure.
 * Nothing here touches Foundry when the module loads, so tests can import it.
 */
import { openNarrativeTacticsDialog, refreshNarrativeTacticsDialog } from "../apps/narrative-tactics-dialog.js";
import { RPC } from "../rpc.js";
import { applyCrewAction, crewActionDCShip, resolveNarrativeRound } from "../rules/narrative-starship/apply-crew-action.js";
import { NARRATIVE_CREW_ACTIONS, NARRATIVE_ROLES, dcFor } from "../rules/narrative-starship/crew-actions.js";
import { endOfRound, fleeingEnemies } from "../rules/narrative-starship/round-end.js";
import { initialState } from "../rules/narrative-starship/state.js";
import { absorbHit, hasUpgrade } from "../rules/narrative-starship/upgrades.js";
import {
    NARRATIVE_TACTICS, applyTactic, chooseTactic, enemyCheckBonus, forceHardFor, presetNextTactic, revealPending, tacticDC,
    tacticRollCount
} from "../rules/narrative-starship/tactics.js";

export const NARRATIVE_COMBAT_TYPE = "narrativeStarship";
/** Phase indexes of the narrative combat type. */
export const TACTICS_PHASE = 1;
export const CREW_ACTIONS_PHASE = 2;
export const RESOLVE_PHASE = 3;

const CREW_ROLES = NARRATIVE_ROLES.filter(role => role !== "any");
const LABEL = "SFRPG.NarrativeStarship.";

/** The last queued job for each combat id. */
const combatQueues = new Map();

/**
 * Runs jobs for one combat one at a time, in the order they were queued, so each reads the
 * state the previous one saved. If a job throws, the error is logged and the next job still runs.
 * @param {string} combatId
 * @param {function(): Promise<any>} job
 * @returns {Promise<any>} The job's result, or undefined if it threw.
 */
export function queueForCombat(combatId, job) {
    const previous = combatQueues.get(combatId) ?? Promise.resolve();
    const run = previous.then(job).catch(error => {
        console.error(`Starfinder | Narrative starship combat ${combatId}:`, error);
    });
    combatQueues.set(combatId, run);
    run.then(() => {
        if (combatQueues.get(combatId) === run) combatQueues.delete(combatId);
    });
    return run;
}

/**
 * Whether a combat is a started narrative starship combat.
 * @param {Combat} combat
 * @returns {boolean}
 */
export function isNarrativeCombat(combat) {
    return Boolean(combat?.started) && combat.getCombatType?.() === NARRATIVE_COMBAT_TYPE;
}

/**
 * The started narrative combat that a starship takes part in, if any.
 * @param {string} shipId
 * @returns {Combat|null}
 */
export function narrativeCombatFor(shipId) {
    return game.combats?.find(c => isNarrativeCombat(c) && c.getFlag("sfrpg", "narrative")?.ships?.[shipId]) ?? null;
}

/**
 * The actor for a ship id in a combat. Uses the combatant's actor so unlinked tokens are found.
 * @param {Combat} combat
 * @param {string} shipId
 * @returns {Actor|null}
 */
export function shipActor(combat, shipId) {
    return combat.combatants.find(c => c.actorId === shipId)?.actor ?? game.actors.get(shipId) ?? null;
}

/**
 * Crew by ship and role for every PC ship in the state, read from the ship actors.
 * @param {Combat} combat
 * @param {object} state
 * @returns {Record<string, Record<string, string[]>>}
 */
export function crewByShip(combat, state) {
    const crew = {};
    for (const [id, ship] of Object.entries(state.ships)) {
        if (ship.side !== "pc") continue;
        const actor = shipActor(combat, id);
        crew[id] = Object.fromEntries(CREW_ROLES.map(role => [role, [...(actor?.system.crew?.[role]?.actorIds ?? [])]]));
    }
    return crew;
}

/**
 * Saves the round state, replacing the stored one so removed keys do not linger.
 * @param {Combat} combat
 * @param {object} state
 */
export async function saveNarrativeState(combat, state) {
    await combat.update({ "flags.sfrpg.narrative": foundry.data.operators.ForcedReplacement.create(state) });
}

/**
 * A combat start step. Builds the round state from the starships in a narrative combat.
 * @param {Combat} combat
 */
export async function initializeNarrativeState(combat) {
    if (combat.getCombatType() !== NARRATIVE_COMBAT_TYPE) return;
    const ships = [];
    for (const combatant of combat.combatants) {
        const actor = combatant.actor;
        if (actor?.type !== "starship" || ships.some(s => s.id === combatant.actorId)) continue;
        ships.push({ id: combatant.actorId, side: actor.system.crew?.useNPCCrew ? "enemy" : "pc" });
    }
    await saveNarrativeState(combat, initialState(ships));
    await combat.unsetFlag("sfrpg", "narrativeResolvedRound");
}

/**
 * The skill keys a crew member can roll. Leaves out disabled skills and trained-only skills without ranks.
 * @param {Actor} actor
 * @returns {string[]}
 */
export function usableSkills(actor) {
    return Object.entries(actor.system.skills ?? {})
        .filter(([, skill]) => skill.enabled !== false && !(skill.isTrainedOnly && !(skill.ranks > 0)))
        .map(([key]) => key);
}

function reply(sender, reason) {
    RPC.sendMessageTo(sender, "narrativeCrewActionRejected", { reason });
}

/** Payload fields the GM reads. Anything else the client sends is ignored. */
function readPayload(payload) {
    const id = value => (typeof value === "string" && value ? value : undefined);
    return {
        combatId: id(payload?.combatId),
        shipId: id(payload?.shipId),
        actorId: id(payload?.actorId),
        role: id(payload?.role),
        actionKey: id(payload?.actionKey),
        targetId: id(payload?.targetId),
        secondTargetId: id(payload?.secondTargetId),
        allyId: id(payload?.allyId),
        secondAllyId: id(payload?.secondAllyId),
        targetAction: id(payload?.targetAction),
        skillKey: id(payload?.skillKey),
        total: Number(payload?.total),
        spentResolve: payload?.spentResolve === true,
        free: payload?.free === true,
        roll: payload?.roll
    };
}

/**
 * GM handler for the narrativeCrewAction RPC event. Only the active GM runs it.
 * @param {{sender: string, payload: object}} message
 */
export async function onNarrativeCrewActionRequest(message) {
    if (!game.users.activeGM?.isSelf) return;
    const combatId = typeof message.payload?.combatId === "string" ? message.payload.combatId : "";
    return queueForCombat(combatId, () => handleCrewAction(message));
}

async function handleCrewAction(message) {
    const input = readPayload(message.payload);
    const user = game.users.get(message.sender);
    const combat = game.combats.get(input.combatId);
    if (!isNarrativeCombat(combat)) return reply(message.sender, "noCombat");
    if (combat.flags.sfrpg?.phase !== CREW_ACTIONS_PHASE) return reply(message.sender, "wrongPhase");

    const actor = game.actors.get(input.actorId);
    if (!user || !actor?.testUserPermission(user, "OWNER")) return reply(message.sender, "notOwner");
    if (!Number.isFinite(input.total)) return reply(message.sender, "badRoll");

    const state = combat.getFlag("sfrpg", "narrative");
    const action = NARRATIVE_CREW_ACTIONS[input.actionKey];
    if (!state || !action) return reply(message.sender, "unknownAction");

    // The DC comes from the ship stats on this client, never from the player.
    const dcShipId = crewActionDCShip(input.actionKey, input);
    const dcShip = state.ships[dcShipId] ? shipActor(combat, dcShipId) : null;
    if (!dcShip) return reply(message.sender, "badTarget");
    const derived = dcShip.system.narrative?.derived ?? {};
    const forceHard = forceHardFor(state, {
        shipId: input.shipId,
        targetId: action.dcOf === "target" ? input.targetId : undefined,
        skillKey: input.skillKey
    }, combat.round);
    const dc = dcFor(action, input.skillKey, { average: derived.averageDC, hard: derived.hardDC }, forceHard);

    const result = applyCrewAction(state, {
        ...input,
        dc,
        actorResolve: actor.system.attributes?.rp?.value ?? 0,
        actorSkills: usableSkills(actor),
        crew: crewByShip(combat, state)
    }, combat.round);

    const rejected = result.effects.find(e => e.kind === "rejected");
    if (rejected) return reply(message.sender, rejected.reason);

    await saveNarrativeState(combat, result.state);
    const lines = await applyEffects(combat, result.effects);
    await postCrewActionCard({ combat, actor, input, action, dc, result, lines });
    if (action.effect === "forceTacticReveal" && result.success) await askForNextTactic(combat, input.targetId);
}

/**
 * After Prognosticate, tells the GM to pick the enemy's tactic for next round now, and opens the tactics
 * dialog where the GM picks it. The dialog is not waited for, so the combat's queue keeps moving.
 */
async function askForNextTactic(combat, enemyId) {
    const name = shipActor(combat, enemyId)?.name ?? enemyId;
    await ChatMessage.create({
        content: `<p>${game.i18n.format(LABEL + "TacticsDialog.RevealWhisper", { ship: name })}</p>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
        speaker: { alias: combat.getCombatName?.() ?? "" }
    });
    openNarrativeTacticsDialog(combat);
}

/**
 * Ablative Plating for a hit on a PC ship: takes the plating's one ignored hit off the amount and saves that it
 * is used up. Enemy ships and ships without the upgrade take the full amount.
 * @returns {Promise<number>} The hits the ship takes.
 */
async function absorbPcHit(combat, shipId, ship, hits) {
    const state = combat.getFlag("sfrpg", "narrative");
    if (state?.ships?.[shipId]?.side !== "pc") return hits;
    const absorbed = absorbHit(state, shipId, hits, ship.system.narrative?.upgrades);
    if (absorbed.state !== state) await saveNarrativeState(combat, absorbed.state);
    return absorbed.hits;
}

/**
 * Applies heal, hit, and Resolve effects to the documents.
 * @returns {Promise<string[]>} A line of text for each effect, for the result card.
 */
export async function applyEffects(combat, effects) {
    const lines = [];
    for (const effect of effects) {
        if (effect.kind === "heal" || effect.kind === "hit") {
            const ship = shipActor(combat, effect.target);
            if (!ship) continue;
            const derived = ship.system.narrative?.derived ?? {};
            const current = derived.hpValue ?? 0;
            let amount = effect.value;
            if (effect.kind === "hit") amount = await absorbPcHit(combat, effect.target, ship, amount);
            const value = effect.kind === "heal"
                ? Math.min(derived.hpMax ?? current, current + amount)
                : Math.max(0, current - amount);
            await ship.update({ "system.narrative.hp.value": value });
            const key = effect.kind === "heal" ? "Card.Healed" : "Card.Hit";
            lines.push(game.i18n.format(LABEL + key, { ship: ship.name, value: amount }));
        } else if (effect.kind === "regainResolve" || effect.kind === "spendResolve") {
            const target = game.actors.get(effect.target);
            const rp = target?.system.attributes?.rp;
            if (!rp) continue;
            const value = effect.kind === "regainResolve"
                ? Math.min(rp.max ?? 0, rp.value + effect.value)
                : Math.max(0, rp.value - effect.value);
            await target.update({ "system.attributes.rp.value": value });
            const key = effect.kind === "regainResolve" ? "Card.RegainedResolve" : "Card.SpentResolve";
            lines.push(game.i18n.format(LABEL + key, { name: target.name }));
        }
    }
    return lines;
}

function skillLabel(actor, skillKey) {
    if (skillKey === "rangedAttack") return game.i18n.localize(LABEL + "RangedAttack");
    const base = game.i18n.localize(CONFIG.SFRPG.skills[skillKey?.substring(0, 3)] ?? skillKey);
    const subname = skillKey?.startsWith("pro") ? actor.system.skills?.[skillKey]?.subname : "";
    return subname ? `${base} (${subname})` : base;
}

async function postCrewActionCard({ combat, actor, input, action, dc, result, lines }) {
    let roll = null;
    try {
        if (input.roll) roll = Roll.fromData(input.roll);
    } catch {
        roll = null;
    }
    const target = input.targetId ? shipActor(combat, input.targetId) : null;
    const content = await foundry.applications.handlebars.renderTemplate("systems/sfrpg/templates/chat/narrative-crew-action.hbs", {
        actionName: game.i18n.localize(`${LABEL}CrewActions.${input.actionKey}.Name`),
        actorName: actor.name,
        skill: skillLabel(actor, input.skillKey),
        targetName: target?.name ?? "",
        total: input.total,
        dc,
        success: result.success,
        successes: result.successes,
        effectText: result.success ? game.i18n.localize(`${LABEL}CrewActions.${input.actionKey}.Effect`) : "",
        lines,
        rollHTML: roll ? await roll.render() : "",
        free: input.free,
        role: game.i18n.localize(`${LABEL}Roles.${action.role === "any" ? input.role : action.role}`)
    });
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        flags: { sfrpg: { narrativeCrewAction: true } }
    });
}

/**
 * Player side of a rejected action.
 * @param {{payload: {reason: string}}} message
 */
export function onNarrativeCrewActionRejected(message) {
    const reason = message.payload?.reason ?? "unknownAction";
    ui.notifications.warn(game.i18n.localize(`${LABEL}Rejected.${reason}`));
}

/**
 * Resolve phase, run by the active GM when a narrative combat moves forward into it:
 * successes become hits, HP drops, fleeing enemies leave, and a summary goes to chat.
 * @param {Combat} combat
 * @param {number} [round] The round to resolve. Defaults to the combat's round. The round-advance path passes
 *   the round that ended without a Resolve phase.
 */
export async function resolveNarrativePhase(combat, round = combat.round) {
    return queueForCombat(combat.id, () => resolveRoundNow(combat, round));
}

async function resolveRoundNow(combat, round) {
    const state = combat.getFlag("sfrpg", "narrative");
    if (!state || combat.getFlag("sfrpg", "narrativeResolvedRound") === round) return;

    const ships = {};
    for (const id of Object.keys(state.ships)) {
        const derived = shipActor(combat, id)?.system.narrative?.derived ?? {};
        ships[id] = { threshold: derived.threshold, hpValue: derived.hpValue, upgrades: shipActor(combat, id)?.system.narrative?.upgrades };
    }
    // Successes become hits first, so Flee sees the HP the ship has left at the end of the round.
    const result = resolveNarrativeRound(state, ships, round);
    const tractor = await rollTractorBeam(combat, result, round);
    const end = endOfRound(result.state, result.hp, tractor);

    for (const [id, hits] of Object.entries(result.hits)) {
        if (hits <= 0) continue;
        await shipActor(combat, id)?.update({ "system.narrative.hp.value": result.hp[id] });
    }
    await saveNarrativeState(combat, end.state);
    await combat.setFlag("sfrpg", "narrativeResolvedRound", round);
    // A ship that fled is out of the fight, so the tracker marks it defeated.
    for (const id of end.fled) {
        await combat.combatants.find(c => c.actorId === id)?.update({ defeated: true });
    }

    const name = id => shipActor(combat, id)?.name ?? id;
    const content = await foundry.applications.handlebars.renderTemplate("systems/sfrpg/templates/chat/narrative-resolve.hbs", {
        round,
        hits: Object.entries(result.hits).filter(([, n]) => n > 0)
            .map(([id, n]) => ({ name: name(id), hits: n, hp: result.hp[id] })),
        out: result.out.map(name),
        fled: end.fled.map(name),
        held: end.held.map(name),
        ended: end.ended ? game.i18n.localize(`${LABEL}Resolve.${end.ended}`) : ""
    });
    await ChatMessage.create({ speaker: { alias: combat.getCombatName?.() ?? "" }, content });
}

/**
 * Tractor Beam: each enemy ship that is about to flee rolls d20 + its skill bonus + its check modifiers against the
 * highest Hard DC among the PC ships that still have HP and the upgrade. The rolls go to chat.
 * @param {Combat} combat
 * @param {{state: object, hp: Record<string, number>}} result The Resolve result.
 * @param {number} round The round being resolved.
 * @returns {Promise<{tractorRolls?: Record<string, number>, tractorDC?: number}>} Empty when no PC ship has the upgrade.
 */
async function rollTractorBeam(combat, { state, hp }, round) {
    const dcs = Object.entries(state.ships)
        .filter(([id, ship]) => ship.side === "pc" && (hp[id] ?? 0) > 0)
        .map(([id]) => shipActor(combat, id))
        .filter(ship => hasUpgrade(ship?.system.narrative?.upgrades, "tractorBeam"))
        .map(ship => Number(ship.system.narrative?.derived?.hardDC));
    const tractorDC = Math.max(...dcs);
    if (!Number.isFinite(tractorDC)) return {};

    const tractorRolls = {};
    for (const id of fleeingEnemies(state, hp)) {
        const enemy = shipActor(combat, id);
        const skillBonus = Number(enemy?.system.narrative?.derived?.skillBonus ?? 0);
        const bonus = enemyCheckBonus(state, id, round);
        const roll = await new Roll("1d20 + @skillBonus + @bonus", { skillBonus, bonus }).evaluate();
        tractorRolls[id] = roll.total;
        await roll.toMessage({
            speaker: { alias: enemy?.name ?? id },
            flavor: game.i18n.format(LABEL + "Resolve.TractorCheck", { ship: enemy?.name ?? id, dc: tractorDC })
        });
    }
    return { tractorRolls, tractorDC };
}

/**
 * Rolls an enemy tactic for the GM. It records the choice, rolls the checks, applies the result, and posts the
 * tactic card. Runs in the combat's queue. Shows a warning and changes nothing when the tactic is refused.
 * @param {Combat} combat
 * @param {{enemyId: string, tactic: string, targetId?: string, choice?: "average"|"hard"}} input
 * @returns {Promise<boolean>} Whether the tactic was used.
 */
export async function runEnemyTactic(combat, input) {
    return queueForCombat(combat.id, () => runEnemyTacticNow(combat, input));
}

function warnTactic(reason) {
    ui.notifications.warn(game.i18n.localize(`${LABEL}TacticRejected.${reason}`));
    return false;
}

async function runEnemyTacticNow(combat, { enemyId, tactic, targetId, choice }) {
    if (!isNarrativeCombat(combat)) return warnTactic("noCombat");
    if (combat.flags.sfrpg?.phase !== TACTICS_PHASE) return warnTactic("wrongPhase");
    const state = combat.getFlag("sfrpg", "narrative");
    const round = combat.round;
    const target = NARRATIVE_TACTICS[tactic]?.pcTarget ? targetId : null;

    let chosen;
    try {
        chosen = chooseTactic(state, enemyId, tactic, target, round);
    } catch (error) {
        return warnTactic(error.message);
    }

    const enemy = shipActor(combat, enemyId);
    const targetShip = target ? shipActor(combat, target) : null;
    const targetDerived = targetShip?.system.narrative?.derived ?? {};
    const dcs = { average: targetDerived.averageDC, hard: targetDerived.hardDC };
    const skillBonus = Number(enemy?.system.narrative?.derived?.skillBonus ?? 0);
    const bonus = enemyCheckBonus(chosen, enemyId, round);
    const count = tacticRollCount(chosen, { enemyId, tactic }, round);
    const input = { enemyId, tactic, targetId: target, dcs, choice };

    // Catch a refusal, such as a missing DC choice, before rolling.
    const check = applyTactic(chosen, { ...input, rolls: Array(count).fill(0) }, round);
    const refused = check.effects.find(e => e.kind === "rejected");
    if (refused) return warnTactic(refused.reason);

    const rolls = [];
    for (let i = 0; i < count; i++) {
        rolls.push(await new Roll("1d20 + @skillBonus + @bonus", { skillBonus, bonus }).evaluate());
    }
    const result = applyTactic(chosen, { ...input, rolls: rolls.map(r => r.total) }, round);
    const rejected = result.effects.find(e => e.kind === "rejected");
    if (rejected) return warnTactic(rejected.reason);

    await saveNarrativeState(combat, result.state);
    const lines = await applyEffects(combat, result.effects);
    const dc = count > 0 ? tacticDC(chosen, input, dcs, round) : null;
    await postTacticCard({ combat, enemy, targetShip, tactic, rolls, dc, result, lines });
    return true;
}

async function postTacticCard({ combat, enemy, targetShip, tactic, rolls, dc, result, lines }) {
    const manual = result.effects.some(e => e.kind === "manual");
    const worst = rolls.length ? Math.min(...rolls.map(r => r.total)) : null;
    const abilities = manual
        ? await foundry.applications.ux.TextEditor.enrichHTML(enemy?.system.narrative?.specialAbilities ?? "", {
            rollData: enemy?.getRollData() ?? {}
        })
        : "";
    const content = await foundry.applications.handlebars.renderTemplate("systems/sfrpg/templates/chat/narrative-tactic.hbs", {
        tacticName: game.i18n.localize(`${LABEL}Tactics.${tactic}.Name`),
        shipName: enemy?.name ?? "",
        targetName: targetShip?.name ?? "",
        rollsHTML: await Promise.all(rolls.map(r => r.render())),
        hasCheck: rolls.length > 0,
        dc,
        success: rolls.length > 0 && worst >= dc,
        effectText: game.i18n.localize(`${LABEL}Tactics.${tactic}.Effect`),
        lines,
        manual,
        abilities
    });
    await ChatMessage.create({
        speaker: { alias: enemy?.name ?? combat.getCombatName?.() ?? "" },
        content,
        rolls,
        flags: { sfrpg: { narrativeTactic: true } }
    });
}

/**
 * Records the GM's pick for an enemy's next-round tactic after Prognosticate. Runs in the combat's queue.
 * @param {Combat} combat
 * @param {{enemyId: string, tactic: string, targetId?: string}} input
 * @returns {Promise<boolean>} Whether it was saved.
 */
export async function presetEnemyTactic(combat, { enemyId, tactic, targetId }) {
    return queueForCombat(combat.id, async () => {
        const state = combat.getFlag("sfrpg", "narrative");
        if (!isNarrativeCombat(combat) || !state) return warnTactic("noCombat");
        let next;
        try {
            next = presetNextTactic(state, enemyId, tactic, targetId ?? null, combat.round);
        } catch (error) {
            return warnTactic(error.message);
        }
        await saveNarrativeState(combat, next);
        return true;
    });
}

/**
 * Whether the GM sees the Enemy Tactics button on an enemy ship's sheet: during Enemy Tactics, or while
 * Prognosticate waits for the GM to pick the ship's next tactic.
 * @param {Actor} ship
 * @returns {Combat|null} The combat the button opens the dialog for.
 */
export function tacticsCombatFor(ship) {
    if (!game.user.isGM) return null;
    const combat = narrativeCombatFor(ship.id);
    const state = combat?.getFlag("sfrpg", "narrative");
    if (state?.ships[ship.id]?.side !== "enemy") return null;
    if (combat.flags.sfrpg?.phase === TACTICS_PHASE || revealPending(state, ship.id, combat.round)) return combat;
    return null;
}

/**
 * The roles and crew each user can act for on a ship during the Crew Actions phase.
 * @param {Actor} ship
 * @returns {{combat: Combat, actable: Record<string, Record<string, boolean>>}|null}
 */
export function actableCrew(ship) {
    const combat = narrativeCombatFor(ship.id);
    if (!combat || combat.flags.sfrpg?.phase !== CREW_ACTIONS_PHASE) return null;
    const state = combat.getFlag("sfrpg", "narrative");
    if (state.ships[ship.id]?.side !== "pc") return null;
    const actable = {};
    for (const role of CREW_ROLES) {
        actable[role] = {};
        for (const id of ship.system.crew?.[role]?.actorIds ?? []) {
            if (game.actors.get(id)?.isOwner) actable[role][id] = true;
        }
    }
    return { combat, actable };
}

/** Redraws open sheets of the ships in a narrative combat when its phase, round, or state changes. */
function onUpdateCombat(combat, changed) {
    if (combat.getCombatType?.() !== NARRATIVE_COMBAT_TYPE) return;
    const flags = changed.flags?.sfrpg ?? {};
    if (!("round" in changed) && !("phase" in flags) && !("narrative" in flags)) return;
    refreshNarrativeTacticsDialog(combat);
    for (const combatant of combat.combatants) {
        const sheet = combatant.actor?.sheet;
        if (combatant.actor?.type === "starship" && sheet?.rendered) sheet.render(false);
    }
}

/** Registers the RPC callbacks and hooks. Called once during setup. */
export function initializeNarrativeStarshipCombat() {
    RPC.registerCallback("narrativeCrewAction", "gm", onNarrativeCrewActionRequest);
    RPC.registerCallback("narrativeCrewActionRejected", "local", onNarrativeCrewActionRejected);
    Hooks.on("updateCombat", onUpdateCombat);
}
