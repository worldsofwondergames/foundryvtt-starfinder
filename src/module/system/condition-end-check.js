import { DiceSFRPG } from "../dice.js";
import RollContext from "../rolls/rollcontext.js";
import { RPC } from "../rpc.js";
import { BURNING_FAMILY, attemptBonus, attemptRound, burningDC, checkSucceeds, endCheckFor, isCheckDue, recordAttempt } from "../rules/condition-end-check.js";
import { failureRecipients, spendFailureLink } from "./mech-failure-link.js";

/** The data-action of a card's Roll and Smother links. */
const ACTION = "conditionEndCheck";

/**
 * The name of a save or skill check, as the card shows it.
 *
 * @param {object} check
 * @returns {string}
 */
function checkLabel(check) {
    return check.kind === "save"
        ? game.i18n.format("SFRPG.ConditionEndCheck.SaveName", { save: game.i18n.localize(CONFIG.SFRPG.saves[check.id]) })
        : game.i18n.format("SFRPG.ConditionEndCheck.SkillName", { skill: game.i18n.localize(CONFIG.SFRPG.skills[check.id]) });
}

/**
 * The DC of a check in a given round. The Burning family works it out from the
 * damage the condition dealt that round.
 *
 * @param {string} condition
 * @param {Item} item
 * @param {object} check
 * @param {number|null} round
 * @returns {number}
 */
function dcFor(condition, item, check, round) {
    if (!BURNING_FAMILY.includes(condition)) return check.dc;
    return burningDC(item.getFlag("sfrpg", "ongoingDamageTaken") ?? null, round);
}

/**
 * Spend the buttons on every earlier card for this creature's condition, so only
 * the newest card can be rolled.
 *
 * @param {ActorSFRPG} actor
 * @param {string} condition
 * @returns {Promise<void>}
 */
async function spendEarlierCards(actor, condition) {
    const marks = [`data-actor-uuid="${actor.uuid}"`, `data-condition="${condition}"`, `data-action="${ACTION}"`];
    for (const message of game.messages.filter(m => marks.every(mark => m.content?.includes(mark)))) {
        const content = spendFailureLink(spendFailureLink(message.content, ACTION, "0"), ACTION, "1");
        if (content !== message.content) await message.update({ content });
    }
}

/**
 * Post a card for each condition on the actor whose check is due at the end of
 * its turn. Runs for the active GM, after the condition timers count down, so a
 * condition whose rounds ran out has already gone.
 *
 * @param {ActorSFRPG} actor The creature whose turn ended.
 * @param {number|null} round The round the turn belonged to. Foundry has already
 *     moved the combat on when the last creature in the order ends its turn.
 * @returns {Promise<void>}
 */
