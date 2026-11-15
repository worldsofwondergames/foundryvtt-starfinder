/**
 * Crew action data and rules for narrative starship combat (Starfinder Enhanced pp. 179-183).
 * Pure data and functions. The dialog and roll handler build on this.
 */

/** Bonus a gunner gets on a ranged attack made as a crew action. */
export const RANGED_ATTACK_BONUS = 3;

export const NARRATIVE_ROLES = ["any", "captain", "chiefMate", "engineer", "gunner", "magicOfficer", "pilot", "scienceOfficer"];

function entry(role, preferred, hardAlways, dcOf, effect, resolve = null) {
    return { role, preferred, hardAlways, dcOf, effect, resolve };
}

/**
 * Preferred skills use the system skill keys. "pro" is Profession (captain). "rangedAttack" is the gunner's
 * ranged attack option. "any" means every skill is preferred.
 * hardAlways means the book says "Hard DC (regardless of the skill used)".
 * dcOf is "own" when the text says "your ship's DC" and "target" when it says "that ship's DC".
 * effect and resolve are keys for the action handler.
 */
export const NARRATIVE_CREW_ACTIONS = {
    // Any crew member
    provideAid: entry("any", "any", false, "own", "aidBonus", "aidSecondCrew"),

    // Captain
    enactCunningStratagem: entry("captain", ["pil", "pro", "ste"], false, "target", "successes"),
    encourageCrewMember: entry("captain", ["cul", "dip", "int"], false, "own", "regainResolve", "regainResolveSecond"),
    giveOrders: entry("captain", "any", true, "own", "extraAction", "secondActionBonus"),
    tauntEnemy: entry("captain", ["blu", "int", "sen"], false, "target", "successes"),

    // Chief mate
    accessMaintenancePanels: entry("chiefMate", ["acr", "ath", "eng"], false, "own", "rollTwice", "rollTwiceSecond"),
    derideEnemyShip: entry("chiefMate", ["eng", "int", "phs"], false, "target", "successes"),
    maximizeCrewEfficiency: entry("chiefMate", "any", true, "own", "doubleNextSuccesses", "nextActionBonus"),
    realignTargetingSystems: entry("chiefMate", ["acr", "ath", "per"], false, "target", "successes"),

    // Engineer
    engageExperimentalPrototype: entry("engineer", "any", true, "own", "doubleActionSuccesses", "rollActionTwice"),
    overpowerSystems: entry("engineer", ["com", "eng"], false, "target", "successes"),
    patchHull: entry("engineer", ["ath", "eng", "phs"], false, "own", "heal", "hardDCNextRound"),
    ventThrusterWaste: entry("engineer", ["eng", "phs"], false, "target", "successes"),

    // Gunner
    drawFire: entry("gunner", ["ath", "int", "rangedAttack"], false, "target", "forceOpenFire", "enemyRollsTwice"),
    fireAtWill: entry("gunner", ["acr", "pil", "rangedAttack"], false, "target", "successes"),
    harryEnemy: entry("gunner", ["blu", "pil", "rangedAttack"], false, "target", "penalizeEnemy", "penalizeSecondEnemy"),
    targetWeakSpot: entry("gunner", "any", true, "target", "extraHitOnMargin"),

    // Magic officer
    channelEldritchEnergy: entry("magicOfficer", "any", true, "target", "reduceThresholdOnMargin"),
    empowerCrew: entry("magicOfficer", ["dip", "lsc", "mys"], false, "own", "crewBonus", "countsAsSuccess"),
    prognosticate: entry("magicOfficer", ["cul", "mys", "sen"], false, "target", "forceTacticReveal", "secondTargetBonus"),
    scryOnEnemy: entry("magicOfficer", ["mys", "per"], false, "target", "successes"),

    // Pilot
    engageFullThrusters: entry("pilot", ["acr", "eng", "pil"], false, "target", "hardDCForEnemy", "deeperPenalty"),
    holdSteady: entry("pilot", ["ath", "per", "pil"], false, "target", "gunnerBonus", "secondGunnerBonus"),
    outmaneuver: entry("pilot", ["acr", "pil"], false, "target", "successes"),
    performAudaciousStunt: entry("pilot", "any", true, "target", "successes"),
    // Not a book crew action: the special Piloting check from the Take Cover tactic (EN p. 179). It gives no successes.
    clearTakeCover: entry("pilot", ["pil"], true, "target", "clearTakeCover"),

    // Science officer
    improveCountermeasures: entry("scienceOfficer", ["com", "eng", "phs"], false, "own", "ownDCHard", "freePatchHull"),
    scanEnemy: entry("scienceOfficer", ["com", "per"], false, "target", "successes"),
    searchDatabase: entry("scienceOfficer", ["com", "cul", "pil"], false, "target", "searchBonus", "countsAsSuccess"),
    targetSystem: entry("scienceOfficer", "any", true, "target", "extraHitIfHit", "countsAsSuccess")
};

