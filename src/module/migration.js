import SFRPGModifier from "./modifiers/modifier.js";
import { SFRPGEffectType, SFRPGModifierType, SFRPGModifierTypes } from "./modifiers/types.js";
import { weaponCoreItemUpdate, weaponCoreTemplate } from "./rules/weapon-core.js";
import { toughArmsHpGain, toughArmsTemplate, toughArmsUpdate } from "./rules/mech-limb-hp.js";
import { compendiumMpCosts, correctedMpCost } from "./rules/mech-points.js";

const SFRPGMigrationSchemas = Object.freeze({
    NPC_DATA_UPATE: 0.001,
    THE_PAINFUL_UPDATE: 0.002, // Due to copyright concerns, all references to Starfinder were renamed to SFRPG
    THE_HAPPY_UPDATE: 0.003, // Due to Paizo clarifying their stance, most references to SFRPG were returned to Starfinder
    THE_ACTOR_SPEED_UPDATE: 0.004,
    DAMAGE_TYPE_REFACTOR: 0.005,
    DAMAGE_REDUCTION_REFACTOR: 0.006,
    THE_WEBP_UPDATE: 0.008, // We changed all icons from .png to .webp
    THE_GUNNERY_UPDATE: 0.009, // Since Gunnery is now a selectable skill for NPC starships, migrate an NPC gunner's ranks in Piloting (the previous hacky solution) to their modifier in Gunnery.
    MECH_ACTIONS_SYNC: 0.010, // Sync mech component actions from compendium to actor items that were imported before actions were added.
    WEAPON_CORE_ENERGY_TYPES: 0.011, // Mark Weapon Core as choosing two energy types, reading them from names such as "Weapon Core (Cold, Fire)".
    TOUGH_ARMS_HP: 0.012, // Give every Tough Arms the compendium's +1 Hit Point per tier in place of a flat +1.
    MECH_MP_COSTS: 0.013 // Give copies of auxiliary systems, power cores and upgrades the compendium's Mech Point cost.
});

/** The compendium's Mech Point costs, read once when a world migrates past MECH_MP_COSTS. */
let mechMpCosts = null;

/**
 * @returns {Promise<Boolean>} Whether a refresh is required as a result of a migration.
 */
export default async function migrateWorld() {
    const systemVersion = game.system.version;
    const worldSchema = game.settings.get('sfrpg', 'worldSchemaVersion') ?? 0;

    const notif = ui.notifications.info(game.i18n.format("SFRPG.MigrationBeginingMigration", { systemVersion }), { permanent: true });

    if (worldSchema < SFRPGMigrationSchemas.MECH_MP_COSTS) {
        const pack = game.packs.get("sfrpg.mech-components");
        const index = await pack?.getIndex({ fields: ["system.mpCost"] });
        mechMpCosts = index ? compendiumMpCosts(index) : null;
    }

    // Tokens go before the actors they come from. An unlinked token reads its
    // items from its actor, so once the actor is migrated the token's items
    // already look migrated, and a step that works out a change from the old
    // values, such as the Hit Points Tough Arms add, finds nothing to change.
    for (const scene of game.scenes) {
        for (const token of scene.tokens) {
            try {
                const tokenUpdateData = await migrateToken(token, worldSchema);
                if (!foundry.utils.isEmpty(tokenUpdateData)) {
                    console.log(`Starfinder | Migrating Token entity ${token.name}`);
                    await token.update(tokenUpdateData, { enforceTypes: false });
                }
            } catch (err) {
                console.error(err);
            }
        }
    }

    for (const actor of game.actors.contents) {
        try {
            const updateData = await migrateActor(actor, worldSchema);
            if (!foundry.utils.isEmpty(updateData)) {
                console.log(`Starfinder | Migrating Actor entity ${actor.name}`);
                await actor.update(updateData, { enforceTypes: false });
            }
        } catch (err) {
            console.error(err);
        }
    }

    for (const item of game.items.contents) {
        try {
            const updateData = await migrateItem(item, worldSchema);
            if (!foundry.utils.isEmpty(updateData)) {
                console.log(`Starfinder | Migrating Item entity ${item.name}`);
                await item.update(updateData, { enforceTypes: false });
            }
        } catch (err) {
            console.error(err);
        }
    }

    for (const message of game.messages) {
        try {
            const updateData = await migrateChatMessage(message, worldSchema);
            if (!foundry.utils.isEmpty(updateData)) {
                console.log(`Starfinder | Migrating Chat message entity ${message.id}`);
                await message.update(updateData, { enforceTypes: false });
            }
        } catch (err) {
            console.error(err);
        }
    }

    for (const macro of game.macros) {
        try {
            const updateData = await migrateMacro(macro, worldSchema);
            if (!foundry.utils.isEmpty(updateData)) {
                console.log(`Starfinder | Migrating Macro entity ${macro.name}`);
                await macro.update(updateData, { enforceTypes: false });
            }
        } catch (err) {
            console.error(err);
        }
    }

    for (const pack of game.packs) {
        if (pack.collection.startsWith("world")) {
            const wasLocked = pack.locked;
            // Unlock pack if needed
            if (pack.locked) {
                pack.configure({locked: false});
            }

            if (worldSchema < SFRPGMigrationSchemas.THE_WEBP_UPDATE) {
                if (pack.documentName === "Actor") {
                    await pack.updateAll(migrateCompendiumActorToWebP);
                } else if (pack.documentName === "Item") {
                    await pack.updateAll(migrateCompendiumItemToWebP);
                }
            }

            // Lock pack if it was locked.
            if (wasLocked) {
                pack.configure({locked: true});
            }
        }
    }

    const systemSchema = Number(game.system.flags.sfrpg.schema);
    await game.settings.set('sfrpg', 'worldSchemaVersion', systemSchema);
    ui.notifications.info(game.i18n.format("SFRPG.MigrationEndMigration", { systemVersion }), { permanent: true });
    ui.notifications.remove(notif);

    if (worldSchema < SFRPGMigrationSchemas.THE_GUNNERY_UPDATE) {
        return true;
    }

    return false;
}

