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

/**
 * Crew actions grouped by role, in the given role order, for the sheet's Crew Actions tab.
 * Roles with no actions are left out.
 * @param {Object<string, {role: string, preferred: string[]|"any", hardAlways: boolean, dcOf: string}>} actions
 * @param {string[]} roles Role keys in display order.
 * @param {Object<string, string>} skills Skill key to label. Keys missing from it are shown as the key.
 * @returns {Array<{role: string, actions: Array<{key: string, anySkill: boolean, skills: string, hardAlways: boolean,
 *     dcOf: string, preferred: string[]|"any"}>}>}
 */
export function crewActionGroups(actions, roles, skills) {
    return roles
        .map(role => ({
            role,
            actions: Object.entries(actions)
                .filter(([, action]) => action.role === role)
                .map(([key, action]) => ({
                    key,
                    anySkill: action.preferred === "any",
                    skills: action.preferred === "any" ? "" : action.preferred.map(k => skills[k] ?? k).join(", "),
                    hardAlways: action.hardAlways,
                    dcOf: action.dcOf,
                    preferred: action.preferred
                }))
        }))
        .filter(group => group.actions.length > 0);
}

/**
 * The DC numbers of one DC category for a set of ships: one number when they all share it, or one per ship.
 * @param {"average"|"hard"} category
 * @param {Array<{name: string, average: number|undefined, hard: number|undefined}>} ships
 * @returns {Array<{dc: number, name: string|null}>} Empty when no ship's DC is known.
 */
export function dcNumbers(category, ships) {
    const known = ships.filter(ship => Number.isFinite(ship?.[category]));
    if (known.length === 0) return [];
    if (known.every(ship => ship[category] === known[0][category])) return [{ dc: known[0][category], name: null }];
    return known.map(ship => ({ dc: ship[category], name: ship.name }));
}

/**
 * The DCs to show beside a crew action, by the DC category the rules give it. A preferred skill uses the Average
 * DC and any other skill the Hard DC; an action that always uses the Hard DC has only that one.
 * @param {{preferred: string[]|"any", hardAlways: boolean, dcOf: "own"|"target"}} action
 * @param {{name: string, average: number|undefined, hard: number|undefined}} own This ship.
 * @param {Array<{name: string, average: number|undefined, hard: number|undefined}>} opponents The enemy ships.
 * @returns {Array<{label: "otherSkills"|null, category: "average"|"hard", dcs: Array<{dc: number, name: string|null}>}>}
 */
export function crewActionDCGroups(action, own, opponents) {
    const ships = action.dcOf === "own" ? [own] : opponents;
    const group = (label, category) => ({ label, category, dcs: dcNumbers(category, ships) });
    if (action.hardAlways) return [group(null, "hard")];
    if (action.preferred === "any") return [group(null, "average")];
    return [group(null, "average"), group("otherSkills", "hard")];
}

/**
 * The DCs to show beside an enemy tactic: the PC ships' DC of the category the tactic's check uses. Cruel Taunt
 * shows both, since the GM picks one.
 * @param {{dc: "average"|"hard"|"choice"|null}} tactic
 * @param {Array<{name: string, average: number|undefined, hard: number|undefined}>} pcShips
 * @returns {Array<{label: "average"|"hard"|null, category: "average"|"hard", dcs: Array<{dc: number, name: string|null}>}>}
 */
export function tacticDCGroups(tactic, pcShips) {
    const group = (label, category) => ({ label, category, dcs: dcNumbers(category, pcShips) });
    if (tactic.dc === "choice") return [group("average", "average"), group("hard", "hard")];
    if (tactic.dc === "average" || tactic.dc === "hard") return [group(null, tactic.dc)];
    return [];
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

/**
 * Adds an actor to a narrative ship's crew list.
 * @param {string[]|undefined} crew The ship's system.narrative.crew.
 * @param {string} actorId
 * @returns {string[]|null} The new list, or null when there is no id or the actor is already on the list.
 */
export function addCrewMember(crew, actorId) {
    const list = crew ?? [];
    if (!actorId || list.includes(actorId)) return null;
    return [...list, actorId];
}

/**
 * The crew members a user can roll crew actions for: during the Crew Actions phase, on a PC ship that is still in
 * the fight, the crew members the user owns.
 * @param {{crewPhase: boolean, side: string|undefined, out: boolean}} ship
 * @param {string[]|undefined} crew The ship's system.narrative.crew.
 * @param {function(string): boolean} owns Whether the user owns the actor with that id. The GM owns every actor.
 * @returns {string[]}
 */
export function rollableCrew({ crewPhase, side, out }, crew, owns) {
    if (!crewPhase || side !== "pc" || out) return [];
    return [...new Set(crew ?? [])].filter(id => owns(id));
}

/**
 * Whether each enemy tactic's Roll button is enabled, and the reason when it is not. A ship that already chose a
 * tactic this round, or that must roll its Mine Layer check first, can't roll any tactic.
 * @param {Array<{key: string, disabled: boolean, reason?: string}>} statuses From availableTactics.
 * @param {{chosen: boolean, minesPending: boolean}} ship
 * @returns {Record<string, {disabled: boolean, reason: string|null}>}
 */
export function tacticButtonStates(statuses, { chosen, minesPending }) {
    const shipReason = chosen ? "alreadyChosen" : (minesPending ? "minesFirst" : null);
    return Object.fromEntries(statuses.map(status => {
        const reason = shipReason ?? (status.disabled ? status.reason : null);
        return [status.key, { disabled: Boolean(reason), reason }];
    }));
}

/**
 * What the GM must be asked before an enemy tactic is rolled from the sheet. A tactic that targets a PC ship uses
 * the target forced on the ship for that tactic this round, or the only PC ship in the fight, and asks otherwise.
 * Cruel Taunt always asks for the Average or Hard DC.
 * @param {string} tactic
 * @param {object} options
 * @param {boolean} options.pcTarget Whether the tactic targets a PC ship.
 * @param {string[]} options.pcShips The PC ships still in the fight.
 * @param {{tactic: string, targetShip?: string, round: number}|null} [options.forced] The ship's forcedTactic.
 * @param {number} options.round
 * @returns {{targetId: string|null, askTarget: boolean, askChoice: boolean}}
 */
export function tacticPrompt(tactic, { pcTarget, pcShips, forced, round }) {
    const askChoice = tactic === "cruelTaunt";
    if (!pcTarget) return { targetId: null, askTarget: false, askChoice };
    const forcedTarget = forced?.round === round && forced.tactic === tactic && pcShips.includes(forced.targetShip)
        ? forced.targetShip
        : null;
    if (forcedTarget) return { targetId: forcedTarget, askTarget: false, askChoice };
    if (pcShips.length === 1) return { targetId: pcShips[0], askTarget: false, askChoice };
    return { targetId: null, askTarget: pcShips.length > 1, askChoice };
}
