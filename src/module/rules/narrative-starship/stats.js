const SOURCE = "SFRPG.NarrativeStarship.Source.";
const ALTERNATE_HARD = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 29, 30, 31, 31, 32, 32, 33];

/**
 * Average and Hard DC for a tier (Starfinder Enhanced p. 184).
 * @param {number} tier
 * @param {boolean} useAlternate Use the skill DC table instead of the standard formula.
 * @returns {{average: number, hard: number}}
 */
export function narrativeDCs(tier, useAlternate) {
    if (useAlternate && tier >= 1) {
        const index = Math.min(Math.floor(tier), 20) - 1;
        const hard = ALTERNATE_HARD[index];
        return { average: hard - 5, hard };
    }
    const average = 10 + Math.floor(1.5 * tier);
    return { average, hard: average + 5 };
}

/**
 * Reads the mark number from a name such as "Mk 7 armor".
 * @param {string|null|undefined} name
 * @returns {number|null}
 */
export function markFromName(name) {
    const match = /\bMk\s*(\d+)/i.exec(name ?? "");
    return match ? Number(match[1]) : null;
}

/**
 * Shield threshold from the first word of the shield's name.
 * @param {string|null} shieldName Null when no shield is installed.
 * @returns {number}
 */
export function shieldThreshold(shieldName) {
    if (shieldName === null || shieldName === undefined) return 2;
    const word = String(shieldName).trim()
        .split(/\s+/)[0].toLowerCase();
    switch (word) {
        case "basic":
        case "light":
            return 2;
        case "medium":
            return 3;
        case "heavy":
        case "superior":
            return 4;
        default:
            return 3;
    }
}

/**
 * Hits a ship can take.
 * @param {string} size Lowercase size key, such as "tiny" or "colossal".
 * @param {boolean} isPC
 * @returns {number}
 */
export function narrativeHP(size, isPC) {
    if (isPC) return 5;
    const key = String(size ?? "").toLowerCase();
    if (key === "tiny") return 4;
    if (["gargantuan", "colossal", "supercolossal"].includes(key)) return 6;
    return 5;
}

/**
 * Skill bonus from NPC crew skill modifiers (gunnery already left out by the caller).
 * @param {number[]} mods
 * @param {number} tier
 * @returns {{value: number, guessed: boolean}}
 */
export function skillBonusFromCrew(mods, tier) {
    const sorted = [...mods].sort((a, b) => b - a);
    if (sorted.length >= 2) return { value: sorted[1], guessed: false };
    if (sorted.length === 1) return { value: sorted[0] - 3, guessed: false };
    return { value: Math.floor(1.5 * tier) + 5, guessed: true };
}

function markAdjustment(tier, marks) {
    const present = marks.filter(m => m !== null);
    if (!present.length) return 0;
    if (Math.max(...present) >= tier) return 1;
    if (present.every(m => m < tier / 2)) return -1;
    return 0;
}

function isSet(value) {
    return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Derives every narrative stat for a starship.
 * @returns {{averageDC: number, hardDC: number, hpMax: number, threshold: number,
 *   skillBonus: number, skillBonusGuessed: boolean, sources: Object<string, string>}}
 */
export function deriveNarrativeStats({
    tier, size, isPC, armorName, defensesName, shieldName, crewSkillMods, overrides, useAlternate
}) {
    const over = overrides ?? {};
    const dcs = narrativeDCs(tier, useAlternate);
    const adjust = markAdjustment(tier, [markFromName(armorName), markFromName(defensesName)]);
    const dcSource = adjust === 0 ? SOURCE + "Tier" : SOURCE + "ArmorMark";
    const crew = skillBonusFromCrew(crewSkillMods ?? [], tier);

    const result = {
        averageDC: dcs.average + adjust,
        hardDC: dcs.hard + adjust,
        hpMax: narrativeHP(size, isPC),
        threshold: shieldThreshold(shieldName ?? null),
        skillBonus: crew.value,
        skillBonusGuessed: crew.guessed,
        sources: {
            averageDC: dcSource,
            hardDC: dcSource,
            hpMax: SOURCE + "Size",
            threshold: SOURCE + "Shields",
            skillBonus: SOURCE + (crew.guessed ? "Guessed" : "CrewSkills")
        }
    };

    for (const key of ["averageDC", "hardDC", "hpMax", "threshold", "skillBonus"]) {
        if (!isSet(over[key])) continue;
        result[key] = over[key];
        result.sources[key] = SOURCE + "Override";
        if (key === "skillBonus") result.skillBonusGuessed = false;
    }
    return result;
}
