import { afterEach, describe, expect, test, vi } from "vitest";
import { RPC } from "./rpc.js";

function world({ otherGM }) {
    const self = { id: "second", isGM: true, active: true, isSelf: true };
    const users = [self];
    if (otherGM) users.push({ id: "first", isGM: true, active: true, isSelf: false });
    globalThis.game = {
        user: self,
        users: Object.assign(users, { contents: users }),
        socket: { emit: vi.fn(), on: vi.fn() }
    };
    RPC.rpc = new RPC();
    RPC.initialize();
    return game.socket.emit;
}

afterEach(() => {
    delete globalThis.game;
});

describe("RPC.sendMessageTo the GM, from a GM", () => {
    test("reaches the other GMs, so a request only the active GM answers is answered", () => {
        const emit = world({ otherGM: true });

        RPC.sendMessageTo("gm", "claimChatButton", { requestId: "r" });

        expect(emit).toHaveBeenCalledWith("system.sfrpg", expect.objectContaining({ recipient: "gm", eventName: "claimChatButton" }));
    });

    test("is still handled by the GM who sent it", () => {
        world({ otherGM: true });
        const handler = vi.fn();
        RPC.registerCallback("claimChatButton", "gm", handler);

        RPC.sendMessageTo("gm", "claimChatButton", { requestId: "r" });

        expect(handler).toHaveBeenCalledTimes(1);
    });

    test("runs every callback registered for the event", () => {
        world({ otherGM: false });
        const first = vi.fn();
        const second = vi.fn();
        RPC.registerCallback("claimChatButton", "gm", first);
        RPC.registerCallback("claimChatButton", "gm", second);

        RPC.sendMessageTo("gm", "claimChatButton", { requestId: "r" });

        expect([first.mock.calls.length, second.mock.calls.length]).toEqual([1, 1]);
    });

    test("sends nothing when the sender is the only GM", () => {
        const emit = world({ otherGM: false });

        RPC.sendMessageTo("gm", "claimChatButton", { requestId: "r" });

        expect(emit).not.toHaveBeenCalled();
    });
});
