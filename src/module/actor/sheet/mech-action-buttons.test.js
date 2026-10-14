import { describe, expect, test } from "vitest";
import { gearActionButtons } from "./mech-action-buttons.js";

const labels = { full: "Full", standard: "Standard", move: "Move", swift: "Swift", reaction: "Reaction" };

describe("gearActionButtons", () => {
    test("shows the action type beside the PP cost for an action that takes time and Power Points", () => {
        expect(gearActionButtons({ actionType: "standard", ppCost: 4 }, labels, "Constant"))
            .toEqual({ actionTypeLabel: "Standard", ppLabel: "4 PP" });
    });

    test("shows only the action type for an action that costs no Power Points, such as Fade", () => {
        expect(gearActionButtons({ actionType: "full", ppCost: 0 }, labels, "Constant"))
            .toEqual({ actionTypeLabel: "Full", ppLabel: null });
    });

    test("shows only the PP cost for an action with no action type", () => {
        expect(gearActionButtons({ actionType: "", ppCost: 2 }, labels, "Constant"))
            .toEqual({ actionTypeLabel: null, ppLabel: "2 PP" });
    });

    test("shows Constant for an action with neither", () => {
        expect(gearActionButtons({ actionType: null, ppCost: null }, labels, "Constant"))
            .toEqual({ actionTypeLabel: "Constant", ppLabel: null });
    });

    test("leaves out an action type it has no label for", () => {
        expect(gearActionButtons({ actionType: "bonus", ppCost: 1 }, labels, "Constant"))
            .toEqual({ actionTypeLabel: null, ppLabel: "1 PP" });
    });
});