const migrateItem = async function(item, schema) {
    const updateData = {};
    const itemData = item.data;

    if (schema < SFRPGMigrationSchemas.DAMAGE_TYPE_REFACTOR) _migrateDamageTypes(itemData, updateData);
    if (schema < SFRPGMigrationSchemas.THE_WEBP_UPDATE) _migrateDocumentIconToWebP(itemData, updateData);
    if (schema < SFRPGMigrationSchemas.WEAPON_CORE_ENERGY_TYPES) _migrateWeaponCore(item, updateData);
    if (schema < SFRPGMigrationSchemas.TOUGH_ARMS_HP) _migrateToughArms(item, updateData);
    if (schema < SFRPGMigrationSchemas.MECH_MP_COSTS && mechMpCosts) _migrateMechMpCost(item, updateData);

    return updateData;
};

/**
 * Give a copy of an auxiliary system, power core or upgrade, and each such
 * template inside a mission pod, the compendium's Mech Point cost. Older copies
 * charged auxiliary systems 1 or 2 MP and left power cores free.
 *
 * @param {Item} item
 * @param {object} updateData
 */
const _migrateMechMpCost = function(item, updateData) {
    const mpCost = correctedMpCost(item, mechMpCosts);
    if (mpCost !== null) updateData["system.mpCost"] = mpCost;

    if (item.type === "mechMissionPod" && Array.isArray(item.system?.itemTemplates)) {
        const current = updateData["system.itemTemplates"] ?? item.system.itemTemplates;
        let changed = false;
        const templates = current.map(template => {
            const templateCost = correctedMpCost(template, mechMpCosts);
            if (templateCost === null) return template;
            changed = true;
            return { ...template, system: { ...template.system, mpCost: templateCost } };
        });
        if (changed) updateData["system.itemTemplates"] = templates;
    }
};

/**
 * Raise a mech's current Hit Points by what its Tough Arms gain, read before the
 * item itself is migrated, so a mech at full stays at full and any damage taken
 * stays the same.
 *
 * @param {Actor} actor The mech.
 * @param {object} updateData
 */
const _migrateToughArmsCurrentHp = function(actor, updateData) {
    const tier = actor.system.details?.tier ?? 0;
    const gain = actor.items.reduce((sum, item) => sum + toughArmsHpGain(item, tier), 0);
    if (!gain) return;

    const current = Number(actor.system.attributes?.hp?.value) || 0;
    updateData["system.attributes.hp.value"] = Math.max(0, current + gain);
};

/**
 * Give every Tough Arms, and the Tough Arms template inside a mission pod, the
 * compendium's +1 Hit Point per tier.
 *
 * @param {Item} item
 * @param {object} updateData
 */
