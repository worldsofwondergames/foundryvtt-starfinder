/**
 * Conditions that deal damage at the start of the affected creature's turn.
 *
 * Burning and Bleeding are core conditions. Corrode and Frostbite are weapon
 * critical hit effects whose rules text says each "functions as the burning
 * condition" but deals acid or cold damage, so they get conditions of their own
 * that behave the same way.
 *
 * The damage is rolled by the condition item's own turn event, the same
 * mechanism any effect item can use, so it posts a normal damage card with the
 * Apply Damage controls.
 *
 * - `damageType`: the type the condition deals, or null for untyped damage.
 * - `stacking`: "sum" when damage from several sources adds up, as Burning's
 *   text says it does; "worst" when only the largest source counts, as
 *   Bleeding's text says.
 * - `defaultFormula`: what to roll when the effect lists no amount. Burning's
 *   text gives 1d6, and Corrode and Frostbite function as Burning. Bleeding's
 *   text gives none, so it needs one.
 *
 * @type {Object<string, {damageType: string|null, stacking: "sum"|"worst", defaultFormula: string|null}>}
 */
export const ONGOING_CONDITIONS = {
    burning: { damageType: "fire", stacking: "sum", defaultFormula: "1d6" },
    corrode: { damageType: "acid", stacking: "sum", defaultFormula: "1d6" },
    frostbite: { damageType: "cold", stacking: "sum", defaultFormula: "1d6" },
    bleeding: { damageType: null, stacking: "worst", defaultFormula: null }
};

/**
 * Which ongoing condition each critical hit effect applies.
 *
 * Weapons store the effect as free text, such as "Corrode", "Bleed 1d4" or
 * "Frostbite 3d6", so only the first word is matched.
 * @type {Object<string, string>}
 */
export const CRITICAL_EFFECT_CONDITIONS = {
    burn: "burning",
    corrode: "corrode",
    frostbite: "frostbite",
    bleed: "bleeding"
};

const DICE = /\b\d+d\d+(?:\s*[+-]\s*\d+)?\b/i;

/**
 * The ongoing condition a weapon's critical hit effect applies, if any.
 *
 * The amount comes from the critical damage parts when the weapon has one,
 * such as Corrode with a 3d4 part, and otherwise from dice written into the
 * effect text, such as "Bleed 1d4". It is null when neither gives one, so the
 * caller can fall back to the condition's default.
 *
 * @param {{effect?: string, parts?: Array<{formula?: string}>}|null|undefined} critical The weapon's `system.critical`.
 * @returns {{condition: string, formula: string|null}|null} The condition and amount, or null if the effect applies no ongoing condition.
 */
export function ongoingFromCritical(critical) {
    const text = (critical?.effect ?? "").trim();
    const word = text.split(/\s+/)[0]?.toLowerCase() ?? "";
    const condition = CRITICAL_EFFECT_CONDITIONS[word];
    if (!condition) return null;

    const partFormula = (critical.parts ?? []).map(p => (p?.formula ?? "").trim()).find(Boolean);
    const textFormula = text.match(DICE)?.[0]?.replace(/\s+/g, "") ?? null;
    return { condition, formula: partFormula || textFormula || null };
}

/**
 * The average of a simple dice formula, used to pick the worst bleed.
 *
 * Only "NdM", "NdM+K" and flat numbers are understood. Anything else averages
 * to 0, so an unreadable formula never displaces a readable one.
 *
 * @param {string} formula e.g. "2d6+3"
 * @returns {number} The average roll.
 */
export function averageOf(formula) {
    const text = String(formula ?? "").replace(/\s+/g, "");
    const dice = text.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (dice) return Number(dice[1]) * (Number(dice[2]) + 1) / 2 + Number(dice[3] ?? 0);
    return /^\d+$/.test(text) ? Number(text) : 0;
}

/**
 * The turn events a condition should carry once a new source is added.
 *
 * Each source is one turn event that rolls at the start of the turn. A "sum"
 * condition keeps every source, so two burning effects both roll. A "worst"
 * condition keeps only the source with the higher average.
 *
 * @param {Array<Object>} existing The condition item's current turn events.
 * @param {Object} options
 * @param {string} options.condition A key of ONGOING_CONDITIONS.
 * @param {string} options.formula The amount the new source deals.
 * @param {string} options.name The name shown on the damage card, e.g. "Corrode (Acid cannon)".
 * @returns {Array<Object>} The turn events to store.
 */
