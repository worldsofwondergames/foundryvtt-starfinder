import { describe, expect, it } from "vitest";
import { postsPhaseCard } from "./combat-cards.js";

const onePhase = [{ name: "Combat" }];
const threePhases = [{ name: "Pilot Actions" }, { name: "Chase Progress" }, { name: "Combat" }];

describe("postsPhaseCard", () => {
    it("posts a phase card when the combat has several phases and the setting shows phases", () => {
        expect(postsPhaseCard(threePhases, "enabled")).toBe(true);
        expect(postsPhaseCard(threePhases, "roundsPhases")).toBe(true);
    });

    it("posts no phase card when the setting leaves phases out", () => {
        for (const setting of ["roundsTurns", "roundsOnly", "disabled"]) {
            expect(postsPhaseCard(threePhases, setting)).toBe(false);
        }
    });

    it("posts no phase card for a combat with a single phase, such as normal combat", () => {
        expect(postsPhaseCard(onePhase, "enabled")).toBe(false);
        expect(postsPhaseCard(onePhase, "roundsPhases")).toBe(false);
    });
});
