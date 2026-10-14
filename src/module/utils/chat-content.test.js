import { describe, expect, it } from "vitest";
import { asChatHtml } from "./chat-content.js";

describe("asChatHtml", () => {
    it("wraps plain text in a span", () => {
        expect(asChatHtml("Test Mech regenerates 4 PP (7/9)")).toBe("<span>Test Mech regenerates 4 PP (7/9)</span>");
    });

    it("wraps text that has HTML after its first word, such as a line break", () => {
        expect(asChatHtml("Mech Combat Start<br>Test Mech PP reset to 3/9")).toBe("<span>Mech Combat Start<br>Test Mech PP reset to 3/9</span>");
    });

    it("leaves content that already starts with a tag alone", () => {
        const html = '<div class="sfrpg chat-card">Card</div>';
        expect(asChatHtml(html)).toBe(html);
        expect(asChatHtml("  <p>Indented</p>")).toBe("  <p>Indented</p>");
    });

    it("leaves empty and missing content alone", () => {
        expect(asChatHtml("")).toBe("");
        expect(asChatHtml(undefined)).toBeUndefined();
    });
});
