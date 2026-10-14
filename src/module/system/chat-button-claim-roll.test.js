// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../rpc.js", () => ({ RPC: { sendMessageTo: vi.fn() } }));

const { RPC } = await import("../rpc.js");
const { onChatButtonAnswer, rollOnce } = await import("./chat-button-claim.js");

/** A check on a System Failure card, for a user who is not the active GM. */
function clickedCheck() {
    const root = document.createElement("div");
    root.innerHTML = `<li data-message-id="m1"><div class="sfrpg chat-card mech-failure-card" data-actor-uuid="Actor.a">
        <a class="enriched-link" data-action="mechChanceCheck" data-index="0">Ammo Reserve</a></div></li>`;
    return root.querySelector("a");
}

beforeEach(() => {
    vi.useFakeTimers();
    globalThis.foundry = { utils: { randomID: () => "request" } };
    globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
    globalThis.game = {
        i18n: { localize: key => key },
        messages: { get: id => (id === "m1" ? { id } : undefined) },
        users: { activeGM: { isSelf: false } }
    };
});

afterEach(() => {
    vi.useRealTimers();
    RPC.sendMessageTo.mockReset();
    delete globalThis.foundry;
    delete globalThis.ui;
    delete globalThis.game;
});

describe("rollOnce, through the active GM", () => {
    test("rolls nothing and says the GM didn't answer, not that it was rolled, when no answer comes", async () => {
        const work = vi.fn();
        const result = rollOnce(clickedCheck(), work);
        await vi.advanceTimersByTimeAsync(10000);

        expect(await result).toBeNull();
        expect(work).not.toHaveBeenCalled();
        expect(ui.notifications.warn).toHaveBeenCalledWith("SFRPG.ChatButton.NoAnswer");
        expect(ui.notifications.info).not.toHaveBeenCalledWith("SFRPG.ChatButton.AlreadyRolled");
    });

    test("says it was already rolled when the GM turns the claim down", async () => {
        const work = vi.fn();
        const result = rollOnce(clickedCheck(), work);
        onChatButtonAnswer({ payload: { requestId: "request", granted: false } });

        expect(await result).toBeNull();
        expect(work).not.toHaveBeenCalled();
        expect(ui.notifications.info).toHaveBeenCalledWith("SFRPG.ChatButton.AlreadyRolled");
    });

    test("rolls once the GM grants the claim", async () => {
        const work = vi.fn(async () => "rolled");
        const result = rollOnce(clickedCheck(), work);
        onChatButtonAnswer({ payload: { requestId: "request", granted: true } });

        expect(await result).toBe("rolled");
    });
});
