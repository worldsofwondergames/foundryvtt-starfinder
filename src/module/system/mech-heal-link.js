import { RPC } from "../rpc.js";
import { healedHitPoints, repairCooldownRemaining } from "../rules/mech-heal.js";
import { promoteDiceLink } from "./mech-dice-link.js";
import { rollOnce } from "./chat-button-claim.js";

/** The flag holding the world time a mech was last repaired. */
const REPAIRED_AT_FLAG = "repairedAt";

/**
 * Turn the dice in a healing action's description into the control that rolls
 * the heal.
 *
 * The text reads "1d6 x the mech's tier", and the text editor links only the
 * "1d6". The link keeps that text, and carries the whole formula for this
 * mech's tier for the click to roll.
 *
 * @param {Element} root The enriched description.
 * @param {string} dice The dice the link was built from, e.g. "1d6".
 * @param {Object} data Values to carry on the link.
 * @param {string} data.formula The formula to roll, e.g. "1d6 * 3".
 * @param {string} data.target "self" or "target".
 * @param {number|null} [data.range] How far a targeted heal reaches, in feet.
 * @param {string} [data.source] Name of the action, for the chat card.
 * @param {string} [tooltip] Hover text explaining what clicking does.
 * @returns {HTMLAnchorElement|null} The promoted link, or null if the description held no such dice link.
 */
export function promoteDiceLinkToHeal(root, dice, { formula, target, range = null, source = "" }, tooltip = "") {
    return promoteDiceLink(root, dice, {
        action: "mechHeal",
        data: { healFormula: formula, healTarget: target, healRange: range, source },
        tooltip
    });
}

/**
 * The mech a heal goes to, or the reason there is none.
 *
 * @param {Actor} actor The mech using the ability.
 * @param {HTMLElement} link The clicked link.
 * @returns {{patient: Actor}|{warning: string}}
 */
function healPatient(actor, link) {
    if (link.dataset.healTarget !== "target") return { patient: actor };

    const targets = [...(game.user.targets ?? [])];
    if (targets.length !== 1) return { warning: game.i18n.localize("SFRPG.MechSheet.Heal.NoTarget") };

    const targetToken = targets[0];
    const patient = targetToken.actor;
    if (patient?.type !== "mech") {
        return { warning: game.i18n.format("SFRPG.MechSheet.Heal.NotMech", { name: targetToken.name }) };
    }

    const range = Number(link.dataset.healRange) || 0;
    if (range > 0) {
        const sourceToken = actor.token?.object ?? actor.getActiveTokens()[0];
        if (!sourceToken || sourceToken.scene !== targetToken.scene) {
            return { warning: game.i18n.format("SFRPG.MechSheet.Heal.NoToken", { name: actor.name }) };
        }
        const distance = Math.round(canvas.grid.measurePath([sourceToken.center, targetToken.center]).distance);
        if (distance > range) {
            return {
                warning: game.i18n.format("SFRPG.MechSheet.Heal.OutOfRange", {
                    name: patient.name,
                    distance,
                    source: link.dataset.source,
                    range
                })
            };
        }
    }

    return { patient };
}

/**
 * Handle a click on a healing action's dice. Check the mech the heal goes to,
 * roll the heal, and apply it.
 *
 * The mech using the ability is read from the card's uuid, so an unlinked
 * token's own copy acts.
 *
 * @param {Event} event The click event
 * @returns {Promise<number|null>} The Hit Points healed, or null if nothing was rolled
 */
export async function onMechHealClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const link = event.currentTarget;
    const card = link.closest("[data-actor-uuid]");
    const actor = card?.dataset.actorUuid ? await fromUuid(card.dataset.actorUuid) : null;

    if (!actor || actor.type !== "mech") {
        ui.notifications.warn(game.i18n.localize("SFRPG.MechSheet.Heal.NoMech"));
        return null;
    }
    if (!actor.isOwner) {
        ui.notifications.warn(game.i18n.localize("SFRPG.MechSheet.Heal.NotOwner"));
        return null;
    }

    const { patient, warning } = healPatient(actor, link);
    if (warning) {
        ui.notifications.warn(warning);
        return null;
    }

    const left = repairCooldownRemaining(patient.getFlag("sfrpg", REPAIRED_AT_FLAG), game.time.worldTime);
    if (left > 0) {
        ui.notifications.warn(game.i18n.format("SFRPG.MechSheet.Heal.Cooldown", {
            name: patient.name,
            left: Math.ceil(left / 3600)
        }));
        return null;
    }

    return rollOnce(link, () => rollHeal(actor, patient, link.dataset.healFormula, link.dataset.source));
}

/**
 * Apply healed Hit Points to a mech and record when it was repaired.
 *
 * @param {Actor} patient The mech healed.
 * @param {number} rolled The total rolled.
 * @param {number} at The world time of the repair.
 * @returns {Promise<{value: number, gained: number}>}
 */
async function applyHeal(patient, rolled, at) {
    const result = healedHitPoints(patient.system.attributes.hp, rolled);
    await patient.update({
        "system.attributes.hp.value": result.value,
        [`flags.sfrpg.${REPAIRED_AT_FLAG}`]: at
    });
    return result;
}

/**
 * Roll a heal and apply it. A mech the user does not own is healed by the GM.
 *
 * @param {Actor} actor The mech using the ability.
 * @param {Actor} patient The mech healed.
 * @param {string} formula The formula to roll.
 * @param {string} source The action's name.
 * @returns {Promise<number>} The Hit Points healed.
 */
async function rollHeal(actor, patient, formula, source) {
    const roll = await new Roll(formula).evaluate();
    const at = game.time.worldTime;
    const hp = patient.system.attributes.hp;

    let result;
    if (patient.isOwner) {
        result = await applyHeal(patient, roll.total, at);
    } else {
        // Worked out here for the message. The GM works it out again from the
        // mech's Hit Points when the request arrives.
        result = healedHitPoints(hp, roll.total);
        RPC.sendMessageTo("gm", "mechHeal", { actorUuid: patient.uuid, rolled: roll.total, at });
    }

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: game.i18n.format("SFRPG.MechSheet.Heal.Message", {
            source,
            name: patient.name,
            amount: result.gained,
            current: result.value,
            max: hp.max
        }),
        rolls: [roll],
        sound: CONFIG.sounds.dice
    });

    return result.gained;
}

/**
 * Heal a mech for a user who does not own it.
 *
 * @param {object} message The RPC message.
 * @returns {Promise<void>}
 */
export async function onMechHealRequest(message) {
    // Every GM receives the request, and only one of them should act on it.
    if (!game.users.activeGM?.isSelf) return;
    const { actorUuid, rolled, at } = message.payload ?? {};
    const patient = await fromUuid(actorUuid ?? "");
    if (patient?.type !== "mech") return;
    await applyHeal(patient, Number(rolled) || 0, Number(at) || game.time.worldTime);
}
