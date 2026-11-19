/**
 * A formula an action may arm as a bonus to a mech's next attack roll: dice, a
 * flat number, or dice plus a flat number.
 *
 * Anything else is refused rather than armed, for the same reason an unrecognized
 * damage level is - arming it would spend the Power Points on a bonus that no
 * roll can evaluate, leaving the flag set and the attack unchanged.
 * @type {RegExp}
 */
const BONUS_FORMULA = /^(?:\d{1,3}d\d{1,3}(?:\s*\+\s*\d{1,3})?|\d{1,3})$/;

/**
 * Whether an armed attack bonus such as Aim applies to a roll.
 *
 * Aim belongs to the pilot who took it, so it applies only to that user's roll,
 * and only with the weapon it names, if it names one. A bonus armed before the
 * user was recorded applies to anyone's roll.
 *
 * @param {{itemId?: string|null, userId?: string|null}|null|undefined} armed The attackBonusOverride flag.
 * @param {string} itemId The weapon being rolled.
 * @param {string} userId The user making the roll.
 * @returns {boolean}
 */
export function attackBonusAppliesTo(armed, itemId, userId) {
    if (!armed) return false;
    if (armed.itemId && armed.itemId !== itemId) return false;
    return !armed.userId || armed.userId === userId;
}

/**
 * The attack bonus a mech action declares, if any.
 *
 * Aim reads "roll 1d4 and add the result as an insight bonus to the attack roll",
 * so the action carries the formula and the roll happens when the player commits
 * to it - see CONFIG.SFRPG.mechPPActions.
 *
 * @param {{armsAttackBonus?: {formula?: string}}|null|undefined} action A mech action, from the PP table or a component.
 * @returns {{formula: string}|null} The bonus to arm, or null if the action declares none.
 */
export function actionAttackBonus(action) {
    return declaredBonus(action?.armsAttackBonus);
}

/**
 * The saving throw bonus a mech action declares, if any.
 *
 * Resist reads "Before attempting a saving throw, roll 1d4 and add the result as
 * a resistance bonus to the saving throw."
 *
 * @param {{armsSaveBonus?: {formula?: string}}|null|undefined} action A mech action.
 * @returns {{formula: string}|null} The bonus to arm, or null if the action declares none.
 */
export function actionSaveBonus(action) {
    return declaredBonus(action?.armsSaveBonus);
}

/**
 * A bonus's formula, if it is one a roll can evaluate.
 *
 * @param {{formula?: string}|null|undefined} bonus
 * @returns {{formula: string}|null}
 */
function declaredBonus(bonus) {
    const formula = bonus?.formula;
    if (typeof formula !== "string") return null;

    const trimmed = formula.trim();
    if (!BONUS_FORMULA.test(trimmed)) return null;

    return { formula: trimmed };
}

/**
 * The combat turn an armed save bonus belongs to.
 *
 * Resist is used "before attempting a saving throw", which can happen on any
 * creature's turn, so the bonus lasts until the combat turn changes rather than
 * until the end of the mech's own turn.
 *
 * @param {{id: string, started: boolean, round: number, turn: number}|null} combat The combat the mech is in.
 * @returns {{combatId: string, round: number, turn: number}|null} Null outside a started combat.
 */
export function saveBonusTurn(combat) {
    if (!combat?.started) return null;
    return { combatId: combat.id, round: combat.round, turn: combat.turn };
}

/**
 * Whether an armed save bonus can still be used.
 *
 * One armed outside combat lasts until a save uses it. One armed in combat lasts
 * through the combat turn it was armed on.
 *
 * @param {{turn?: {combatId: string, round: number, turn: number}|null}|null} armed The saveBonusOverride flag.
 * @param {{id: string, started: boolean, round: number, turn: number}|null} combat The combat named by the flag, if it still exists.
 * @returns {boolean}
 */
export function saveBonusActive(armed, combat) {
    if (!armed) return false;
    if (!armed.turn) return true;

    return Boolean(combat?.started)
        && combat.id === armed.turn.combatId
        && combat.round === armed.turn.round
        && combat.turn === armed.turn.turn;
}

/**
 * The armed overrides a mech's Actions tab should show a banner for.
 *
 * Aim and Devastating Hit change different rolls, so both can be armed at once
 * and the sheet has to show either or both. Damage comes first because it is the
 * one that has always been there, and a banner that moves when a second one is
 * armed is harder to read than one that stays put.
 *
 * @param {Object} flags The mech's armed overrides.
 * @param {{source?: string, ppSpent?: number}|null} [flags.damageLevelOverride] An armed damage level override.
 * @param {{source?: string, ppSpent?: number, value?: number}|null} [flags.attackBonusOverride] An armed attack bonus.
 * @param {{source?: string, ppSpent?: number, value?: number}|null} [flags.saveBonusOverride] An armed save bonus that can still be used.
 * @param {{source?: string, ppSpent?: number}|null} [flags.pilotingRanksOverride] Accurate Strikes, while it still applies.
 * @returns {Array<{kind: string, source: string, ppSpent: number, value: number|null}>} One entry per armed override.
 */
export function armedOverrideBanners({ damageLevelOverride, attackBonusOverride, saveBonusOverride, pilotingRanksOverride } = {}) {
    const banners = [];

    if (damageLevelOverride) {
        banners.push({
            kind: "damage",
            source: damageLevelOverride.source,
            ppSpent: damageLevelOverride.ppSpent || 0,
            value: null
        });
    }

    if (attackBonusOverride) {
        banners.push({
            kind: "attack",
            source: attackBonusOverride.source,
            ppSpent: attackBonusOverride.ppSpent || 0,
            value: attackBonusOverride.value ?? 0
        });
    }

    if (saveBonusOverride) {
        banners.push({
            kind: "save",
            source: saveBonusOverride.source,
            ppSpent: saveBonusOverride.ppSpent || 0,
            value: saveBonusOverride.value ?? 0
        });
    }

    if (pilotingRanksOverride) {
        banners.push({
            kind: "piloting",
            source: pilotingRanksOverride.source,
            ppSpent: pilotingRanksOverride.ppSpent || 0,
            value: null
        });
    }

    return banners;
}
