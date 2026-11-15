import { DiceSFRPG } from "../dice.js";
import RollContext from "../rolls/rollcontext.js";
import { RPC } from "../rpc.js";
import { actionNeeds, applyCrewAction, grantsSuccesses, rollBonuses, rolesOf } from "../rules/narrative-starship/apply-crew-action.js";
import { NARRATIVE_CREW_ACTIONS, RANGED_ATTACK_BONUS, actionsForRoles, skillLockedFor } from "../rules/narrative-starship/crew-actions.js";
import { modifiersFor } from "../rules/narrative-starship/state.js";
import { canUseTrackingWeapons, hasUpgrade } from "../rules/narrative-starship/upgrades.js";
import { crewActionDC, crewByShip, shipActor, usableSkills } from "../system/narrative-starship-combat.js";

const LABEL = "SFRPG.NarrativeStarship.";
const FREE_PATCH = "patchHull:free";

function skillName(actor, key) {
    if (key === "rangedAttack") return game.i18n.localize(LABEL + "RangedAttack");
    const base = game.i18n.localize(CONFIG.SFRPG.skills[key.substring(0, 3)] ?? key);
    const subname = key.startsWith("pro") ? actor.system.skills?.[key]?.subname : "";
    return subname ? `${base} (${subname})` : base;
}

function preferredText(action) {
    if (action.preferred === "any") return game.i18n.localize(LABEL + "Dialog.AnySkill");
    return action.preferred.map(key => (key === "rangedAttack"
        ? game.i18n.localize(LABEL + "RangedAttack")
        : game.i18n.localize(CONFIG.SFRPG.skills[key] ?? key))).join(", ");
}

/**
 * Skills the crew member can roll. Trained-only skills they have no ranks in are left out. The skills used last
 * round start disabled; updateRows enables or disables them for the chosen action.
 */
function skillOptions(actor, roles, usedLastRound) {
    const skills = usableSkills(actor)
        .map(key => ({ value: key, label: skillName(actor, key) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    if (roles.includes("gunner")) skills.unshift({ value: "rangedAttack", label: skillName(actor, "rangedAttack") });
    for (const skill of skills) skill.disabled = usedLastRound.includes(skill.value);
    return skills;
}

/**
 * Rolls the crew member's check with the ship's skill modifier and the round's bonuses as named parts.
 * No take 10 or take 20. Returns the Roll, or null if the roll dialog was closed.
 */
async function rollCrewCheck({ actor, ship, skillKey, bonuses, free, title }) {
    const parts = skillKey === "rangedAttack"
        ? [
            "@attributes.baseAttackBonus.value",
            "@abilities.dex.mod",
            { score: RANGED_ATTACK_BONUS, explanation: game.i18n.localize(LABEL + "RollParts.RangedAttack") }
        ]
        : [`@skills.${skillKey}.mod`];
    const shipModifier = skillKey === "rangedAttack" ? 0 : Number(ship.system.narrative?.skillModifiers?.[skillKey.substring(0, 3)] ?? 0);
    if (shipModifier) parts.push({ score: shipModifier, explanation: game.i18n.localize(LABEL + "RollParts.Ship") });
    for (const part of bonuses.parts) {
        parts.push({ score: part.value, explanation: game.i18n.localize(`${LABEL}RollParts.${part.kind}`) });
    }
    if (free) parts.push({ score: -2, explanation: game.i18n.localize(LABEL + "RollParts.FreePatchHull") });

    const result = await DiceSFRPG.d20Roll({
        rollContext: RollContext.createActorRollContext(actor),
        parts,
        title,
        speaker: ChatMessage.getSpeaker({ actor }),
        chatMessage: false,
        advantage: false,
        rollType: "skillCheck",
        mainDie: bonuses.rollTwice ? "2d20kh" : "1d20"
    });
    return result?.roll ?? null;
}

/**
 * Asks the player whether to use Tracking Weapons on a failed check.
 * @returns {Promise<boolean>}
 */
async function askTrackingWeapons(total, dc) {
    const answer = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize(LABEL + "Upgrades.trackingWeapons.Name") },
        content: `<p>${game.i18n.format(LABEL + "Dialog.TrackingAsk", { total, dc })}</p>`,
        yes: { label: game.i18n.localize(LABEL + "Dialog.TrackingReroll") },
        rejectClose: false
    });
    return answer === true;
}

