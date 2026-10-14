/**
 * Names for roll variables that would otherwise show as their data path, such
 * as "+ 1[@combatant.attributes.init.total]" on an initiative card. Keyed by the
 * path inside the actor's data.
 */
const LABELS = {
    "attributes.init.total": "SFRPG.InitiativeLabel"
};

/**
 * The name to show for a roll variable, if it has one.
 *
 * @param {string} variable The variable without its "@", with or without a
 *     context key in front, such as "combatant.attributes.init.total".
 * @param {function(string): string} localize Turns a localization key into text.
 * @returns {string|null}
 */
export function variableLabel(variable, localize) {
    const key = Object.keys(LABELS).find(path => variable === path || variable.endsWith(`.${path}`));
    return key ? localize(LABELS[key]) : null;
}

/**
 * A roll formula with each named variable shown by its name, for the roll
 * dialog's formula line.
 *
 * @param {string} formula
 * @param {function(string): string} localize
 * @returns {string}
 */
export function labelFormula(formula, localize) {
    return formula.replace(/@([\w.]+)/g, (match, variable) => variableLabel(variable, localize) ?? match);
}
