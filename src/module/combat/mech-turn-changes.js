import { effectiveSystems, regenerationRate } from "../rules/mech-system-effects.js";
import { isRegenDue, regeneratedPowerPoints, regeneratedShieldPoints } from "../rules/mech-turn-regen.js";
import { clearSystemFlag } from "../utils/flags.js";
import { asChatHtml } from "../utils/chat-content.js";

/**
 * Applies a change of turn to the mechs involved. The mech whose turn ended
 * regenerates its Power Points. The mech whose turn started loses the overrides
 * it bought and regenerates its Shield Points. Its System Failure card is
 * posted from the combat's start of turn, which also runs on its first turn.
 *
 * Only the active GM may call this, from the combat's update, so it runs once
 * whoever ended the turn. A player who ends their own turn changes the combat
 * from their client, which has no right to update the mechs or post for them.
 *
 * @param {object} eventData The combat event data, with its combat and combatants as documents.
 */
export async function applyMechTurnChanges(eventData) {
    const departing = eventData.oldCombatant;
    const arriving = eventData.newCombatant;

    // The departing mech regenerates before anything is cleared. When the combat
    // holds one mech, or wraps back onto the same one, the mech arriving and the
    // mech whose turn just ended are the same actor, and the override it bought at
    // the start of that turn still has to count.
    await regeneratePowerPoints(departing, eventData);

    const mech = arriving?.actor;
    if (mech?.type !== "mech" || !(eventData.direction > 0)) return;

    // A component the pilot paid to overcome stays overcome until the start of
    // the mech's next turn, so the moment that turn arrives the overrides go.
    // The same is true of an auxiliary system that failed a check on its turn.
    if (mech.getFlag("sfrpg", "systemOverrides")) {
        await clearSystemFlag(mech, "systemOverrides");
    }
    for (const system of mech.items.filter(item => item.getFlag("sfrpg", "failedThisTurn"))) {
        await clearSystemFlag(system, "failedThisTurn");
    }

    // The overrides from the mech's last turn have run out by now, so its shields
    // come back at the rate its power core's own status allows.
    await regenerateShieldPoints(arriving, eventData);
}

/**
 * The fraction of its regeneration a mech's power core allows. A damaged core
 * slows what comes back and an inoperable one stops it.
 *
 * @param {Actor} actor The mech.
 * @returns {number} 1, 0.5 or 0.
 */
function powerCoreRate(actor) {
    return regenerationRate(effectiveSystems(
        actor.system.attributes.systems,
        actor.getFlag("sfrpg", "systemOverrides") ?? {}
    ).powerCore);
}

/**
 * Restores the Power Points of the mech whose turn just ended.
 *
 * @param {Combatant|null} combatant The combatant whose turn ended.
 * @param {object} eventData The combat event data.
 */
async function regeneratePowerPoints(combatant, eventData) {
    const actor = combatant?.actor;
    if (actor?.type !== "mech") return;

    const round = eventData.oldRound ?? eventData.combat?.round;
    if (!isRegenDue({
        direction: eventData.direction,
        isNewTurn: eventData.isNewTurn,
        round,
        lastRegenRound: combatant.getFlag("sfrpg", "lastRegenRound") ?? null
    })) return;

    const pp = actor.system.attributes.pp;
    await applyRegen(combatant, {
        flag: "lastRegenRound",
        round,
        path: "system.attributes.pp.value",
        pool: pp,
        value: regeneratedPowerPoints(pp, powerCoreRate(actor)),
        message: "SFRPG.MechSheet.Actions.PPRegenMessage"
    });
}

/**
 * Restores the Shield Points of the mech whose turn just started.
 *
 * @param {Combatant} combatant The combatant whose turn started.
 * @param {object} eventData The combat event data.
 */
async function regenerateShieldPoints(combatant, eventData) {
    const actor = combatant.actor;
    const round = eventData.newRound ?? eventData.combat?.round;
    if (!isRegenDue({
        direction: eventData.direction,
        isNewTurn: eventData.isNewTurn,
        round,
        lastRegenRound: combatant.getFlag("sfrpg", "lastShieldRegenRound") ?? null
    })) return;

    const sp = actor.system.attributes.sp;
    await applyRegen(combatant, {
        flag: "lastShieldRegenRound",
        round,
        path: "system.attributes.sp.value",
        pool: sp,
        value: regeneratedShieldPoints(sp, actor.system.details.tier, powerCoreRate(actor)),
        message: "SFRPG.MechSheet.Actions.SPRegenMessage"
    });
}

/**
 * Writes one pool's regeneration, marks the round settled, and tells the mech's
 * owners and the GMs what came back.
 *
 * @param {Combatant} combatant The mech's combatant.
 * @param {object} options
 * @param {string} options.flag The combatant flag recording the last round this pool regenerated in.
 * @param {number} options.round The round the regeneration belongs to.
 * @param {string} options.path The actor data path of the pool's value.
 * @param {{value: number, max: number}} options.pool The pool before regenerating.
 * @param {number|null} options.value The new value, or null when nothing changes.
 * @param {string} options.message The localization key of the chat message.
 */
async function applyRegen(combatant, { flag, round, path, pool, value, message }) {
    const actor = combatant.actor;

    if (value !== null) {
        await actor.update({[path]: value});
    }

    // Mark the round settled whether or not anything changed. A mech that was
    // already at full has still had this turn's regeneration resolved, and the GM
    // stepping back to it must not open a second helping.
    await combatant.setFlag("sfrpg", flag, round);

    if (value === null) return;

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: asChatHtml(game.i18n.format(message, {
            name: actor.name,
            amount: value - pool.value,
            current: value,
            max: pool.max
        })),
        whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id)
    });
}
