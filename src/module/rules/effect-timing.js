/**
 * Whether a timed effect should be on at a given world time, outside combat.
 *
 * Only units with a length in CONFIG.SFRPG.effectDurationFrom (turn, round,
 * minute, hour, day) can run out. A "permanent" effect has no length, so its end
 * time works out to NaN, and comparing the world time against NaN used to switch
 * every permanent effect off - every condition, among others - the moment world
 * time moved, such as when a combat was created or ended. The combat tracker's
 * own check already skipped these units.
 *
 * @param {{unit?: string, activationTime?: number|null, activationEnd?: number|null}} duration The effect's activeDuration.
 * @param {number} worldTime The current world time in seconds.
 * @param {Object<string, number>} durationFrom CONFIG.SFRPG.effectDurationFrom.
 * @returns {boolean|null} Whether the effect should be on, or null if its unit never runs out and its state should be left alone.
 */
export function enabledAtWorldTime(duration, worldTime, durationFrom) {
    if (!Object.hasOwn(durationFrom, duration?.unit)) return null;

    const start = Number.isFinite(duration.activationTime) ? duration.activationTime : -Infinity;
    const end = Number.isFinite(duration.activationEnd) ? duration.activationEnd : Infinity;
    return start <= worldTime && worldTime <= end;
}