export function addOngoingSource(existing, { condition, formula, name }) {
    const rule = ONGOING_CONDITIONS[condition];
    const event = {
        trigger: "onTurnStart",
        type: "roll",
        formula,
        damageTypes: rule.damageType ? { [rule.damageType]: true } : {},
        name
    };

    const current = (existing ?? []).filter(e => e?.type === "roll" && e?.trigger === "onTurnStart");
    const others = (existing ?? []).filter(e => !current.includes(e));
    if (rule.stacking === "sum") return [...others, ...current, event];

    const worst = current.reduce((best, e) => (averageOf(e.formula) > averageOf(best.formula) ? e : best), event);
    return [...others, worst];
}

/**
 * The rounds left on an ongoing condition after a new source is added.
 *
 * One timer covers the whole condition. A source without a duration makes the
 * condition last until it is removed, and otherwise the longer duration wins.
 *
 * @param {number|null|undefined} current Rounds left now, or null if the condition has no timer.
 * @param {number|null|undefined} added Rounds for the new source, or null for none.
 * @param {boolean} isNew True if the condition was not on the actor before.
 * @returns {number|null} The rounds to store, or null for no timer.
 */
export function mergeRounds(current, added, isNew) {
    const valid = n => Number.isInteger(n) && n > 0;
    if (!valid(added)) return null;
    if (isNew) return added;
    if (!valid(current)) return null;
    return Math.max(current, added);
}

/**
 * Count down an ongoing condition's timer at the start of the creature's turn.
 *
 * @param {number|null|undefined} rounds Rounds left before this turn's damage.
 * @returns {{rounds: number|null, expired: boolean}} Rounds left afterwards, and whether the condition ends.
 */
export function tickRounds(rounds) {
    if (!Number.isInteger(rounds) || rounds <= 0) return { rounds: null, expired: false };
    const left = rounds - 1;
    return { rounds: left, expired: left <= 0 };
}

/**
 * The ongoing condition an item is, if any.
 *
 * The condition's own turn events are not rolled by the item when it is one of
 * these, since rollOngoingConditions() rolls them, applies the damage and posts
 * one card for the condition.
 *
 * @param {{type?: string, name?: string, system?: {slug?: string}}|null|undefined} item
 * @returns {string|null} A key of ONGOING_CONDITIONS, or null.
 */
export function ongoingConditionOf(item) {
    if (item?.type !== "effect") return null;
    const key = item.system?.slug || item.name?.toLowerCase();
    return ONGOING_CONDITIONS[key] ? key : null;
}

/**
 * The sources of damage stored on an ongoing condition item.
 *
 * @param {Array<Object>|null|undefined} turnEvents The condition item's turn events.
 * @returns {Array<{formula: string, name?: string}>} The events that roll damage at the start of the turn.
 */
export function ongoingSources(turnEvents) {
    return (turnEvents ?? []).filter(e => e?.type === "roll" && e?.trigger === "onTurnStart" && e?.formula);
}

/**
 * The Hit Points, Stamina Points and temporary Hit Points a creature has left,
 * used to tell how much of the damage got through resistance.
 *
 * @param {{hp?: {value?: number, temp?: number|string}, sp?: {value?: number}}|null|undefined} attributes
 * @returns {number}
 */
export function remainingHealth(attributes) {
    return (Number(attributes?.hp?.value) || 0)
        + (Number(attributes?.sp?.value) || 0)
        + (parseInt(attributes?.hp?.temp) || 0);
}

/**
 * The weapon or effect a source came from, which applyOngoingCondition writes
 * into its name as "Corrode (Acid cannon)".
 *
 * @param {string} [name] The turn event's name.
 * @returns {string} The part in parentheses, or "" if there is none.
 */
export function sourceOf(name) {
    return name?.match(/\(([^)]+)\)$/)?.[1] ?? "";
}
