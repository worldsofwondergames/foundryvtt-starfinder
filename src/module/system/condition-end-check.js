import { DiceSFRPG } from "../dice.js";
import RollContext from "../rolls/rollcontext.js";
import { RPC } from "../rpc.js";
import { BURNING_FAMILY, attemptBonus, burningDC, endCheckFor, isCheckDue, recordAttempt } from "../rules/condition-end-check.js";
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
    const key = check.kind === "save" ? CONFIG.SFRPG.saves[check.id] : CONFIG.SFRPG.skills[check.id];
    return game.i18n.localize(key);
}

/**
 * The DC of a check right now. The Burning family works it out from the
 * damage the condition dealt this round.
 *
 * @param {string} condition
 * @param {Item} item
 * @param {object} check
 * @returns {number}
 */
function currentDC(condition, item, check) {
    if (!BURNING_FAMILY.includes(condition)) return check.dc;
    return burningDC(item.getFlag("sfrpg", "ongoingDamageTaken") ?? null, game.combat?.round ?? null);
}

/**
 * Post a card for each condition on the actor whose check is due at the end of
 * its turn. Runs for the active GM, after the condition timers count down, so a
 * condition whose rounds ran out has already gone.
 *
 * @param {ActorSFRPG} actor The creature whose turn ended.
 * @returns {Promise<void>}
 */
export async function postEndCheckCards(actor) {
    const round = game.combat?.round ?? null;
    for (const condition of Object.keys(CONFIG.SFRPG.conditionTypes)) {
        const item = actor.getCondition?.(condition);
        if (!item?.system.enabled) continue;

        const check = endCheckFor(condition, item.getFlag("sfrpg", "conditionEndCheck") ?? null);
        if (!isCheckDue(check)) continue;

        const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
        const dc = currentDC(condition, item, check);
        const bonus = attemptBonus(check, round, { smother: false });
        const link = (smother, text) => `<a class="enriched-link" data-action="${ACTION}" data-condition="${condition}" data-dc="${dc}" data-smother="${smother}" data-index="${smother ? 1 : 0}"><i class="fas fa-dice-d20"></i> ${text}</a>`;

        const lines = [game.i18n.format("SFRPG.ConditionEndCheck.Card", { name: actor.name, check: checkLabel(check), condition: label, dc })];
        if (bonus) lines.push(game.i18n.format("SFRPG.ConditionEndCheck.Bonus", { bonus }));
        const links = [link(false, game.i18n.localize("SFRPG.ConditionEndCheck.Roll"))];
        if (check.smotherBonus) links.push(link(true, game.i18n.localize("SFRPG.ConditionEndCheck.Smother")));

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
    return { total: result.roll.total, success: result.roll.total >= dc };
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
    const item = actor.getCondition?.(condition);
    const check = item ? endCheckFor(condition, item.getFlag("sfrpg", "conditionEndCheck") ?? null) : null;
    if (!check) {
        ui.notifications.info(game.i18n.localize("SFRPG.ConditionEndCheck.AlreadyResolved"));
        await spend(link);
        return;
    }

    const round = game.combat?.round ?? null;
    const smother = link.dataset.smother === "true";
    const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
    const result = await rollEndCheck(actor, check, {
        dc: Number(link.dataset.dc),
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
    const patient = await fromUuid(message.payload?.actorUuid ?? "");
    await patient?.setCondition?.("bleeding", false);
}
