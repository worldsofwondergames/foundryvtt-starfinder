import { describe, expect, it, vi } from "vitest";
import { clearSystemFlag } from "./flags.js";

function fakeDocument(isToken) {
    return { isToken, setFlag: vi.fn(), unsetFlag: vi.fn() };
}

describe("clearSystemFlag", () => {
    it("writes null on an unlinked token's actor so the base actor's value does not show through", () => {
        const actor = fakeDocument(true);
        clearSystemFlag(actor, "systemFailures");
        expect(actor.setFlag).toHaveBeenCalledWith("sfrpg", "systemFailures", null);
        expect(actor.unsetFlag).not.toHaveBeenCalled();
    });

    it("unsets the flag on any other document", () => {
        const actor = fakeDocument(false);
        clearSystemFlag(actor, "systemFailures");
        expect(actor.unsetFlag).toHaveBeenCalledWith("sfrpg", "systemFailures");
        expect(actor.setFlag).not.toHaveBeenCalled();
    });
});
