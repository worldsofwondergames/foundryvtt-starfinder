import { describe, expect, it } from "vitest";
import { compareNames, sortByName, sortInventoryByName } from "./sort-by-name.js";

describe("compareNames", () => {
    it("ignores case", () => {
        expect(["bravo", "Charlie", "alpha"].sort(compareNames)).toEqual(["alpha", "bravo", "Charlie"]);
    });

    it("compares numbers inside names by value", () => {
        expect(["Mk 10", "Mk 2", "Mk 1"].sort(compareNames)).toEqual(["Mk 1", "Mk 2", "Mk 10"]);
    });
});

describe("sortByName", () => {
    it("orders feats by name", () => {
        const feats = [{ name: "Toughness" }, { name: "Improved Initiative" }, { name: "Diehard" }];
        expect(sortByName(feats).map(f => f.name)).toEqual(["Diehard", "Improved Initiative", "Toughness"]);
    });

    it("keeps an item with no name instead of throwing", () => {
        expect(sortByName([{ name: "B" }, {}]).map(f => f.name)).toEqual([undefined, "B"]);
    });
});

describe("sortInventoryByName", () => {
    it("orders top-level items and the contents of containers", () => {
        const entries = [
            { item: { name: "Rope" }, contents: [] },
            {
                item: { name: "Backpack" },
                contents: [
                    { item: { name: "Torch" }, contents: [] },
                    { item: { name: "Bedroll" }, contents: [] }
                ]
            }
        ];
        sortInventoryByName(entries);
        expect(entries.map(e => e.item.name)).toEqual(["Backpack", "Rope"]);
        expect(entries[0].contents.map(e => e.item.name)).toEqual(["Bedroll", "Torch"]);
    });

    it("sorts a container nested inside another container", () => {
        const inner = { item: { name: "Pouch" }, contents: [{ item: { name: "Zinc" }, contents: [] }, { item: { name: "Amber" }, contents: [] }] };
        sortInventoryByName([{ item: { name: "Backpack" }, contents: [inner] }]);
        expect(inner.contents.map(e => e.item.name)).toEqual(["Amber", "Zinc"]);
    });
});
