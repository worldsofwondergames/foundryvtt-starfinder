import { describe, expect, it } from "vitest";
import { chatCardBlockReason } from "./chat-card-access.js";

describe("chatCardBlockReason", () => {
    const none = { isGM: false, isAuthor: false, ownsActor: false };

    it("blocks a damage roll from a user who is not the GM, the author, or an owner of the card's actor", () => {
        expect(chatCardBlockReason({ action: "damage", ...none })).toBe("NotAllowed");
    });

    it("lets an owner of the card's actor roll damage from a card someone else posted", () => {
        expect(chatCardBlockReason({ action: "damage", ...none, ownsActor: true })).toBeNull();
    });

    it("lets the GM and the card's author roll damage", () => {
        expect(chatCardBlockReason({ action: "damage", ...none, isGM: true })).toBeNull();
        expect(chatCardBlockReason({ action: "damage", ...none, isAuthor: true })).toBeNull();
    });

    it("lets anyone roll a save or skill check from a card, since they roll for their own character", () => {
        expect(chatCardBlockReason({ action: "save", ...none })).toBeNull();
        expect(chatCardBlockReason({ action: "skill", ...none })).toBeNull();
    });
});
