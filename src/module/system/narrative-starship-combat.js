/**
 * The Foundry code for narrative starship combat. It keeps the combat's round state, handles crew
 * actions for the GM, and runs the Resolve phase. The rules are in rules/narrative-starship and are pure.
 * Nothing here touches Foundry when the module loads, so tests can import it.
 */
import { RPC } from "../rpc.js";
import { applyCrewAction, crewActionDCShip, resolveNarrativeRound } from "../rules/narrative-starship/apply-crew-action.js";
import { NARRATIVE_CREW_ACTIONS, NARRATIVE_ROLES, dcFor } from "../rules/narrative-starship/crew-actions.js";
import { initialState } from "../rules/narrative-starship/state.js";

export const NARRATIVE_COMBAT_TYPE = "narrativeStarship";
/** Phase indexes of the narrative combat type. */
export const CREW_ACTIONS_PHASE = 2;
export const RESOLVE_PHASE = 3;

const CREW_ROLES = NARRATIVE_ROLES.filter(role => role !== "any");
const LABEL = "SFRPG.NarrativeStarship.";

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
    const dc = dcFor(action, input.skillKey, { average: derived.averageDC, hard: derived.hardDC });

    const result = applyCrewAction(state, {
        ...input,
        dc,
        actorResolve: actor.system.attributes?.rp?.value ?? 0,
        crew: crewByShip(combat, state)
    }, combat.round);

    const rejected = result.effects.find(e => e.kind === "rejected");
    if (rejected) return reply(message.sender, rejected.reason);

    await saveNarrativeState(combat, result.state);
    const lines = await applyEffects(combat, result.effects);
    await postCrewActionCard({ combat, actor, input, action, dc, result, lines });
}

/**
 * Applies heal, hit, and Resolve effects to the documents.
 * @returns {Promise<string[]>} A line of text for each effect, for the result card.
 */
async function applyEffects(combat, effects) {
    const lines = [];
    for (const effect of effects) {
        if (effect.kind === "heal" || effect.kind === "hit") {
            const ship = shipActor(combat, effect.target);
            if (!ship) continue;
            const derived = ship.system.narrative?.derived ?? {};
            const current = derived.hpValue ?? 0;
            const value = effect.kind === "heal"
                ? Math.min(derived.hpMax ?? current, current + effect.value)
                : Math.max(0, current - effect.value);
            await ship.update({ "system.narrative.hp.value": value });
            const key = effect.kind === "heal" ? "Card.Healed" : "Card.Hit";
            lines.push(game.i18n.format(LABEL + key, { ship: ship.name, value: effect.value }));
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
 * successes become hits, HP drops, and a summary goes to chat.
 * @param {Combat} combat
 */
export async function resolveNarrativePhase(combat) {
    const state = combat.getFlag("sfrpg", "narrative");
    if (!state || combat.getFlag("sfrpg", "narrativeResolvedRound") === combat.round) return;

    const ships = {};
    for (const id of Object.keys(state.ships)) {
        const derived = shipActor(combat, id)?.system.narrative?.derived ?? {};
        ships[id] = { threshold: derived.threshold, hpValue: derived.hpValue };
    }
    const result = resolveNarrativeRound(state, ships, combat.round);

    for (const [id, hits] of Object.entries(result.hits)) {
        if (hits <= 0) continue;
        await shipActor(combat, id)?.update({ "system.narrative.hp.value": result.hp[id] });
    }
    await saveNarrativeState(combat, result.state);
    await combat.setFlag("sfrpg", "narrativeResolvedRound", combat.round);

    const name = id => shipActor(combat, id)?.name ?? id;
    const content = await foundry.applications.handlebars.renderTemplate("systems/sfrpg/templates/chat/narrative-resolve.hbs", {
        round: combat.round,
        hits: Object.entries(result.hits).filter(([, n]) => n > 0)
            .map(([id, n]) => ({ name: name(id), hits: n, hp: result.hp[id] })),
        out: result.out.map(name),
        ended: result.ended ? game.i18n.localize(`${LABEL}Resolve.${result.ended}`) : ""
    });
    await ChatMessage.create({ speaker: { alias: combat.getCombatName?.() ?? "" }, content });
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
