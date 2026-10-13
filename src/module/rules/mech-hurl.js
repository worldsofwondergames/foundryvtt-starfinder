/**
 * Hurl: "Grab a nearby object and throw it as a ranged attack with a 30-foot
 * range increment. ... Maximum or next-smallest size objects deal medium damage;
 * smaller objects deal light damage."
 *
 * Using the action grants the mech a thrown attack until the end of its turn.
 * The attack is built as a melee mech weapon with the thrown property, so it
 * rolls through the same code as any other thrown mech weapon: the melee attack
 * bonus, the melee damage modifier with its Strength, and bludgeoning damage
 * against KAC.
 */

/** The range increment Hurl's text gives. */
export const HURL_RANGE = "30 ft.";

/**
 * The damage level for each object size Hurl offers. The text says "light
 * damage", and the mech damage table calls its lightest column "low".
 * @type {Object<string, string>}
 */
export const HURL_DAMAGE_LEVELS = {
    large: "medium",
    small: "low"
};

/**
 * The object sizes a mech of the given size can Hurl, largest first.
 *
 * "The object can be at most two size categories smaller than the mech." The
 * largest allowed size and the one below it deal medium damage, and every size
 * below that deals light damage, so the last option covers all of them.
 *
 * @param {string} mechSize The mech's size key, e.g. "huge".
 * @param {string[]} sizeOrder Size keys from smallest to largest, e.g. Object.keys(CONFIG.SFRPG.actorSizes).
 * @returns {Array<{size: string, damageLevel: string, orSmaller: boolean}>|null} The choices, or null if the mech's size is unknown.
 */
export function hurlSizeOptions(mechSize, sizeOrder) {
    const mechIndex = sizeOrder.indexOf(mechSize);
    const maxIndex = mechIndex - 2;
    if (mechIndex < 0 || maxIndex < 0) return null;

    const options = [{ size: sizeOrder[maxIndex], damageLevel: HURL_DAMAGE_LEVELS.large, orSmaller: false }];
    if (maxIndex - 1 >= 0) {
        options.push({ size: sizeOrder[maxIndex - 1], damageLevel: HURL_DAMAGE_LEVELS.large, orSmaller: false });
    }
    if (maxIndex - 2 >= 0) {
        options.push({ size: sizeOrder[maxIndex - 2], damageLevel: HURL_DAMAGE_LEVELS.small, orSmaller: maxIndex - 2 > 0 });
    }
    return options;
}

/**
 * The system data for the weapon Hurl grants.
 *
 * @param {Object} options
 * @param {number} options.tier The mech's tier, which picks the row of the damage table.
 * @param {string} options.damageLevel "medium" or "low".
 * @param {Object<number, Object<string, string>>} options.damageTable CONFIG.SFRPG.mechWeaponDamageByTier.
 * @returns {Object|null} mechWeapon system data, or null if the tier or level is not in the table.
 */
export function hurlWeaponSystem({ tier, damageLevel, damageTable }) {
    const clamped = Math.max(1, Math.min(20, tier || 1));
    const formula = damageTable?.[clamped]?.[damageLevel];
    if (!formula) return null;

    return {
        weaponType: "melee",
        special: `thrown (${HURL_RANGE})`,
        slot: "upperLimb",
        damageLevel,
        range: HURL_RANGE,
        damage: {
            parts: [{ formula, operator: "", types: { bludgeoning: true } }]
        }
    };
}

/**
 * Whether it is this mech's turn, for actions that can only be taken on it.
 *
 * Outside combat there are no turns, so the action is always allowed.
 *
 * @param {{started?: boolean, combatant?: {actor?: {id: string}}}|null} combat The active combat.
 * @param {{id: string}} actor The mech.
 * @returns {boolean} True if the mech may act now.
 */
export function isActorsTurn(combat, actor) {
    if (!combat?.started) return true;
    return combat.combatant?.actor?.id === actor?.id;
}

/**
 * Whether a granted Hurl attack can still be used.
 *
 * The flag is cleared when the mech's turn ends, but it also records the round
 * and turn it was granted on, so a flag that outlived its turn (a combat that
 * was ended or skipped forward) is not honored.
 *
 * @param {{round?: number|null, turn?: number|null}|null|undefined} flag The mech's `hurlAttack` flag.
 * @param {{started?: boolean, round?: number, turn?: number}|null} combat The active combat.
 * @returns {boolean} True if the attack is still available.
 */
export function hurlStillActive(flag, combat) {
    if (!flag) return false;
    if (!combat?.started) return flag.round === null || flag.round === undefined;
    return flag.round === combat.round && flag.turn === combat.turn;
}
