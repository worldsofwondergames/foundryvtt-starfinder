import { describe, expect, test } from "vitest";
import { MECH_SPEED_TYPES, addSpeedTooltips, applySpeedModifiers, parseSpeedString } from "./mech-speed.js";

const empty = () => Object.fromEntries(MECH_SPEED_TYPES.map(type => [type, ""]));

describe("parseSpeedString", () => {
    test("reads a climb speed beside a land speed", () => {
        const speed = empty();
        parseSpeedString("40 ft., climb 60 ft.", speed);
        expect(speed).toEqual({ land: "40 ft.", fly: "", swim: "", burrow: "", climb: "60 ft." });
    });

    test("clears speeds an earlier frame set", () => {
        const speed = { ...empty(), climb: "80 ft.", swim: "60 ft." };
        parseSpeedString("30 ft., burrow 20 ft.", speed);
        expect(speed).toEqual({ land: "30 ft.", fly: "", swim: "", burrow: "20 ft.", climb: "" });
    });
});

describe("applySpeedModifiers", () => {
    test("adds a climb modifier to an existing climb speed", () => {
        const speed = { ...empty(), land: "40 ft.", climb: "60 ft." };
        applySpeedModifiers("climb +20 ft.", speed);
        expect(speed.climb).toBe("80 ft.");
        expect(speed.land).toBe("40 ft.");
    });

    test("a modifier with no type changes only a land speed the mech has", () => {
        const speed = { ...empty(), land: "40 ft.", climb: "60 ft." };
        applySpeedModifiers("+10 ft.", speed);
        expect(speed).toMatchObject({ land: "50 ft.", climb: "60 ft." });

        const flier = { ...empty(), fly: "60 ft." };
        applySpeedModifiers("+10 ft.", flier);
        expect(flier.land).toBe("");
    });

    test("sets a new speed type only when the mech lacks it", () => {
        const speed = { ...empty(), land: "40 ft." };
        applySpeedModifiers("burrow 40 ft.", speed);
        expect(speed.burrow).toBe("40 ft.");

        applySpeedModifiers("burrow 10 ft.", speed);
        expect(speed.burrow).toBe("40 ft.");
    });
});

describe("addSpeedTooltips", () => {
    test("files each part under its speed type", () => {
        const tips = Object.fromEntries(MECH_SPEED_TYPES.map(type => [type, []]));
        addSpeedTooltips("40 ft., climb 60 ft.", tips, "Skittermech");
        expect(tips.land).toEqual(["Skittermech: 40 ft."]);
        expect(tips.climb).toEqual(["Skittermech: 60 ft."]);
    });
});