const _migrateToughArms = function(item, updateData) {
    Object.assign(updateData, toughArmsUpdate(item));

    if (item.type === "mechMissionPod" && Array.isArray(item.system?.itemTemplates)) {
        const current = updateData["system.itemTemplates"] ?? item.system.itemTemplates;
        let changed = false;
        const templates = current.map(template => {
            const updated = toughArmsTemplate(template);
            if (updated) changed = true;
            return updated ?? template;
        });
        if (changed) updateData["system.itemTemplates"] = templates;
    }
};

/**
 * Mark a Weapon Core as choosing energy types, and give a mission pod's Weapon
 * Core template the same, so the copies made before the field existed hold
 * their types.
 *
 * @param {Item} item
 * @param {object} updateData
 */
const _migrateWeaponCore = function(item, updateData) {
    const allowed = Object.keys(CONFIG.SFRPG.energyDamageTypes);
    Object.assign(updateData, weaponCoreItemUpdate(item, allowed));

    if (item.type === "mechMissionPod" && Array.isArray(item.system?.itemTemplates)) {
        let changed = false;
        const templates = item.system.itemTemplates.map(template => {
            const updated = weaponCoreTemplate(template, allowed);
            if (updated) changed = true;
            return updated ?? template;
        });
        if (changed) updateData["system.itemTemplates"] = templates;
    }
};

const migrateCompendiumItemToWebP = async function(itemDocument) {
    return migrateItem(itemDocument, SFRPGMigrationSchemas.THE_WEBP_UPDATE - 0.001);
};

const migrateActor = async function(actor, schema) {
    const updateData = {};
    const speedActorTypes = ['character', 'npc', 'npc2', 'drone'];
    const actorData = actor;

    if (schema < SFRPGMigrationSchemas.NPC_DATA_UPATE && actorData.type === 'npc')
        _migrateNPCData(actorData, updateData);
    if (schema < SFRPGMigrationSchemas.THE_PAINFUL_UPDATE)
        _resetActorFlags(actorData, updateData);
    if (schema < SFRPGMigrationSchemas.THE_HAPPY_UPDATE && actorData.type === 'character')
        _migrateActorAbilityScores(actorData, updateData);
    if (schema < SFRPGMigrationSchemas.THE_ACTOR_SPEED_UPDATE && speedActorTypes.includes(actorData.type))
        _migrateActorSpeed(actorData, updateData);
    if (schema < SFRPGMigrationSchemas.DAMAGE_REDUCTION_REFACTOR)
        _migrateActorDamageReductions(actorData, updateData);
    if (schema < SFRPGMigrationSchemas.THE_WEBP_UPDATE)
        _migrateDocumentIconToWebP(actorData, updateData);
    if (schema < SFRPGMigrationSchemas.THE_GUNNERY_UPDATE && actorData.type === 'starship' && actorData.system.crew.useNPCCrew)
        _migrateStarshipGunnerySkill(actorData, updateData);
    if (schema < SFRPGMigrationSchemas.MECH_ACTIONS_SYNC && actorData.type === 'mech')
        await _migrateMechComponentActions(actor);
    if (schema < SFRPGMigrationSchemas.TOUGH_ARMS_HP && actorData.type === 'mech')
        _migrateToughArmsCurrentHp(actor, updateData);

    for (const item of actor.items) {
        const itemUpdateData = await migrateItem(item, schema);
        if (!foundry.utils.isEmpty(itemUpdateData)) {
            console.log(`Starfinder | Migrating Actor Item ${item.name}`);
            await item.update(itemUpdateData, { enforceTypes: false });
        }
    }

    return updateData;
};

const migrateCompendiumActorToWebP = async function(actorDocument) {
    return migrateActor(actorDocument, SFRPGMigrationSchemas.THE_WEBP_UPDATE - 0.001);
};