/** Actions that give 1 success, or 2 when the check beats the DC by 5 or more. */
const MARGIN_SUCCESS_ACTIONS = new Set([
    "enactCunningStratagem",
    "tauntEnemy",
    "derideEnemyShip",
    "realignTargetingSystems",
    "overpowerSystems",
    "ventThrusterWaste",
    "fireAtWill",
    "scryOnEnemy",
    "outmaneuver",
    "scanEnemy"
]);

/** Actions that give 1 success. Their margin bonuses are effects, not successes. */
const SINGLE_SUCCESS_ACTIONS = new Set(["targetWeakSpot", "channelEldritchEnergy"]);

function isPreferred(preferred, skillKey) {
    if (preferred === "any") return true;
    // Profession (captain) is "pro". A character's Profession skills are pro, pro0, pro1 and so on.
    if (preferred.includes("pro") && typeof skillKey === "string" && skillKey.startsWith("pro")) return true;
    return preferred.includes(skillKey);
}

/**
 * The DC a crew check is rolled against.
 * @param {object} action An entry of NARRATIVE_CREW_ACTIONS.
 * @param {string} skillKey The skill the player chose.
 * @param {{average: number, hard: number}} dcs The DCs of the ship the action's DC comes from.
 * @param {boolean} [forceHard] An enemy tactic makes this check use the Hard DC (see forceHardFor in tactics.js).
 * @returns {number}
 */
export function dcFor(action, skillKey, dcs, forceHard = false) {
    if (forceHard || action.hardAlways) return dcs.hard;
    return isPreferred(action.preferred, skillKey) ? dcs.average : dcs.hard;
}

/**
 * Skill check successes an action gives toward a threshold.
 * Actions whose success depends on spending Resolve return 0 here; the handler adds the success.
 * @param {string} actionKey
 * @param {number} total The roll total.
 * @param {number} dc
 * @returns {number}
 */
export function successesFor(actionKey, total, dc) {
    if (total < dc) return 0;
    if (MARGIN_SUCCESS_ACTIONS.has(actionKey)) return total - dc >= 5 ? 2 : 1;
    if (actionKey === "performAudaciousStunt") return 2;
    if (SINGLE_SUCCESS_ACTIONS.has(actionKey)) return 1;
    return 0;
}

/**
 * A crew member must pick a different skill than the ones they used the previous round.
 * @param {string} actorId
 * @param {string} skillKey
 * @param {Object<string, string[]>} skillsLastRound
 * @returns {boolean}
 */
export function skillAllowed(actorId, skillKey, skillsLastRound) {
    return !(skillsLastRound?.[actorId] ?? []).includes(skillKey);
}

/**
 * Keys of the actions open to the given roles. Actions for any crew member are always included.
 * @param {string[]} roles
 * @returns {string[]}
 */
export function actionsForRoles(roles) {
    return Object.keys(NARRATIVE_CREW_ACTIONS).filter(key => {
        const role = NARRATIVE_CREW_ACTIONS[key].role;
        return role === "any" || roles.includes(role);
    });
}
