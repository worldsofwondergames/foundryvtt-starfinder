// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { promoteDiceLinkToHeal } from "./mech-heal-link.js";
import { createDiceLink, linkDiceExpressions } from "./dice-links.js";

/**
 * Nanite Swarm Repair's text enriched the way a chat card's is, so the link the
 * promotion has to find is the one the text editor builds.
 */
function description() {
    const root = document.createElement("div");
    root.innerHTML = "<p>The mech repairs its hull, healing an amount of Hit Points equal to 1d6 x the mech's tier.</p>";
    linkDiceExpressions(root, createDiceLink);
    return root;
}

describe("promoteDiceLinkToHeal", () => {
    test("binds the 1d6 link to the heal handler with the whole formula for this mech's tier", () => {
        const link = promoteDiceLinkToHeal(description(), "1d6", { formula: "1d6 * 3", target: "self" });

        expect(link.dataset.action).toBe("mechHeal");
        expect(link.dataset.healFormula).toBe("1d6 * 3");
    });

    test("carries who the heal goes to and how far it reaches", () => {
        const link = promoteDiceLinkToHeal(description(), "1d6", { formula: "1d6 * 3", target: "target", range: 100 });

        expect(link.dataset.healTarget).toBe("target");
        expect(link.dataset.healRange).toBe("100");
    });

    test("takes the inline roll classes off, so the 1d6 is not also rolled into chat on its own", () => {
        const link = promoteDiceLinkToHeal(description(), "1d6", { formula: "1d6 * 3", target: "self" });

        expect(link.classList.contains("inline-roll")).toBe(false);
    });
});
