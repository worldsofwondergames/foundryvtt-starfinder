import { describe, expect, it } from "vitest";
import { enabledAtWorldTime } from "./effect-timing.js";

const durationFrom = { turn: 0, round: 6, minute: 60, hour: 3600, day: 86400 };

describe("enabledAtWorldTime", () => {
    it("leaves a permanent effect alone, whose end time is NaN", () => {
        expect(enabledAtWorldTime({ unit: "permanent", activationTime: 402, activationEnd: NaN }, 408, durationFrom)).toBeNull();
    });

    it("keeps a round effect on before it ends", () => {
        expect(enabledAtWorldTime({ unit: "round", activationTime: 100, activationEnd: 112 }, 106, durationFrom)).toBe(true);
    });

    it("turns a round effect off once it has ended", () => {
        expect(enabledAtWorldTime({ unit: "round", activationTime: 100, activationEnd: 112 }, 118, durationFrom)).toBe(false);
    });

    it("keeps an effect off before it starts", () => {
        expect(enabledAtWorldTime({ unit: "minute", activationTime: 200, activationEnd: 260 }, 150, durationFrom)).toBe(false);
    });

    it("treats a missing end as never ending", () => {
        expect(enabledAtWorldTime({ unit: "hour", activationTime: 0, activationEnd: null }, 99999, durationFrom)).toBe(true);
    });
});
