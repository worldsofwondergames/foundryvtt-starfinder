import { describe, expect, it } from "vitest";
import { appendTextToRoll } from "./roll-text.js";

describe("appendTextToRoll", () => {
    it("puts the text after the total of a roll Foundry renders with an h4 total", () => {
        const html = '<div class="dice-roll"><div class="dice-formula">2d6</div><h4 class="dice-total">8</h4></div>';
        expect(appendTextToRoll(html, "Fire")).toBe('<div class="dice-roll"><div class="dice-formula">2d6</div><h4 class="dice-total">8 Fire</h4></div>');
    });

    it("still handles an h3 total", () => {
        expect(appendTextToRoll('<h3 class="dice-total">8</h3>', "Fire")).toBe('<h3 class="dice-total">8 Fire</h3>');
    });

    it("leaves html with no total alone", () => {
        const html = '<div class="dice-roll">8</div>';
        expect(appendTextToRoll(html, "Fire")).toBe(html);
    });
});