const migrateToken = async function(token, schema) {
    const updateData = {};
    const tokenData = token;

    if (schema < SFRPGMigrationSchemas.THE_WEBP_UPDATE) {
        _migrateDocumentIconToWebP(tokenData, updateData);

        if (tokenData.flags.sfrpg?.itemCollection) {
            try {
                const flatCollection = JSON.stringify(tokenData.flags.sfrpg.itemCollection);
                const convertedCollection = _migrateStringContentToWebP(flatCollection);
                const jsonCollection = JSON.parse(convertedCollection);
                updateData['flags.sfrpg.itemCollection'] = jsonCollection;
            } catch {
                console.log(`Failed to convert items for ${token.name} in scene ${token.scene.name}`);
            }
        }
    }

    const actor = token.actor;
    if (!token.actorLink && actor) {
        const actorUpdateData = await migrateActor(actor, schema);
        if (!foundry.utils.isEmpty(actorUpdateData)) {
            console.log(`Starfinder | Migrating Token Actor ${actor.name}`);
            await actor.update(actorUpdateData, { enforceTypes: false });
        }
    }

    return updateData;
};

const migrateChatMessage = async function(message, schema) {
    const updateData = {};
    const messageData = message;

    if (schema < SFRPGMigrationSchemas.THE_WEBP_UPDATE) _migrateChatMessageContentToWebP(messageData, updateData);

    return updateData;
};

const migrateMacro = async function(macro, schema) {
    const updateData = {};
    const macroData = macro;

    if (schema < SFRPGMigrationSchemas.THE_WEBP_UPDATE) _migrateDocumentIconToWebP(macroData, updateData);

    return updateData;
};

const damageTypeMigrationCallback = function(arr, curr) {
    if (!Array.isArray(curr)) {
        arr.push(curr);
        return arr;
    }
    const [formula, type] = curr;

    if (!type) {
        arr.push({ "formula": formula || "", "types": {}, "operator": "" });
    } else if (type.includes("+")) {
        const types = type.split("+");
        arr.push({ "formula": formula, "types": { [types[0]]: true, [types[1]]: true }, "operator": "and" });
    } else if (type.includes("|")) {
        const types = type.split("|");
        arr.push({ "formula": formula, "types": { [types[0]]: true, [types[1]]: true }, "operator": "or" });
    } else {
        arr.push({ "formula": formula, "types": { [type]: true }, "operator": "" });
    }

    return arr;
};

const _migrateDamageTypes = function(item, data) {
    const itemData = foundry.utils.duplicate(item.system);
    const damage = itemData.damage;
    const critical = itemData.critical;

    if (damage?.parts?.length > 0) {
        const parts = damage.parts.reduce(damageTypeMigrationCallback, []);

        data['system.damage.parts'] = parts;
    }

    if (critical?.parts?.length > 0) {
        const parts = critical.parts.reduce(damageTypeMigrationCallback, []);

        data['system.critical.parts'] = parts;
    }

    return data;
};

const _migrateNPCData = function(actor, migratedData) {
    const actorData = foundry.utils.duplicate(actor.system);
    const abilities = actorData.abilities;
    const skills = actorData.skills;

    for (const ability of Object.values(abilities)) {
        if (ability.value)
            ability.mod = Math.floor((ability.value - 10) / 2);
        else ability.mod = 0;
    }

    for (const skill of Object.values(skills)) {
        skill.mod = skill.ranks + skill.misc + actorData.abilities[skill.ability].mod;

        if (skill.misc && skill.misc > 0) skill.enabled = true;
    }

    migratedData['system.abilities'] = abilities;
    migratedData['system.skills'] = skills;

    return migratedData;
};

const _resetActorFlags = function(actor, migratedData) {
    let sfFlags = null;

    if (actor.flags.starfinder) {
        sfFlags = foundry.utils.deepClone(actor.flags.starfinder);
    }

    migratedData["flags.-=starfinder"] = null;
    migratedData["flags.sfrpg"] = sfFlags;

    return migratedData;
};

const _migrateActorAbilityScores = function(actor, migratedData) {
    const actorData = foundry.utils.duplicate(actor.system);
    const abilities = actorData.abilities;

    for (const ability of Object.values(abilities)) {
        ability.base = ability.value || 10;
    }

    migratedData["system.abilities"] = abilities;

    return migratedData;
};

