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
 * Whether the narrative starship sheet is the default sheet for starships.
 * @param {"standard"|"narrative"|"both"} mode
 * @returns {boolean}
 */
export function narrativeSheetIsDefault(mode) {
    return mode === "narrative";
}
