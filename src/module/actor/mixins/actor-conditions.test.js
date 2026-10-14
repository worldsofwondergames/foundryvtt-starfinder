import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActorConditionsMixin } from "./actor-conditions.js";

/** A document write that resolves on a later tick, as Foundry's database calls do. */
const later = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * An actor holding the given conditions, with the document methods setCondition
 * uses. Deleting an item also drops its timed effect, as
 * ActorSFRPG._onDeleteDescendantDocuments does.
 */
function actorWith(conditions, timedEffects) {
    const Actor = ActorConditionsMixin(class {});
    const actor = new Actor();
    actor.name = "Helios";
    actor.items = conditions.map(slug => ({ id: slug, uuid: `Item.${slug}`, name: slug, system: { slug }, getFlag: () => null }));
    actor.update = later;
    actor.getActiveTokens = () => [];
    actor.deleteEmbeddedDocuments = async (type, ids) => {
        await later();
        for (const id of ids) {
            const index = actor.items.findIndex(item => item.id === id);
            if (index === -1) throw new Error(`Item ${id} does not exist`);
            timedEffects.delete(actor.items[index].uuid);
            actor.items.splice(index, 1);
        }
    };
    return actor;
}

describe("setCondition", () => {
    let timedEffects;

    beforeEach(() => {
        timedEffects = new Map();
        vi.stubGlobal("CONFIG", {
            SFRPG: {
                statusEffects: [{ id: "stunned" }, { id: "flat-footed" }, { id: "shaken" }],
                conditionsCausingFlatFooted: ["stunned"]
            }
        });
        vi.stubGlobal("game", { sfrpg: { timedEffects } });
        vi.stubGlobal("Hooks", { callAll: () => {} });
        vi.stubGlobal("ui", { notifications: { warn: () => {} } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("has removed the flat-footed it caused by the time removing stunned resolves", async () => {
        const actor = actorWith(["stunned", "flat-footed"], timedEffects);
        for (const item of actor.items) timedEffects.set(item.uuid, { delete: () => {} });

        await actor.setCondition("stunned", false);

        expect(actor.getCondition("flat-footed")).toBeNull();
    });

    it("removes flat-footed by hand right after stunned without an error", async () => {
        const actor = actorWith(["stunned", "flat-footed"], timedEffects);
        for (const item of actor.items) timedEffects.set(item.uuid, { delete: () => {} });

        await actor.setCondition("stunned", false);
        await expect(actor.setCondition("flat-footed", false)).resolves.toBe(false);
    });

    it("removes a condition that has no timed effect", async () => {
        const actor = actorWith(["shaken"], timedEffects);

        await expect(actor.setCondition("shaken", false)).resolves.toBe(false);
        expect(actor.getCondition("shaken")).toBeNull();
    });
});
