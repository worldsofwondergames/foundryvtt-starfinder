function firstName(items, type) {
    const found = (items ?? []).find(item => item.type === type);
    return found ? found.name : null;
}

/**
 * Gathers the input for deriveNarrativeStats from a starship's system data and items.
 * @param {object} system The starship's system data.
 * @param {Array<{type: string, name: string}>} items The ship's items.
 * @param {boolean} useAlternate Use the alternate skill DC table.
 * @returns {object}
 */
export function narrativeInputFromShip(system, items, useAlternate) {
    const crewSkillMods = [];
    const npcData = system.crew?.npcData ?? {};
    for (const role of Object.values(npcData)) {
        for (const [key, skill] of Object.entries(role?.skills ?? {})) {
            if (key.replace(/\d+/g, "") === "gun") continue;
            const mod = skill?.mod;
            if (typeof mod !== "number" || Number.isNaN(mod)) continue;
            crewSkillMods.push(mod);
        }
    }

    const narrative = system.narrative ?? {};
    return {
        tier: system.details.tier,
        size: system.details.size,
        isPC: !system.crew.useNPCCrew,
        armorName: firstName(items, "starshipArmor"),
        defensesName: firstName(items, "starshipDefensiveCountermeasure"),
        shieldName: firstName(items, "starshipShield"),
        crewSkillMods,
        overrides: {
            averageDC: narrative.averageDC,
            hardDC: narrative.hardDC,
            hpMax: narrative.hp?.max,
            threshold: narrative.threshold,
            skillBonus: narrative.skillBonus
        },
        useAlternate
    };
}
