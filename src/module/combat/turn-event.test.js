import { afterEach, describe, expect, test, vi } from "vitest";
import { runTurnEvent } from "./turn-event.js";

describe("runTurnEvent", () => {
    afterEach(() => vi.restoreAllMocks());

    test("finishes the work before it returns, so the next turn event starts after it", async () => {
        const order = [];
        await runTurnEvent("End of turn", async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
            order.push("end of turn");
        });
        order.push("start of next turn");

        expect(order).toEqual(["end of turn", "start of next turn"]);
    });

    test("logs a failure instead of throwing, so the turn events after it still run", async () => {
        const error = new Error("broken effect");
        const log = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(runTurnEvent("End of Boz's turn", async () => {
            throw error;
        })).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledWith(expect.stringContaining("End of Boz's turn"), error);
    });
});