export async function postEndCheckCards(actor, round) {
    for (const condition of Object.keys(CONFIG.SFRPG.conditionTypes)) {
        const item = actor.getCondition?.(condition);
        if (!item?.system.enabled) continue;

        const check = endCheckFor(condition, item.getFlag("sfrpg", "conditionEndCheck") ?? null);
        if (!isCheckDue(check)) continue;

        const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
        const dc = dcFor(condition, item, check, round);
        const bonus = attemptBonus(check, round, { smother: false });
        const link = (smother, text) => `<a class="enriched-link" data-action="${ACTION}" data-condition="${condition}" data-item-id="${item.id}" data-round="${round ?? ""}" data-dc="${dc}" data-smother="${smother}" data-index="${smother ? 1 : 0}"><i class="fas fa-dice-d20"></i> ${text}</a>`;

        const lines = [game.i18n.format("SFRPG.ConditionEndCheck.Card", { name: actor.name, check: checkLabel(check), condition: label, dc })];
        if (bonus) lines.push(game.i18n.format("SFRPG.ConditionEndCheck.Bonus", { bonus }));
        const links = [link(false, game.i18n.localize("SFRPG.ConditionEndCheck.Roll"))];
        if (check.smotherBonus) links.push(link(true, game.i18n.localize("SFRPG.ConditionEndCheck.Smother")));

        await spendEarlierCards(actor, condition);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="sfrpg condition-end-check-card" data-actor-uuid="${actor.uuid}">${lines.map(line => `<p>${line}</p>`).join("")}<p>${links.join(" ")}</p></div>`,
            whisper: failureRecipients(game.users, actor)
        });
    }
}

/**
 * Roll a save or skill check against a DC for a creature.
 *
 * @param {ActorSFRPG} roller The creature making the check.
 * @param {object} check
 * @param {{dc: number, bonus: number, event: Event, label: string}} options
 * @returns {Promise<{total: number, success: boolean}|null>} Null if the roll dialog was closed.
 */
export async function rollEndCheck(roller, check, { dc, bonus, event, label }) {
    const parts = [check.kind === "save" ? `@attributes.${check.id}.bonus` : `@skills.${check.id}.mod`];
    if (bonus) parts.push(String(bonus));

    const result = await DiceSFRPG.d20Roll({
        event,
        rollContext: RollContext.createActorRollContext(roller),
        parts,
        title: label,
        speaker: ChatMessage.getSpeaker({ actor: roller }),
        rollType: check.kind === "save" ? "save" : "skill",
        difficulty: dc
    });
    if (!result?.roll) return null;
    const natural = result.roll.dice.find(die => die.faces === 20)?.total ?? null;
    return { total: result.roll.total, success: checkSucceeds(check, { total: result.roll.total, dc, natural }) };
}

/**
 * Grey a card's button out for every viewer.
 *
 * @param {HTMLElement} link The clicked link.
 * @returns {Promise<void>}
 */
async function spend(link) {
    const messageId = link.closest("[data-message-id]")?.dataset.messageId;
    const message = messageId ? game.messages.get(messageId) : null;
    if (!message) return;

    let content = spendFailureLink(message.content, ACTION, "0");
    content = spendFailureLink(content, ACTION, "1");
    if (content === message.content) return;
    if (game.user.isGM || message.isAuthor) await message.update({ content });
    else RPC.sendMessageTo("gm", "spendMechFailure", { messageId: message.id, content });
}

/**
 * Handle a click on a card's Roll or Smother button.
 *
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function onConditionEndCheckClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const link = event.currentTarget;
    if (!link.dataset.action) return;

    const actor = await fromUuid(link.closest("[data-actor-uuid]")?.dataset.actorUuid ?? "");
    if (!actor) return;
    if (!actor.isOwner) {
        ui.notifications.warn(game.i18n.format("SFRPG.ConditionEndCheck.NotOwner", { name: actor.name }));
        return;
    }

    const condition = link.dataset.condition;
    // A card for a condition that has since been removed, or removed and given
    // again, is done with.
    const item = actor.getCondition?.(condition);
    const current = item && item.id === link.dataset.itemId;
    const check = current ? endCheckFor(condition, item.getFlag("sfrpg", "conditionEndCheck") ?? null) : null;
    if (!check) {
        ui.notifications.info(game.i18n.localize("SFRPG.ConditionEndCheck.AlreadyResolved"));
        await spend(link);
        return;
    }

    const smother = link.dataset.smother === "true";
    const cardRound = link.dataset.round ? Number(link.dataset.round) : null;
    const round = attemptRound({ smother, cardRound, currentRound: game.combat?.round ?? null });
    const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
    const result = await rollEndCheck(actor, check, {
        // Smothering happens on the creature's own turn, after that round's damage.
        dc: smother ? dcFor(condition, item, check, round) : Number(link.dataset.dc),
        bonus: attemptBonus(check, round, { smother }),
        event,
        label: `${checkLabel(check)}: ${label}`
    });
    if (!result) return;

    await spend(link);
    const next = recordAttempt(check, round, result.success);
    if (next) await item.setFlag("sfrpg", "conditionEndCheck", next);
    else await actor.setCondition(condition, false);

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: game.i18n.format(result.success ? "SFRPG.ConditionEndCheck.Ended" : "SFRPG.ConditionEndCheck.Failed", { name: actor.name, condition: label }),
        whisper: failureRecipients(game.users, actor)
    });
}

/**
 * Handle a click on Stop bleeding. The Medicine check is made by the clicking
 * user's assigned character, or by their controlled token when they have none.
 *
 * @param {Event} event
 * @returns {Promise<void>}
 */
export async function onStopBleedingClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const link = event.currentTarget;

    const patient = await fromUuid(link.closest("[data-actor-uuid]")?.dataset.actorUuid ?? "");
    const item = patient?.getCondition?.("bleeding");
    if (!item) {
        ui.notifications.info(game.i18n.localize("SFRPG.ConditionEndCheck.AlreadyResolved"));
        return;
    }

    const healer = game.user.character ?? canvas.tokens?.controlled[0]?.actor ?? null;
    if (!healer) {
        ui.notifications.warn(game.i18n.localize("SFRPG.ConditionEndCheck.NoHealer"));
        return;
    }

    const check = endCheckFor("bleeding", null);
    const result = await rollEndCheck(healer, check, {
        dc: check.dc,
        bonus: 0,
        event,
        label: game.i18n.localize("SFRPG.ConditionEndCheck.StopBleeding")
    });
    if (!result) return;

    if (result.success) {
        if (patient.isOwner) await patient.setCondition("bleeding", false);
        else RPC.sendMessageTo("gm", "stopBleeding", { actorUuid: patient.uuid });
    }

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: healer }),
        content: game.i18n.format(result.success ? "SFRPG.ConditionEndCheck.Stopped" : "SFRPG.ConditionEndCheck.NotStopped", { healer: healer.name, name: patient.name })
    });
}

/**
 * Remove bleeding for a healer who does not own the patient.
 *
 * @param {object} message The RPC message.
 * @returns {Promise<void>}
 */
export async function onStopBleedingRequest(message) {
    // Every GM receives the request, and only one of them should act on it.
    if (!game.users.activeGM?.isSelf) return;
    const patient = await fromUuid(message.payload?.actorUuid ?? "");
    await patient?.setCondition?.("bleeding", false);
}
