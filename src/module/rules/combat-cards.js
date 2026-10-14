/**
 * Whether a new phase gets a chat card.
 *
 * Starship combat and vehicle chases move through phases the rules name. Normal
 * combat is set up as one phase only so it can share their code, and a card
 * announcing it every round means nothing, so a combat with a single phase gets
 * no phase card.
 *
 * @param {object[]} phases The combat type's phases.
 * @param {string} setting The combat type's chat card setting.
 * @returns {boolean}
 */
export function postsPhaseCard(phases, setting) {
    if (phases.length < 2) return false;
    return setting === "enabled" || setting === "roundsPhases";
}
