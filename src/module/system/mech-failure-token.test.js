// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { changesFailureIcons, failureTooltip } from "./mech-failure-token.js";

function hasProperty(object, path) {
    return path.split(".").reduce((value, key) => (value && key in value ? value[key] : undefined), object) !== undefined;
}

beforeEach(() => {
    globalThis.foundry = { utils: { hasProperty } };
    globalThis.game = { i18n: { localize: key => key, format: (key, data) => `${data.component}: ${data.status}.` } };
    globalThis.CONFIG = { SFRPG: { mechSystemStatus: { malfunctioning: "Malfunctioning", inoperable: "Inoperable" } } };
});

afterEach(() => {
    delete globalThis.foundry;
    delete globalThis.game;
    delete globalThis.CONFIG;
});

const mech = systems => ({ type: "mech", system: { attributes: { systems } } });

describe("changesFailureIcons", () => {
    test("redraws a mech's icons when a component's status changes, including a Reset", () => {
        expect(changesFailureIcons({ type: "mech" }, { system: { attributes: { systems: { frame: { value: "nominal" } } } } })).toBe(true);
    });

    test("leaves the icons alone for other changes to the mech", () => {
        expect(changesFailureIcons({ type: "mech" }, { system: { attributes: { hp: { value: 3 } } } })).toBe(false);
    });

    test("leaves other actors alone", () => {
        expect(changesFailureIcons({ type: "npc2" }, { system: { attributes: { systems: {} } } })).toBe(false);
    });
});

describe("failureTooltip", () => {
    test("lists each failing component on the token's tooltip", () => {
        const html = failureTooltip(mech({ frame: { value: "malfunctioning" }, cockpit: { value: "inoperable" } }));
        const list = Object.assign(document.createElement("div"), { innerHTML: html });

        expect(list.querySelectorAll("li")).toHaveLength(2);
    });

    test("shows no tooltip for a mech with nothing failing", () => {
        expect(failureTooltip(mech({ frame: { value: "nominal" } }))).toBeNull();
    });
});