const _migrateActorSpeed = function(actor, migratedData) {
    const actorData = actor.system;

    const speedValue = actorData.attributes.speed?.value;

    let baseSpeed = foundry.utils.deepClone(speedValue);
    if (baseSpeed && isNaN(baseSpeed)) {
        baseSpeed = baseSpeed.replace(/\D/g, '');
        baseSpeed = Number(baseSpeed);
    }

    // If all else fails, forcibly reset it to 30.
    if (!baseSpeed || isNaN(baseSpeed)) {
        baseSpeed = 30;
    }

    const speed = {
        land: { base: 0 },
        flying: { base: 0 },
        swimming: { base: 0 },
        burrowing: { base: 0 },
        climbing: { base: 0 },
        special: actorData.attributes.speed.special,
        mainMovement: "land"
    };

    const lowercaseSpeedValue = ("" + speedValue || "").toLowerCase();
    if (lowercaseSpeedValue.includes("climb")) {
        speed.climbing.base = baseSpeed;
        speed.mainMovement = "climbing";
    } else if (lowercaseSpeedValue.includes("fly")) {
        speed.flying.base = baseSpeed;
        speed.mainMovement = "flying";
    } else if (lowercaseSpeedValue.includes("burrow")) {
        speed.burrowing.base = baseSpeed;
        speed.mainMovement = "burrowing";
    } else if (lowercaseSpeedValue.includes("swim")) {
        speed.swimming.base = baseSpeed;
        speed.mainMovement = "swimming";
    } else {
        speed.land.base = baseSpeed;
        speed.mainMovement = "land";
    }

    migratedData["system.attributes.speed"] = speed;

    return migratedData;
};

// ================== 0.006: Damage Mitigation ==================
const _migrateActorDamageReductions = function(actor, migratedData) {
    const actorData = actor.system;

    const modifiers = foundry.utils.deepClone(migratedData.modifiers ?? actorData.modifiers ?? []);
    let isDirty = false;

    // Process old damage reduction
    if (actorData.traits?.damageReduction) {
        const oldDamageReduction = foundry.utils.deepClone(actorData.traits.damageReduction);
        const oldDamageReductionValue = Number(oldDamageReduction.value);
        if (!Number.isNaN(oldDamageReductionValue) && oldDamageReductionValue > 0) {
            let notes = "";
            if (!oldDamageReduction.negatedBy || oldDamageReduction.negatedBy !== "-") {
                notes = oldDamageReduction.negatedBy;
            }

            const damageReductionModifier = new SFRPGModifier({
                name: "Damage Reduction",
                modifier: oldDamageReductionValue,
                type: SFRPGModifierTypes.UNTYPED,
                modifierType: SFRPGModifierType.CONSTANT,
                effectType: SFRPGEffectType.DAMAGE_REDUCTION,
                valueAffected: "",
                enabled: true,
                source: "Migration",
                notes: notes,
                subtab: "permanent",
                condition: "",
                id: null // Auto-generate
            });

            modifiers.push(damageReductionModifier);

            migratedData["system.traits.damageReduction"] = {value: 0, negatedBy: ""};
            isDirty = true;
            console.log("> Migrated damage reduction.");
        }
    }

    // Process old energy resistances
    const customEnergyResistances = actorData.traits?.dr?.custom;
    const oldEnergyResistances = Object.entries(actorData.traits?.dr?.value ?? []);
    if (oldEnergyResistances.length > 0 || customEnergyResistances) {
        if (oldEnergyResistances.length > 0) {
            for (const [, entries] of oldEnergyResistances) {
                for (const [key, value] of Object.entries(entries)) {
                    const resistanceValue = Number(value);
                    if (Number.isNaN(resistanceValue)) {
                        continue;
                    }

                    const energyResistanceModifier = new SFRPGModifier({
                        name: "Energy Resistance",
                        modifier: resistanceValue,
                        type: SFRPGModifierTypes.UNTYPED,
                        modifierType: SFRPGModifierType.CONSTANT,
                        effectType: SFRPGEffectType.ENERGY_RESISTANCE,
                        valueAffected: key,
                        enabled: true,
                        source: "Migration",
                        notes: "",
                        subtab: "permanent",
                        condition: "",
                        id: null // Auto-generate
                    });
                    modifiers.push(energyResistanceModifier);
                }
            }
        }

        if (customEnergyResistances) {
            const customResistances = customEnergyResistances.trim().split(';');
            for (const customResistance of customResistances) {
                const customSplit = customResistance.trim().split(' ');
                if (customSplit.length === 2) {
                    const notes = customSplit[0];
                    const resistanceValue = Number(customSplit[1]);

                    if (Number.isNaN(resistanceValue)) {
                        continue;
                    }

                    const energyResistanceModifier = new SFRPGModifier({
                        name: "Energy Resistance",
                        modifier: resistanceValue,
                        type: SFRPGModifierTypes.UNTYPED,
                        modifierType: SFRPGModifierType.CONSTANT,
                        effectType: SFRPGEffectType.ENERGY_RESISTANCE,
                        valueAffected: "custom",
                        enabled: true,
                        source: "Migration",
                        notes: notes,
                        subtab: "permanent",
                        condition: "",
                        id: null // Auto-generate
                    });
                    modifiers.push(energyResistanceModifier);
                }
            }
        }

        migratedData["system.traits.dr"] = {value: [], custom: ""};
        isDirty = true;
        console.log("> Migrated energy resistances.");
    }

    if (isDirty) {
        migratedData["system.modifiers"] = modifiers;
    }

    return migratedData;
};

