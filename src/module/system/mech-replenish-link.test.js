// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { promoteDiceLinkToReplenish, replenishRecipients } from "./mech-replenish-link.js";
import { createDiceLink, linkDiceExpressions } from "./dice-links.js";

/**
 * Replenish's description enriched the way a chat card's is, so the link the
 * promotion has to find is the one the text editor actually builds.
 */
function description(text) {
    const root = document.createElement("div");
    root.innerHTML = `<p>${text}</p>`;
    linkDiceExpressions(root, createDiceLink);
    return root;
}

describe("promoteDiceLinkToReplenish", () => {
    test("binds the link to the replenish handler", () => {
        const root = description("Activate when regaining Shield Points. You gain 2d8 SP.");

        expect(promoteDiceLinkToReplenish(root, "2d8").dataset.action).toBe("mechReplenish");
    });

    test("leaves the formula on the link for the click to roll", () => {
        const root = description("Activate when regaining Shield Points. You gain 3d8 SP.");

        expect(promoteDiceLinkToReplenish(root, "3d8").dataset.formula).toBe("3d8");
    });

    test("takes the inline roll classes off, so the dice are not also rolled into chat", () => {
        const root = description("Activate when regaining Shield Points. You gain 2d8 SP.");

        const link = promoteDiceLinkToReplenish(root, "2d8");

        expect(link.classList.contains("enriched-link")).toBe(true);
        expect(link.classList.contains("inline-roll")).toBe(false);
        expect(link.classList.contains("roll")).toBe(false);
    });

    test("drops the plain roll tooltip in favor of one saying what clicking does", () => {
        const root = description("Activate when regaining Shield Points. You gain 2d8 SP.");

        const link = promoteDiceLinkToReplenish(root, "2d8", { tooltip: "Restore shields" });

        expect(link.dataset.tooltip).toBe("Restore shields");
        expect(link.dataset.tooltipText).toBeUndefined();
    });

    test("returns null when the description holds no such expression", () => {
        const root = description("Activate when regaining Shield Points. You gain 2d8 SP.");

        expect(promoteDiceLinkToReplenish(root, "1d8")).toBeNull();
    });
});

describe("replenishRecipients", () => {
    /** A world's users, and a mech only some of them own. */
    function world(owners) {
        const users = [
            { id: "gm", isGM: true },
            { id: "pilot", isGM: false },
            { id: "bystander", isGM: false }
        ];
        const actor = { testUserPermission: (user) => owners.includes(user.id) };
        return { users, actor };
    }

    test("tells the GM, who runs the fight the shields were lost in", () => {
        const { users, actor } = world([]);

        expect(replenishRecipients(users, actor)).toContain("gm");
    });

    test("tells the mech's owner", () => {
        const { users, actor } = world(["pilot"]);

        expect(replenishRecipients(users, actor)).toContain("pilot");
    });

    test("leaves out a player with no claim on the mech", () => {
        const { users, actor } = world(["pilot"]);

        expect(replenishRecipients(users, actor)).not.toContain("bystander");
    });

    test("names each recipient once, so the whisper list holds no duplicates", () => {
        const { users, actor } = world(["gm", "pilot"]);
        const recipients = replenishRecipients(users, actor);

        expect(recipients).toEqual([...new Set(recipients)]);
    });
});
