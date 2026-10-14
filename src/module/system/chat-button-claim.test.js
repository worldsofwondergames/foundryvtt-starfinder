// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { SPENT_CLASS, buttonKey, claimedKeys, releasedKeys, showSpentButtons } from "./chat-button-claim.js";
import { createDiceLink, linkDiceExpressions } from "./dice-links.js";

/** A mech action card whose description holds two bare dice expressions. */
function actionCard() {
    const root = document.createElement("div");
    root.innerHTML = `<div class="sfrpg chat-card mech-action-card" data-actor-uuid="Actor.a">
        <div class="card-content"><p>Roll 1d4, then deal 2d6 damage.</p></div></div>`;
    linkDiceExpressions(root, createDiceLink);
    return root;
}

/** A System Failure card with one cockpit save per operator. */
function failureCard() {
    const root = document.createElement("div");
    root.innerHTML = `<div class="sfrpg chat-card mech-failure-card" data-actor-uuid="Actor.a">
        <a class="enriched-link" data-action="mechCockpitSave" data-index="0">Ann</a>
        <a class="enriched-link" data-action="mechCockpitSave" data-index="1">Bo</a></div>`;
    return root;
}

/** A condition card with its Roll and Smother buttons. */
function endCheckCard() {
    const root = document.createElement("div");
    root.innerHTML = `<div class="sfrpg condition-end-check-card" data-actor-uuid="Actor.a">
        <a class="enriched-link" data-action="conditionEndCheck" data-index="0">Roll</a>
        <a class="enriched-link" data-action="conditionEndCheck" data-index="1">Smother</a></div>`;
    return root;
}

describe("buttonKey", () => {
    test("tells two operators' saves on one card apart", () => {
        const [ann, bo] = failureCard().querySelectorAll("a");

        expect(buttonKey(ann)).not.toBe(buttonKey(bo));
    });

    test("gives Roll and Smother one key, since a card offers one attempt", () => {
        const [roll, smother] = endCheckCard().querySelectorAll("a");

        expect(buttonKey(roll)).toBe(buttonKey(smother));
    });

    test("tells a card's dice expressions apart by their place on it", () => {
        const [first, second] = actionCard().querySelectorAll("a.inline-roll");

        expect(buttonKey(first)).not.toBe(buttonKey(second));
    });

    test("ignores a link outside a card that is rolled once", () => {
        const root = document.createElement("div");
        root.innerHTML = `<div class="sfrpg chat-card"><p>Deal 2d6 damage.</p></div>`;
        linkDiceExpressions(root, createDiceLink);

        expect(buttonKey(root.querySelector("a.inline-roll"))).toBeNull();
    });

    test("ignores Stop bleeding, which any healer can try again", () => {
        const root = document.createElement("div");
        root.innerHTML = `<div class="sfrpg condition-end-check-card"><a data-action="stopBleeding">Stop</a></div>`;

        expect(buttonKey(root.querySelector("a"))).toBeNull();
    });
});

describe("claimedKeys", () => {
    test("adds the keys when none of them is spent", () => {
        expect(claimedKeys(["a"], ["b"])).toEqual(["a", "b"]);
    });

    test("refuses a key someone has already spent", () => {
        expect(claimedKeys(["a", "b"], ["b"])).toBeNull();
    });
});

describe("releasedKeys", () => {
    test("takes the keys back off, leaving the rest spent", () => {
        expect(releasedKeys(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
    });
});

describe("showSpentButtons", () => {
    test("strikes through only the operator whose save was rolled", () => {
        const root = failureCard();
        const [ann] = root.querySelectorAll("a");
        showSpentButtons(root, [buttonKey(ann)]);

        const [annAfter, boAfter] = root.querySelectorAll("a");
        expect(annAfter.classList.contains(SPENT_CLASS)).toBe(true);
        expect(boAfter.classList.contains(SPENT_CLASS)).toBe(false);
    });

    test("unbinds a spent button, so its click handler no longer finds it", () => {
        const root = failureCard();
        const [ann] = root.querySelectorAll("a");
        showSpentButtons(root, [buttonKey(ann)]);

        expect(root.querySelectorAll("a[data-action]").length).toBe(1);
    });

    test("leaves another kind of button on the card live", () => {
        const root = document.createElement("div");
        root.innerHTML = `<div class="sfrpg chat-card mech-failure-card">
            <a data-action="mechCockpitSave" data-index="0">Reflex</a>
            <a data-action="mechFailureRoll" data-index="0">1d20</a></div>`;
        showSpentButtons(root, [buttonKey(root.querySelector('a[data-action="mechFailureRoll"]'))]);

        expect(root.querySelector('a[data-action="mechCockpitSave"]')).not.toBeNull();
        expect(root.querySelector('a[data-action="mechFailureRoll"]')).toBeNull();
    });

    test("keeps the spent link's text, so the card still reads as a sentence", () => {
        const root = actionCard();
        showSpentButtons(root, [buttonKey(root.querySelector("a.inline-roll"))]);

        expect(root.textContent).toContain("Roll 1d4, then deal 2d6 damage.");
    });

    test("spends both of a condition card's buttons together", () => {
        const root = endCheckCard();
        showSpentButtons(root, [buttonKey(root.querySelector("a"))]);

        expect(root.querySelectorAll(`a.${SPENT_CLASS}`).length).toBe(2);
    });

    test("takes a rolled dice expression away from Foundry's inline roll handler", () => {
        const root = actionCard();
        const [first] = root.querySelectorAll("a.inline-roll");
        showSpentButtons(root, [buttonKey(first)]);

        const links = root.querySelectorAll("a");
        expect(links[0].classList.contains("inline-roll")).toBe(false);
        expect(links[0].classList.contains(SPENT_CLASS)).toBe(true);
        expect(links[1].classList.contains("inline-roll")).toBe(true);
    });
});
