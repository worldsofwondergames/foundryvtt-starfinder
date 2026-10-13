import { describe, expect, it } from "vitest";
import { isInsideContainer } from "./item-containment.js";

function item(id, contents = []) {
    return { id, system: { container: { contents: contents.map(c => ({ id: c })) } } };
}

describe("isInsideContainer", () => {
    // Solar Weapon > weapon crystal > Soulfire fusion, plus an unrelated rifle.
    const soulfire = item("soulfire");
    const crystal = item("crystal", ["soulfire"]);
    const solarWeapon = item("solarWeapon", ["crystal"]);
    const rifle = item("rifle");
    const items = [solarWeapon, crystal, soulfire, rifle];

    it("finds the direct container", () => {
        expect(isInsideContainer(items, soulfire, crystal)).toBe(true);
    });

    it("finds a container two levels up", () => {
        expect(isInsideContainer(items, soulfire, solarWeapon)).toBe(true);
    });

    it("rejects an item that does not hold it", () => {
        expect(isInsideContainer(items, soulfire, rifle)).toBe(false);
    });

    it("rejects the reverse direction", () => {
        expect(isInsideContainer(items, solarWeapon, soulfire)).toBe(false);
    });

    it("stops on items that list each other as contents", () => {
        const a = item("a", ["b"]);
        const b = item("b", ["a"]);
        expect(isInsideContainer([a, b], a, rifle)).toBe(false);
    });
});
