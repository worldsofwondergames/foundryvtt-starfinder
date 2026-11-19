import { SPHERE_COST, afterPaying, isEmergencySphere, sphereTriggered, upkeepCost } from "../rules/mech-upkeep.js";
import { auxiliarySystemUsable } from "./mech-failure-link.js";
import { asChatHtml } from "../utils/chat-content.js";
import { clearSystemFlag } from "../utils/flags.js";

/**
 * Post a card about a mech's auxiliary system to everyone at the table.
 *
 * @param {Actor} actor The mech.
 * @param {string} key The localization key under SFRPG.MechSheet.Upkeep.
 * @param {object} data The values for the message.
 */
async function postUpkeepCard(actor, key, data) {
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: asChatHtml(game.i18n.format(`SFRPG.MechSheet.Upkeep.${key}`, { name: actor.name, ...data }))
    });
}

/**
 * The mech's systems that are on and cost PP each turn.
 *
 * @param {Actor} actor The mech.
 * @returns {Array<Item>}
 */
export function activeUpkeepSystems(actor) {
    return actor.items.filter(item => upkeepCost(item) !== null && item.getFlag("sfrpg", "upkeepActive"));
}

/**
 * Switch on a system that costs PP each turn, such as the Holodouble Projector
 * once its double is projected.
 *
 * @param {Item} item The system.
 */
export async function startUpkeep(item) {
    if (upkeepCost(item) === null) return;
    await item.setFlag("sfrpg", "upkeepActive", true);
}

/**
 * Switch off a system that costs PP each turn.
 *
 * @param {Item} item The system.
 */
export async function endUpkeep(item) {
    await clearSystemFlag(item, "upkeepActive");
}

/**
 * Pay the start-of-turn cost of each system that is on. A system the mech
 * can't pay for, or one that has stopped working, turns off, and everyone is
 * told.
 *
 * @param {Actor} actor The mech whose turn started.
 */
export async function payUpkeep(actor) {
    for (const item of activeUpkeepSystems(actor)) {
        const cost = upkeepCost(item);
        const left = auxiliarySystemUsable(item) ? afterPaying(actor.system.attributes.pp.value, cost) : null;
        if (left === null) {
            await endUpkeep(item);
            await postUpkeepCard(actor, "Disabled", { system: item.name });
            continue;
        }
        await actor.update({ "system.attributes.pp.value": left });
        await postUpkeepCard(actor, "Paid", { system: item.name, amount: cost, current: left, max: actor.system.attributes.pp.max });
    }
}

/**
 * Form a mech's Emergency Defense Sphere when damage takes it to ¼ of its Hit
 * Points or fewer. The sphere forms once until the mech's system damage is
 * reset, and only when the mech has the PP to pay for it.
 *
 * @param {Actor} actor The mech.
 * @param {object} hp
 * @param {number} hp.value The Hit Points after the change.
 * @param {number} hp.previousValue The Hit Points before it.
 */
export async function checkEmergencySphere(actor, { value, previousValue }) {
    const sphere = actor.items.find(isEmergencySphere);
    if (!sphere || !auxiliarySystemUsable(sphere)) return;
    if (actor.getFlag("sfrpg", "emergencySphereUsed")) return;
    if (!sphereTriggered({ value, previousValue, max: actor.system.attributes.hp.max })) return;

    const left = afterPaying(actor.system.attributes.pp.value, SPHERE_COST);
    if (left === null) {
        await postUpkeepCard(actor, "SphereFailed", { system: sphere.name, amount: SPHERE_COST });
        return;
    }
    await actor.update({ "system.attributes.pp.value": left, "flags.sfrpg.emergencySphereUsed": true });
    await postUpkeepCard(actor, "SphereFormed", { system: sphere.name, amount: SPHERE_COST });
}
