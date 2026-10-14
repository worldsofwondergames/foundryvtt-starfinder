import { describe, expect, test } from "vitest";
import { failureIcons, turnStartFailures } from "./mech-turn-failures.js";

const nominal = Object.fromEntries(["upperLimbs", "lowerLimbs", "frame", "auxSystem", "powerCore", "cockpit"]
    .map(component => [component, { value: "nominal" }]));
const systems = changes => ({ ...nominal, ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, { value: v }])) });

const ammoReserve = { id: "ammo", name: "Ammo Reserve", constant: true, disabled: false };
const entryHatch = { id: "hatch", name: "Entry Hatch", constant: true, disabled: false };
const naniteSwarm = { id: "nanite", name: "Nanite Swarm Repair", constant: false, disabled: false };

describe("turnStartFailures", () => {
    test("posts nothing for a mech with every component Nominal", () => {
        expect(turnStartFailures(nominal, [ammoReserve, naniteSwarm])).toBeNull();
    });

    test("lists each failing component with its status, in the order the sheet shows them", () => {
        expect(turnStartFailures(systems({ cockpit: "malfunctioning", upperLimbs: "inoperable" }), []).components)
            .toEqual([{ component: "upperLimbs", status: "inoperable" }, { component: "cockpit", status: "malfunctioning" }]);
    });

    test("owes a check for each constant auxiliary system, at the component's chance", () => {
        const failures = turnStartFailures(systems({ auxSystem: "malfunctioning" }), [ammoReserve, naniteSwarm, entryHatch]);
        expect(failures.checks).toEqual([
            { id: "ammo", name: "Ammo Reserve", chance: 25 },
            { id: "hatch", name: "Entry Hatch", chance: 25 }
        ]);
    });

    test("raises the chance to 50% for an inoperable auxiliary component", () => {
        expect(turnStartFailures(systems({ auxSystem: "inoperable" }), [ammoReserve]).checks[0].chance).toBe(50);
    });

    test("owes no checks while the auxiliary component works", () => {
        expect(turnStartFailures(systems({ frame: "malfunctioning" }), [ammoReserve]).checks).toEqual([]);
    });

    test("lists a stopped system instead of checking it", () => {
        const stoppedHatch = { ...entryHatch, disabled: true };
        const failures = turnStartFailures(systems({ auxSystem: "inoperable" }), [ammoReserve, stoppedHatch]);
        expect(failures.checks.map(check => check.id)).toEqual(["ammo"]);
        expect(failures.stopped).toEqual(["Entry Hatch"]);
    });

    test("still lists a stopped system when nothing else is failing", () => {
        expect(turnStartFailures(nominal, [{ ...entryHatch, disabled: true }])).toEqual({ components: [], checks: [], stopped: ["Entry Hatch"] });
    });
});

describe("failureIcons", () => {
    test("shows nothing on the token of a mech with every component Nominal", () => {
        expect(failureIcons(nominal)).toEqual([]);
    });

    test("shows one icon for each failing component, each its own", () => {
        const icons = failureIcons(systems({ frame: "malfunctioning", powerCore: "inoperable" }));

        expect(icons.map(icon => icon.component)).toEqual(["frame", "powerCore"]);
        expect(icons[0].img).not.toBe(icons[1].img);
    });

    test("changes the icon's tint when a component goes from malfunctioning to inoperable", () => {
        const [malfunctioning] = failureIcons(systems({ cockpit: "malfunctioning" }));
        const [inoperable] = failureIcons(systems({ cockpit: "inoperable" }));

        expect(malfunctioning.img).toBe(inoperable.img);
        expect(malfunctioning.tint).not.toBe(inoperable.tint);
    });
});
