/**
 * Compare two names the way a reader expects a list to be ordered.
 *
 * Case and accents are ignored, and numbers inside a name compare by value, so
 * "Laser pistol, Mk 2" comes before "Laser pistol, Mk 10".
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative, zero or positive, as Array.prototype.sort expects.
 */
export function compareNames(a, b) {
    return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Sort items in place by name.
 *
 * @param {Array<{name?: string}>} items
 * @returns {Array<{name?: string}>} The same array.
 */
export function sortByName(items) {
    return items.sort((a, b) => compareNames(a?.name, b?.name));
}

/**
 * Sort inventory entries in place by their item's name, and the contents of
 * every container inside them too, so a backpack's contents read in the same
 * order as the list it sits in.
 *
 * @param {Array<{item: {name?: string}, contents?: Array}>} entries Entries from processItemContainment().
 * @returns {Array} The same array.
 */
export function sortInventoryByName(entries) {
    entries.sort((a, b) => compareNames(a?.item?.name, b?.item?.name));
    for (const entry of entries) {
        if (entry?.contents?.length) sortInventoryByName(entry.contents);
    }
    return entries;
}