// ================== 0.008: WebP Conversion ==================
function _imageNeedsReplace(imagePath) {
    const fileTypes = [".png", ".PNG", ".jpg", ".JPG", ".jpeg", ".JPEG"];
    for (const fileType of fileTypes) {
        if (imagePath?.endsWith(fileType)) {
            if (imagePath?.includes("systems/sfrpg/")) {
                return fileType;
            }
        }
    }
    return null;
}

// Any reference to a .png or .jpg in systems/sfrpg/ should be replaced with a link to a .webp with the same name
const _migrateDocumentIconToWebP = function(document, data) {
    const imageType = _imageNeedsReplace(document.img);
    if (imageType) {
        data["img"] = document.img.replace(imageType, ".webp");
    }

    const fullBodyImageType = _imageNeedsReplace(document.system?.details?.biography?.fullBodyImage);
    if (fullBodyImageType) {
        data["system.details.biography.fullBodyImage"] = document.system?.details?.biography?.fullBodyImage.replace(fullBodyImageType, ".webp");
    }

    if (document.system?.combatTracker?.visualization?.length > 0) {
        const newVisualization = foundry.utils.deepClone(document.data.combatTracker.visualization);
        let isDirty = false;

        for (const visualization of Object.values(newVisualization)) {
            const visualizationImageType = _imageNeedsReplace(visualization.image);
            if (visualizationImageType) {
                visualization.image = visualization.image.replace(visualizationImageType, ".webp");
                isDirty = true;
            }
        }

        if (isDirty) {
            data["system.combatTracker.visualization"] = newVisualization;
        }
    }

    if (document.data?.description?.value) {
        const description = _migrateStringContentToWebP(document.system.description.value);
        if (document.data.description.value !== description) {
            data["system.description.value"] = description;
        }
    }

    return data;
};

const _migrateChatMessageContentToWebP = function(messageData, data) {

    if (messageData?.content) {
        const content = _migrateStringContentToWebP(messageData.content);
        if (messageData.content !== content) {
            data["content"] = content;
        }
    }

    return data;
};

const _migrateStringContentToWebP = function(string) {
    string = foundry.utils.deepClone(string);
    string = string.replace(/(systems\/sfrpg\/[^"]*).png/gi, "$1.webp");
    string = string.replace(/(systems\/sfrpg\/[^"]*).jpg/gi, "$1.webp");
    return string;
};

// ================== 0.010: Mech Component Actions Sync ==================
const _migrateMechComponentActions = async function(actor) {
    const pack = game.packs.get('sfrpg.mech-components');
    if (!pack) return;

    const compendiumDocs = await pack.getDocuments();
    const mechComponentTypes = ['mechWeapon', 'mechAuxiliary', 'mechUpperLimb', 'mechLowerLimb'];

    for (const item of actor.items) {
        if (!mechComponentTypes.includes(item.type)) continue;

        const actorActions = item.system.actions;
        if (Array.isArray(actorActions) && actorActions.length > 0) continue;

        const compItem = compendiumDocs.find(d => d.name === item.name && d.type === item.type);
        if (!compItem) continue;

        const compActions = compItem.system.actions;
        if (!Array.isArray(compActions) || compActions.length === 0) continue;

        console.log(`Starfinder | Syncing actions for ${item.name} from compendium`);
        await item.update({ 'system.actions': compActions });
    }
};

// ================== 0.009: Starship Gunnery Conversion ==================
const _migrateStarshipGunnerySkill = function(actorData, updateData) {
    const pilRanks = actorData.system.crew.npcData.gunner.skills.pil.ranks;
    if (pilRanks) {
        updateData['system.crew.npcData.gunner.skills.gun.mod'] = pilRanks;
        updateData['system.crew.npcData.gunner.skills.-=pil'] = null;
    }

    return updateData;
};