/** Shows the rows the chosen action needs, and disables the skills the same-skill rule stops for it. */
function updateRows(form, usedLastRound) {
    const option = form.elements.actionKey.selectedOptions[0];
    const skillSelect = form.elements.skillKey;
    for (const skill of skillSelect.options) skill.disabled = skillLockedFor(option?.value, skill.value, usedLastRound);
    if (skillSelect.selectedOptions[0]?.disabled) {
        const open = [...skillSelect.options].find(skill => !skill.disabled);
        if (open) skillSelect.value = open.value;
    }
    const needs = JSON.parse(option?.dataset.needs ?? "{}");
    const resolve = form.elements.spentResolve.checked;
    const show = {
        enemy: needs.enemy || (needs.resolveEnemy && resolve),
        secondEnemy: needs.secondEnemy && resolve,
        ally: needs.ally === "always" || (needs.ally === "resolve" && resolve),
        secondAlly: needs.secondAlly && resolve,
        targetAction: needs.targetAction,
        resolve: option?.dataset.resolve === "true",
        mineLayer: needs.enemy && option?.value !== "clearTakeCover",
        navScram: needs.enemy && option?.value !== "clearTakeCover"
    };
    if (!show.resolve) form.elements.spentResolve.checked = false;
    for (const row of form.querySelectorAll(".nca-row")) row.hidden = !show[row.dataset.row];
    form.querySelector(".nca-preferred").textContent = game.i18n.format(LABEL + "Dialog.Preferred", {
        skills: option?.dataset.preferred ?? ""
    });
}

/**
 * Opens the crew action dialog for a crew member, rolls the check, and sends it to the GM.
 * @param {object} options
 * @param {Combat} options.combat The narrative combat.
 * @param {Actor} options.ship The crew member's ship.
 * @param {Actor} options.actor The crew member.
 * @param {string} options.role The role the Act button was clicked for.
 */
