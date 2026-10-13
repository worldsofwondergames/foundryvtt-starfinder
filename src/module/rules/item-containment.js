/**
 * Whether `item` sits inside `container`, directly or through other containers.
 *
 * A modifier limited to its container has to reach the item that rolls, which is
 * not always the one holding it. A solarian's Soulfire fusion goes into a weapon
 * crystal, and the crystal goes into the Solar Weapon, so the fusion's damage
 * belongs to the weapon two levels up.
 *
 * @param {Array<{id: string, system: {container?: {contents?: Array<{id: string}>}}}>} items The actor's items.
 * @param {{id: string}} item The contained item.
 * @param {{id: string}} container The item that may hold it.
 * @returns {boolean} True if `container` holds `item` at any depth.
 */
export function isInsideContainer(items, item, container) {
    if (!item || !container) return false;

    const parentOf = child => items.find(x => x.system.container?.contents?.some(y => y.id === child.id));

    // A container cannot hold itself, so the visited set only matters for broken
    // data, where two items list each other as contents.
    const visited = new Set();
    let parent = parentOf(item);
    while (parent && !visited.has(parent.id)) {
        if (parent.id === container.id) return true;
        visited.add(parent.id);
        parent = parentOf(parent);
    }
    return false;
}
