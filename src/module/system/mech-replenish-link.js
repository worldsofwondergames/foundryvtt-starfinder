import { replenishedShieldPoints } from "../rules/mech-replenish.js";
import { promoteDiceLink } from "./mech-dice-link.js";
import { rollOnce } from "./chat-button-claim.js";

/**
 * Turn the dice in Replenish's description into the control that rolls them.
 *
 * @param {Element} root The enriched description.
 * @param {string} formula The dice this mech's tier grants, e.g. "2d8".
 * @param {Object} [data] Values to carry on the link.
 * @param {string} [data.source] Name of the action, for the chat card.
 * @param {string} [data.tooltip] Hover text explaining what clicking does.
 * @returns {HTMLAnchorElement|null} The promoted link, or null if the description held no such dice link.
 */
export function promoteDiceLinkToReplenish(root, formula, { source = "", tooltip = "" } = {}) {
    return promoteDiceLink(root, formula, {
        action: "mechReplenish",
        data: { source },
        tooltip
    });
}

/**
 * Who sees the result of a Replenish roll.
 *
 * The Shield Points a mech got back are its own crew's business and the GM's, so
 * the message goes to the mech's owners and every GM and to nobody else.
 *
 * @param {Iterable<{id: string, isGM: boolean}>} users The users in the world.
 * @param {{testUserPermission: Function}} actor The mech that rolled.
 * @returns {string[]} The ids to whisper to.
 */
export function replenishRecipients(users, actor) {
    return [...users]
        .filter(user => user.isGM || actor.testUserPermission(user, "OWNER"))
        .map(user => user.id);
}

/**
 * Handle a click on Replenish's dice, rolling them and restoring the Shield Points.
 *
 * The mech is read from the card's uuid rather than its id, so an unlinked token's
 * own copy of a mech replenishes its own shields instead of the base actor's.
 *
 * @param {Event} event The click event
 * @returns {Promise<number|null>} The Shield Points gained, or null if nothing was rolled
 */
export async function onMechReplenishClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const link = event.currentTarget;
    const card = link.closest("[data-actor-uuid]");
    const actor = card?.dataset.actorUuid ? await fromUuid(card.dataset.actorUuid) : null;

    if (!actor || actor.type !== "mech") {
        ui.notifications.warn(game.i18n.localize("SFRPG.MechSheet.Replenish.NoMech"));
        return null;
    }

    // The card is whispered to the mech's owners and the GM, and the roll is theirs
    // to make. Anyone else reaching the link is not entitled to the Shield Points.
    if (!actor.isOwner) {
        ui.notifications.warn(game.i18n.localize("SFRPG.MechSheet.Replenish.NotOwner"));
        return null;
    }

    return rollOnce(link, () => rollReplenish(actor, link.dataset.formula));
}

/**
 * Roll Replenish's dice and restore the Shield Points they give.
 *
 * @param {Actor} actor The mech.
 * @param {string} formula The dice to roll.
 * @returns {Promise<number>} The Shield Points gained.
 */
async function rollReplenish(actor, formula) {
    const roll = await new Roll(formula).evaluate();
    const sp = actor.system.attributes.sp;
    const { value, gained } = replenishedShieldPoints(sp, roll.total);

    if (gained > 0) {
        await actor.update({ "system.attributes.sp.value": value });

        // Built here rather than through Roll#toMessage, which applies the current
        // roll mode and, on the default public setting, empties the whisper list.
        // The result is the mech's business and the GM's, as the end-of-turn
        // regeneration message is.
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: game.i18n.format("SFRPG.MechSheet.Actions.SPRegenMessage", {
                name: actor.name,
                amount: gained,
                current: value,
                max: sp.max
            }),
            rolls: [roll],
            sound: CONFIG.sounds.dice,
            whisper: replenishRecipients(game.users, actor)
        });
    }

    return gained;
}