export async function openNarrativeCrewActionDialog({ combat, ship, actor, role }) {
    const state = combat.getFlag("sfrpg", "narrative");
    if (!state) return;
    const round = combat.round;
    const crew = crewByShip(combat, state);
    const shipCrew = crew[ship.id] ?? {};
    const roles = rolesOf(shipCrew, actor.id);
    if (roles.length === 0) return;

    const actions = actionsForRoles(roles).map(key => ({
        value: key,
        label: game.i18n.localize(`${LABEL}CrewActions.${key}.Name`),
        needs: JSON.stringify(actionNeeds(key)),
        resolve: Boolean(NARRATIVE_CREW_ACTIONS[key].resolve),
        preferred: preferredText(NARRATIVE_CREW_ACTIONS[key])
    }));
    if (roles.includes("engineer") && modifiersFor(state, actor.id, "freePatchHull", round) > 0) {
        actions.push({
            value: FREE_PATCH,
            label: game.i18n.localize(LABEL + "Dialog.FreePatchHull"),
            needs: JSON.stringify(actionNeeds("patchHull")),
            resolve: false,
            preferred: preferredText(NARRATIVE_CREW_ACTIONS.patchHull)
        });
    }
    // Actions for the clicked role first.
    actions.sort((a, b) => Number(NARRATIVE_CREW_ACTIONS[b.value]?.role === role) - Number(NARRATIVE_CREW_ACTIONS[a.value]?.role === role));

    const enemies = Object.entries(state.ships)
        .filter(([, s]) => s.side === "enemy" && !s.flags.includes("out"))
        .map(([id]) => ({ id, name: shipActor(combat, id)?.name ?? id }));
    const allies = [...new Set(Object.values(shipCrew).flat())].map(id => {
        const ally = game.actors.get(id);
        const allyRoles = rolesOf(shipCrew, id).map(r => game.i18n.localize(`${LABEL}Roles.${r}`))
            .join(", ");
        return { id, label: `${ally?.name ?? id} (${allyRoles})` };
    });
    const successActions = Object.keys(NARRATIVE_CREW_ACTIONS).filter(grantsSuccesses)
        .map(key => ({ value: key, label: game.i18n.localize(`${LABEL}CrewActions.${key}.Name`) }));
    const usedLastRound = state.skillsLastRound?.[actor.id] ?? [];
    const resolveValue = actor.system.attributes?.rp?.value ?? 0;
    // Once-per-combat upgrades the crew can use with an action that targets an enemy ship.
    const upgrades = ship.system.narrative?.upgrades;
    const usedOnce = state.usedOnce?.[ship.id] ?? [];
    const unused = key => hasUpgrade(upgrades, key) && !usedOnce.includes(key);

    const content = await foundry.applications.handlebars.renderTemplate("systems/sfrpg/templates/apps/narrative-crew-action.hbs", {
        actions,
        enemies,
        allies,
        successActions,
        skills: skillOptions(actor, roles, usedLastRound),
        lastSkillLabel: usedLastRound.map(key => skillName(actor, key)).join(", "),
        hasResolve: resolveValue > 0,
        resolveValue,
        mineLayer: unused("mineLayer"),
        navScram: unused("navScramModule")
    });

    const data = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.format(LABEL + "Dialog.Title", { name: actor.name }) },
        content,
        buttons: [{
            action: "roll",
            label: game.i18n.localize(LABEL + "Dialog.Roll"),
            icon: "fas fa-dice-d20",
            default: true,
            callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
        }],
        render: (event, dialog) => {
            const form = dialog.element.querySelector("form");
            form.addEventListener("change", () => updateRows(form, usedLastRound));
            updateRows(form, usedLastRound);
        },
        rejectClose: false
    });
    if (!data || typeof data !== "object") return;

    const free = data.actionKey === FREE_PATCH;
    const actionKey = free ? "patchHull" : data.actionKey;
    const action = NARRATIVE_CREW_ACTIONS[actionKey];
    const needs = actionNeeds(actionKey);
    const spentResolve = Boolean(data.spentResolve);
    const payload = {
        combatId: combat.id,
        shipId: ship.id,
        actorId: actor.id,
        role: action.role === "any" ? role : action.role,
        actionKey,
        targetId: needs.enemy || (needs.resolveEnemy && spentResolve) ? data.targetId : undefined,
        secondTargetId: needs.secondEnemy && spentResolve ? data.secondTargetId : undefined,
        allyId: needs.ally === "always" || (needs.ally === "resolve" && spentResolve) ? data.allyId : undefined,
        secondAllyId: needs.secondAlly && spentResolve ? data.secondAllyId : undefined,
        targetAction: needs.targetAction ? data.targetAction : undefined,
        skillKey: data.skillKey,
        spentResolve,
        free,
        mineLayer: needs.enemy && actionKey !== "clearTakeCover" && unused("mineLayer") && Boolean(data.mineLayer),
        navScram: needs.enemy && actionKey !== "clearTakeCover" && unused("navScramModule") && Boolean(data.navScram)
    };

    // Catch a refused action before the roll. The GM checks again with the real roll.
    const check = applyCrewAction(state, { ...payload, total: 0, dc: 1, actorResolve: resolveValue, actorSkills: usableSkills(actor), crew }, round);
    const rejected = check.effects.find(e => e.kind === "rejected");
    if (rejected) {
        ui.notifications.warn(game.i18n.localize(`${LABEL}Rejected.${rejected.reason}`));
        return;
    }

    const bonuses = rollBonuses(state, { shipId: ship.id, actorId: actor.id, actionKey, targetId: payload.targetId }, round);
    const rollOnce = () => rollCrewCheck({
        actor,
        ship,
        skillKey: payload.skillKey,
        bonuses,
        free,
        title: game.i18n.format(LABEL + "Dialog.RollTitle", {
            action: game.i18n.localize(`${LABEL}CrewActions.${actionKey}.Name`),
            skill: skillName(actor, payload.skillKey)
        })
    });
    let roll = await rollOnce();
    if (!roll) return;

    // Tracking Weapons: a gunner may reroll a failed check against an enemy ship once per combat.
    const dc = crewActionDC(combat, state, payload);
    const failed = dc !== null && roll.total < dc;
    if (failed && canUseTrackingWeapons(state, { ...payload, success: false }, upgrades) && await askTrackingWeapons(roll.total, dc)) {
        const reroll = await rollOnce();
        if (reroll) {
            roll = reroll;
            payload.trackingWeapons = true;
        }
    }

    const status = RPC.sendMessageTo("gm", "narrativeCrewAction", { ...payload, total: roll.total, roll: roll.toJSON() });
    if (status === "errorRecipientNotAvailable") ui.notifications.warn(game.i18n.localize(LABEL + "Rejected.noGM"));
}
