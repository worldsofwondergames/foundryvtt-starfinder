/**
 * The PP rules of four power core templates. Nothing here touches Foundry.
 *
 * Scrapper and Aeon are from Tech Revolution pg. 102. Junker and Photosynthesizer
 * are homebrew, and their text is in the compendium items.
 */

const TEMPLATE_KINDS = new Map([
    ["scrapper core template", "scrapper"],
    ["aeon core template", "aeon"],
    ["junker core template", "junker"],
    ["photosynthesizer core template", "photosynthesizer"]
]);

/** The PP a Scrapper core gives each time its mech gains a system failure condition. */
export const SCRAPPER_GAIN = "1d4";

/** How each light level adjusts a Photosynthesizer core's rate, initial, and maximum PP. */
export const LIGHT_LEVELS = { bright: 2, normal: 1, dim: 0, darkness: -1 };

/**
 * Which of the four templates the mech's power core has.
 *
 * @param {Iterable<{type: string, name: string, system?: object}>} items The mech's items.
 * @returns {"scrapper"|"aeon"|"junker"|"photosynthesizer"|null}
 */
export function coreTemplateKind(items) {
    const template = [...items].find(item => item.type === "mechUpgrade" && item.system?.coreTemplate);
    const name = (template?.name ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim()
        .toLowerCase();
    return TEMPLATE_KINDS.get(name) ?? null;
}

/**
 * The power core's PP after the light a Photosynthesizer core last took in and
 * the bonus from a Junker core's salvage.
 *
 * @param {{initial: number, max: number, regen: number}} pp The core's PP after its template.
 * @param {object} options
 * @param {string|null} [options.light] The light level applied at the start of the mech's turn.
 * @param {boolean} [options.salvaging] Whether a salvage bonus is running.
 * @returns {{initial: number, max: number, regen: number}}
 */
export function boostedPowerPoints(pp, { light = null, salvaging = false } = {}) {
    const shift = LIGHT_LEVELS[light] ?? 0;
    return {
        initial: Math.max(0, pp.initial + shift),
        max: Math.max(0, pp.max + shift + (salvaging ? 2 : 0)),
        regen: Math.max(0, pp.regen + shift + (salvaging ? 1 : 0))
    };
}

/**
 * How many rounds a Junker core's salvage lasts, which is 1 for every 4 levels or CR.
 *
 * @param {number} level The salvaged target's level or CR.
 * @param {number} tier The mech's tier.
 * @returns {number|null} The rounds, or null when the target is below half the mech's tier.
 */
export function salvageRounds(level, tier) {
    const value = Number(level) || 0;
    if (value < (Number(tier) || 0) / 2) return null;
    return Math.floor(value / 4);
}

/**
 * The fast healing a Junker core's salvage gives, which is ¼ the mech's tier, minimum 1.
 *
 * @param {number} tier The mech's tier.
 * @returns {number}
 */
export function salvageFastHealing(tier) {
    return Math.max(1, Math.floor((Number(tier) || 0) / 4));
}

/**
 * The PP an Aeon core gets from a spell slot, which is half its level, rounded down.
 *
 * @param {number} level The spell slot's level.
 * @returns {number}
 */
export function aeonPowerPoints(level) {
    return Math.floor((Number(level) || 0) / 2);
}

/**
 * The unused spell slots the operators could spend on an Aeon core. A 1st-level
 * slot is left out, since half of 1 rounds down to no PP.
 *
 * @param {Array<{id: string, name: string, system?: {spells?: object}}>} operators
 * @returns {Array<{operatorId: string, operatorName: string, level: number, source: string, path: string, value: number}>}
 */
export function aeonSlots(operators) {
    const slots = [];
    for (const operator of operators) {
        const spells = operator.system?.spells ?? {};
        for (let level = 2; level <= 6; level++) {
            const entry = spells[`spell${level}`];
            if (!entry) continue;
            // As the spell cast dialog does, a caster with per-class slots spends only those.
            const sources = entry.perClass
                ? Object.entries(entry.perClass).map(([source, slot]) => ({ source, path: `system.spells.spell${level}.perClass.${source}.value`, value: Number(slot?.value) || 0 }))
                : [{ source: "general", path: `system.spells.spell${level}.value`, value: Number(entry.value) || 0 }];
            for (const { source, path, value } of sources) {
                if (value > 0) slots.push({ operatorId: operator.id, operatorName: operator.name, level, source, path, value });
            }
        }
    }
    return slots;
}

/**
 * Whether a once-per-round use recorded in a flag was in the combat's current round.
 *
 * @param {{combatId: string, round: number}|null|undefined} used The flag.
 * @param {{id: string, round: number, started?: boolean}|null|undefined} combat The mech's combat.
 * @returns {boolean}
 */
export function usedThisRound(used, combat) {
    if (!used || !combat?.started) return false;
    return used.combatId === combat.id && used.round === combat.round;
}
