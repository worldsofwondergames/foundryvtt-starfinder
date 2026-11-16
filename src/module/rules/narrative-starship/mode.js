/**
 * Combat types offered for each starship combat mode setting.
 * Unknown modes fall back to standard.
 * @param {"standard"|"narrative"|"both"} mode
 * @returns {string[]}
 */
export function combatTypesForMode(mode) {
    switch (mode) {
        case "narrative":
            return ["normal", "narrativeStarship", "vehicleChase"];
        case "both":
            return ["normal", "starship", "narrativeStarship", "vehicleChase"];
        default:
            return ["normal", "starship", "vehicleChase"];
    }
}

/**
 * The combat type the tracker switches to when the GM steps through the types
 * offered by the mode. A current type the mode does not offer steps to the
 * first type, whichever direction was clicked.
 * @param {string} current
 * @param {number} direction 1 for next, -1 for previous
 * @param {"standard"|"narrative"|"both"} mode
 * @returns {string}
 */
export function nextCombatType(current, direction, mode) {
    const types = combatTypesForMode(mode);
    const index = types.indexOf(current);
    if (index === -1) return types[0];
    return types[(types.length + index + direction) % types.length];
}

/**
 * The combat type a starship actor starts when it joins a combat.
 * @param {"standard"|"narrative"|"both"} mode
 * @returns {string}
 */
export function starshipCombatTypeForMode(mode) {
    return mode === "narrative" ? "narrativeStarship" : "starship";
}

/**
 * The combat type a combat starts as. Adding a combatant switches the type, but that update may not be saved yet
 * when the GM starts the combat, or another GM's client made it. A combat still of the normal type whose
 * combatants are all starships starts as the type a starship gives it in this mode. Any other type is kept.
 * @param {string} current The combat's type now.
 * @param {Array<string|undefined>} actorTypes The actor type of each combatant.
 * @param {"standard"|"narrative"|"both"} mode
 * @returns {string}
 */
export function startingCombatType(current, actorTypes, mode) {
    if (current !== "normal" || actorTypes.length === 0 || actorTypes.some(type => type !== "starship")) return current;
    return starshipCombatTypeForMode(mode);
}

/**
 * Whether the narrative starship sheet is the default sheet for starships.
 * @param {"standard"|"narrative"|"both"} mode
 * @returns {boolean}
 */
export function narrativeSheetIsDefault(mode) {
    return mode === "narrative";
}

/**
 * Whether the narrative sheet offers a button to switch to the standard sheet.
 * @param {"standard"|"narrative"|"both"} mode
 * @returns {boolean}
 */
export function showStandardSheetToggle(mode) {
    return mode === "both";
}
