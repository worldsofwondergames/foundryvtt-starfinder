import { auxiliaryFailureChance, effectiveSystems, regenerationRate } from "../rules/mech-system-effects.js";
import { mechTurnRegen, shouldRegenOnTurnEnd } from "../rules/mech-turn-regen.js";
import { postAuxiliaryCheck } from "../system/mech-failure-link.js";
import { clearSystemFlag } from "../utils/flags.js";

/**
 * Applies a change of turn to the mechs involved. The mech whose turn ended
 * regenerates. The mech whose turn started loses the overrides it bought and
 * rolls the checks its constant auxiliary systems owe.
 *
 * A mech regenerates at the end of its turn, so this reads the combatant the
 * combat just moved away from rather than the one it moved to.
 *
 * Only the active GM may call this, from the combat's update, so it runs once
 * whoever ended the turn. A player who ends their own turn changes the combat
 * from their client, which has no right to update the mechs or post for them.
 *
 * @param {object} eventData The combat event data, with its combat and combatants as documents.
 */
export async function applyMechTurnChanges(eventData) {
    // The departing mech's power core rate is read before anything is cleared:
    // when the combat holds one mech, or wraps back onto the same one, the mech
    // arriving and the mech whose turn just ended are the same actor, and the
    // override it bought at the start of that turn still has to count.
    const departing = eventData.oldCombatant?.actor;
    const departingRate = departing?.type === "mech"
        ? regenerationRate(effectiveSystems(
            departing.system.attributes.systems,
            departing.getFlag("sfrpg", "systemOverrides") ?? {}
        ).powerCore)
        : 1;

    // A component the pilot paid to overcome stays overcome until the start of
    // the mech's next turn, so the moment that turn arrives the overrides go.
    // The same is true of an auxiliary system that failed a check on its turn.
    const arriving = eventData.newCombatant?.actor;
    if (arriving?.type === "mech" && eventData.direction > 0) {
        if (arriving.getFlag("sfrpg", "systemOverrides")) {
            await clearSystemFlag(arriving, "systemOverrides");
        }
        for (const system of arriving.items.filter(item => item.getFlag("sfrpg", "failedThisTurn"))) {
            await clearSystemFlag(system, "failedThisTurn");
        }
    }

    // A system that has to be activated is checked when it is used. One giving a
    // constant benefit is never activated, so its check is owed at the start of
    // each of the mech's turns instead.
    if (arriving?.type === "mech" && eventData.direction > 0) {
        const statuses = effectiveSystems(
            arriving.system.attributes.systems,
            arriving.getFlag("sfrpg", "systemOverrides") ?? {}
        );
        if (auxiliaryFailureChance(statuses.auxSystem) > 0) {
            for (const system of arriving.items.filter(item => item.type === "mechAuxiliary"
                && !item.system.canBeActivated)) {
                await postAuxiliaryCheck(arriving, system, statuses.auxSystem);
            }
        }
    }

    const combatant = eventData.oldCombatant;
    if (!combatant) return;

    const endedRound = eventData.oldRound ?? eventData.combat?.round;
    const due = shouldRegenOnTurnEnd({
        direction: eventData.direction,
        isNewTurn: eventData.isNewTurn,
        round: endedRound,
        lastRegenRound: combatant.getFlag("sfrpg", "lastRegenRound") ?? null
    });
    if (!due) return;

    const actor = combatant.actor;
    if (!actor || actor.type !== "mech") return;

    const whisperTargets = game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id);
    const messages = [];

    const pp = actor.system.attributes.pp;
    const sp = actor.system.attributes.sp;

    // A damaged power core slows what comes back and an inoperable one stops it.
    // Worked out at the top of this handler, before any override was cleared.
    const rate = departingRate;

    const regenerated = mechTurnRegen({
        pp,
        sp,
        tier: actor.system.details.tier
    });

    if (rate <= 0) {
        regenerated.pp = null;
        regenerated.sp = null;
    } else if (rate < 1) {
        regenerated.pp = regenerated.pp === null ? null : pp.value + Math.floor((regenerated.pp - pp.value) * rate);
        regenerated.sp = regenerated.sp === null ? null : sp.value + Math.floor((regenerated.sp - sp.value) * rate);
        if (regenerated.pp === pp.value) regenerated.pp = null;
        if (regenerated.sp === sp.value) regenerated.sp = null;
    }

    if (regenerated.pp !== null) {
        await actor.update({"system.attributes.pp.value": regenerated.pp});
        messages.push(game.i18n.format("SFRPG.MechSheet.Actions.PPRegenMessage", {
            name: actor.name,
            amount: regenerated.pp - pp.value,
            current: regenerated.pp,
            max: pp.max
        }));
    }

    if (regenerated.sp !== null) {
        await actor.update({"system.attributes.sp.value": regenerated.sp});
        messages.push(game.i18n.format("SFRPG.MechSheet.Actions.SPRegenMessage", {
            name: actor.name,
            amount: regenerated.sp - sp.value,
            current: regenerated.sp,
            max: sp.max
        }));
    }

    // Mark the round settled whether or not anything changed. A mech that was
    // already at full has still had this turn's regeneration resolved, and the GM
    // stepping back to it must not open a second helping.
    await combatant.setFlag("sfrpg", "lastRegenRound", endedRound);

    if (messages.length > 0) {
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: actor}),
            content: messages.join("<br>"),
            whisper: whisperTargets
        });
    }
}
