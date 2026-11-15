const LABEL = "SFRPG.NarrativeStarship.";

/**
 * Stat rows in stat block order. `stored` reads the GM override from system.narrative.
 */
const STAT_ROWS = [
    { key: "averageDC", label: LABEL + "AverageDC", name: "system.narrative.averageDC", stored: n => n.averageDC, npcOnly: false },
    { key: "hardDC", label: LABEL + "HardDC", name: "system.narrative.hardDC", stored: n => n.hardDC, npcOnly: false },
    { key: "hpMax", label: LABEL + "HP", name: "system.narrative.hp.max", stored: n => n.hp?.max, npcOnly: false },
    { key: "threshold", label: LABEL + "Threshold", name: "system.narrative.threshold", stored: n => n.threshold, npcOnly: true },
    { key: "skillBonus", label: LABEL + "SkillBonus", name: "system.narrative.skillBonus", stored: n => n.skillBonus, npcOnly: true }
];

/** Form fields that hold a GM override, where an empty input means "use the derived value". */
export const NARRATIVE_OVERRIDE_FIELDS = STAT_ROWS.map(row => row.name);

const SKILL_MODIFIER_PREFIX = "system.narrative.skillModifiers.";

/**
 * Which sheet layout a starship gets.
 * @param {boolean} useNPCCrew
 * @returns {"npc"|"pc"}
 */
export function narrativeLayout(useNPCCrew) {
    return useNPCCrew ? "npc" : "pc";
}

/**
 * HP pips, one per max HP, filled up to the current HP.
 * A current HP above the max fills every pip, and one below 0 fills none.
 * @param {number} hpValue
 * @param {number} hpMax
 * @returns {Array<{index: number, filled: boolean}>} index is 1-based.
 */
export function hpPips(hpValue, hpMax) {
    const max = Math.floor(Number(hpMax) || 0);
    const value = Number(hpValue) || 0;
    const pips = [];
    for (let index = 1; index <= max; index++) {
        pips.push({ index, filled: index <= value });
    }
    return pips;
}

/**
 * The HP after clicking a pip. Clicking the last filled pip empties it.
 * @param {number} index The 1-based pip clicked.
 * @param {number} current The current HP.
 * @returns {number}
 */
export function hpFromPipClick(index, current) {
    return index === current ? index - 1 : index;
}

/**
 * Rows for the derived stats shown on the sheet.
 * @param {object} narrative The starship's system.narrative, with derived stats.
 * @param {"npc"|"pc"} layout
 * @returns {Array<object>}
 */
export function narrativeStatRows(narrative, layout) {
    const derived = narrative?.derived ?? {};
    const sources = derived.sources ?? {};
    return STAT_ROWS
        .filter(row => layout === "npc" || !row.npcOnly)
        .map(row => {
            const stored = row.stored(narrative ?? {});
            return {
                key: row.key,
                label: row.label,
                name: row.name,
                value: derived[row.key],
                source: sources[row.key] ?? "",
                override: stored ?? "",
                guessed: row.key === "skillBonus" && derived.skillBonusGuessed === true
            };
        });
}

/**
 * Skill modifier rows, sorted by label, plus the skills that can still be added.
 * @param {Object<string, number>} skillModifiers
 * @param {Object<string, string>} skills Skill key to label.
 * @returns {{rows: Array<{key: string, label: string, value: number}>, available: Array<{key: string, label: string}>}}
 */
export function skillModifierView(skillModifiers, skills) {
    const mods = skillModifiers ?? {};
    const rows = Object.entries(mods)
        .filter(([key]) => key in skills)
        .map(([key, value]) => ({ key, label: skills[key], value }))
        .sort((a, b) => a.label.localeCompare(b.label));
    const available = Object.entries(skills)
        .filter(([key]) => !(key in mods))
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    return { rows, available };
}

function blank(value) {
    return value === null || value === undefined || value === "" || Number.isNaN(value);
}

/**
 * Cleans submitted narrative fields. An empty override saves null so the stat is derived again.
 * An empty skill modifier saves 0.
 * @param {Object<string, *>} formData Flat form data.
 * @returns {Object<string, *>} The same object, changed in place.
 */
export function normalizeNarrativeFormData(formData) {
    for (const name of NARRATIVE_OVERRIDE_FIELDS) {
        if (!(name in formData)) continue;
        const value = formData[name];
        formData[name] = blank(value) || Number.isNaN(Number(value)) ? null : Number(value);
    }
    for (const name of Object.keys(formData)) {
        if (!name.startsWith(SKILL_MODIFIER_PREFIX)) continue;
        const value = formData[name];
        formData[name] = blank(value) || Number.isNaN(Number(value)) ? 0 : Number(value);
    }
    return formData;
}
