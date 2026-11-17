import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./chat/chatbox.js", () => ({ default: {} }));
vi.mock("./config.js", () => ({ SFRPG: {} }));
vi.mock("./rolls/rolltree.js", () => ({ default: { buildRoll: vi.fn(async () => ({ button: "cancel" })) } }));
vi.mock("./rules/closures/stack-modifiers.js", () => ({ default: class {} }));
vi.mock("./rules/ongoing-damage.js", () => ({ ongoingFromCritical: vi.fn() }));
vi.mock("./rolls/roll.js", () => ({ default: class {} }));
vi.mock("./utils/roll-text.js", () => ({ appendTextToRoll: vi.fn() }));

const { default: RollTree } = await import("./rolls/rolltree.js");
const { DiceSFRPG } = await import("./dice.js");

const rollContext = { isValid: () => true, hasMultipleSelectors: () => false };

beforeEach(() => {
    globalThis.game = { settings: { get: () => false }, i18n: { format: key => key } };
});

afterEach(() => {
    delete globalThis.game;
    vi.clearAllMocks();
});

describe("DiceSFRPG.d20Roll", () => {
    it("gives the roll dialog the main die, so a check rolled twice shows 2d20kh", async () => {
        await DiceSFRPG.d20Roll({ parts: ["@skills.pil.mod"], rollContext, title: "Check", mainDie: "2d20kh" });
        expect(RollTree.buildRoll.mock.calls[0][2].mainDie).toBe("2d20kh");
    });
    it("shows 1d20 when no main die is given", async () => {
        await DiceSFRPG.d20Roll({ parts: ["@skills.pil.mod"], rollContext, title: "Check" });
        expect(RollTree.buildRoll.mock.calls[0][2].mainDie).toBe("1d20");
    });
});
