import { openNarrativeCrewActionDialog } from "../../apps/narrative-crew-action-dialog.js";
import { openNarrativeTacticsDialog } from "../../apps/narrative-tactics-dialog.js";
import { showStandardSheetToggle } from "../../rules/narrative-starship/mode.js";
import { NARRATIVE_TACTICS } from "../../rules/narrative-starship/tactics.js";
import {
    addCrewMember,
    crewActionDCGroups,
    crewActionGroups,
    hpFromPipClick,
    hpPips,
    narrativeLayout,
    narrativeStatRows,
    normalizeNarrativeFormData,
    skillModifierView,
    tacticDCGroups,
    tacticPrompt
} from "../../rules/narrative-starship/sheet-view.js";
import { clampUpgradeCount, onceButtons, upgradeRows } from "../../rules/narrative-starship/upgrades.js";
import { NARRATIVE_ROLES } from "../../rules/narrative-starship/crew-actions.js";
import {
    actableCrew, effectWithDCs, enemyTacticButtons, narrativeCombatFor, NARRATIVE_COMBAT_TYPE, requestUpgradeUse, runEnemyTactic,
    shipActor, shipDCs, tacticsCombatFor, upgradeButtonsCombatFor
} from "../../system/narrative-starship-combat.js";
import { ActorSheetSFRPGStarship } from "./starship.js";

const DC_GROUP_LABELS = { otherSkills: "OtherSkills", average: "Average", hard: "Hard" };
const DC_CATEGORY_NAMES = { average: "AverageDC", hard: "HardDC" };

/**
 * Labels for DC groups. A group with no known DC, such as a target's DC before any enemy is in a combat with this
 * ship, shows its category name instead of a number.
 * @param {Array<{label: string|null, category: string, dcs: Array<{dc: number, name: string|null}>}>} groups
 */
function dcGroupView(groups) {
    const i18n = key => game.i18n.localize(`SFRPG.NarrativeStarship.Tabs.${key}`);
    return groups.map(group => ({
        label: group.label ? i18n(DC_GROUP_LABELS[group.label]) : "",
        dcs: group.dcs.map(entry => ({ text: game.i18n.format("SFRPG.NarrativeStarship.Tabs.DC", { dc: entry.dc }), name: entry.name })),
        fallback: group.dcs.length ? "" : i18n(DC_CATEGORY_NAMES[group.category])
    }));
}

/** Actor types that can be dropped on a PC ship's narrative crew list. */
const CREW_ACTOR_TYPES = ["character", "drone", "npc", "npc2"];
const LABEL = "SFRPG.NarrativeStarship.";

/**
 * The narrative starship sheet (Starfinder Enhanced pp. 176-184).
 * Shows the EN stat block for NPC ships and a crew view for PC ships.
 * A PC ship has one crew list (system.narrative.crew) with no roles. Item drops and the tier input come from the
 * standard starship sheet.
 */
export class ActorSheetSFRPGStarshipNarrative extends ActorSheetSFRPGStarship {
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.classes = [...options.classes, "narrative-starship"];
        options.width = 560;
        options.tabs = [{ navSelector: ".narrative-tabs", contentSelector: ".narrative-body", initial: "stats" }];
        return options;
    }

    get template() {
        if (!game.user.isGM && this.actor.limited) return super.template;
        return "systems/sfrpg/templates/actors/starship-narrative-sheet.hbs";
    }

    async getData() {
        const data = await super.getData();
        const narrative = this.actor.system.narrative ?? {};
        const derived = narrative.derived ?? {};
        const layout = narrativeLayout(this.actor.system.crew?.useNPCCrew);
        // The crew members this user can roll crew actions for, during the Crew Actions phase.
        const rollable = layout === "pc" ? actableCrew(this.actor)?.rollable ?? [] : [];

        const skills = Object.fromEntries(
            Object.entries(CONFIG.SFRPG.starshipSkills).map(([key, label]) => [key, game.i18n.localize(label)])
        );

        data.narrative = {
            layout,
            isNPC: layout === "npc",
            stats: narrativeStatRows(narrative, layout),
            pips: hpPips(derived.hpValue, derived.hpMax),
            hpValue: derived.hpValue,
            hpMax: derived.hpMax,
            skillModifiers: skillModifierView(narrative.skillModifiers, skills),
            showStandardToggle: showStandardSheetToggle(game.settings.get("sfrpg", "starshipCombatMode")),
            crew: layout === "pc" ? this._crewRows(narrative.crew, rollable) : [],
            // Roll buttons on the Crew Actions tab.
            canRollActions: rollable.length > 0,
            // The GM's Enemy Tactics button on an enemy ship.
            showTactics: layout === "npc" && Boolean(tacticsCombatFor(this.actor)),
            upgrades: layout === "pc" ? this._upgradeRows(narrative.upgrades) : { rows: [], showSection: false },
            onceButtons: layout === "pc" ? this._onceButtonRows(narrative.upgrades) : [],
            crewActions: layout === "pc" ? this._crewActionRows(skills) : [],
            tactics: layout === "npc" ? this._tacticRows(enemyTacticButtons(this.actor)?.buttons) : []
        };

        data.enrichedSpecialAbilities = await foundry.applications.ux.TextEditor.enrichHTML(narrative.specialAbilities ?? "", {
            async: true,
            rollData: this.actor.getRollData() ?? {},
            secrets: this.actor.isOwner
        });

        return data;
    }

    /** Every upgrade with a checkbox for editors; only the installed ones for other viewers. */
    _upgradeRows(upgrades) {
        const named = row => ({
            ...row,
            label: game.i18n.localize(`SFRPG.NarrativeStarship.Upgrades.${row.key}.Name`),
            effect: effectWithDCs(`SFRPG.NarrativeStarship.Upgrades.${row.key}.Effect`, [this.actor], [])
        });
        const { all, installed } = upgradeRows(upgrades);
        // Viewers who can't edit the ship see only what is installed, and no section at all when nothing is.
        const rows = (this.isEditable ? all : installed).map(named);
        return { rows, showSection: rows.length > 0 };
    }

    /**
     * The Crew Actions tab: every crew action by role, with its skills, effect, and the DC numbers of the DC
     * categories the rules give it.
     * @param {Object<string, string>} skills
     */
    _crewActionRows(skills) {
        const label = key => game.i18n.localize(key);
        const names = { ...skills, rangedAttack: label("SFRPG.NarrativeStarship.RangedAttack") };
        const own = shipDCs(this.actor);
        const opponents = this._opponents();
        return crewActionGroups(CONFIG.SFRPG.narrativeCrewActions, NARRATIVE_ROLES, names).map(group => ({
            label: label(`SFRPG.NarrativeStarship.Roles.${group.role}`),
            actions: group.actions.map(action => ({
                key: action.key,
                label: label(`SFRPG.NarrativeStarship.CrewActions.${action.key}.Name`),
                effect: effectWithDCs(`SFRPG.NarrativeStarship.CrewActions.${action.key}.Effect`, [this.actor], opponents),
                skillText: action.anySkill
                    ? label("SFRPG.NarrativeStarship.Dialog.AnySkill")
                    : game.i18n.format("SFRPG.NarrativeStarship.Tabs.PreferredSkills", { skills: action.skills }),
                dcGroups: dcGroupView(crewActionDCGroups(action, own, opponents.map(shipDCs)))
            }))
        }));
    }

    /**
     * The ships on the other side of this ship's narrative combat. The combat need not be started, so their DCs show
     * while the GM sets it up. Empty when the ship is in no narrative combat.
     * @returns {Actor[]}
     */
    _opponents() {
        const combat = narrativeCombatFor(this.actor.id)
            ?? game.combats?.find(c => c.getCombatType?.() === NARRATIVE_COMBAT_TYPE
                && c.combatants.some(cb => cb.actorId === this.actor.id))
            ?? null;
        if (!combat) return [];
        const npc = actor => Boolean(actor.system.crew?.useNPCCrew);
        const mine = npc(this.actor);
        const seen = new Set();
        const ships = [];
        for (const combatant of combat.combatants) {
            const actor = combatant.actor;
            if (actor?.type !== "starship" || seen.has(combatant.actorId) || npc(actor) === mine) continue;
            seen.add(combatant.actorId);
            ships.push(actor);
        }
        return ships;
    }

    /**
     * The Crew tab: each crew member with an Act button for the ones this user can roll for.
     * @param {string[]|undefined} crew
     * @param {string[]} rollable
     */
    _crewRows(crew, rollable) {
        return (crew ?? []).map(id => {
            const actor = game.actors.get(id);
            return {
                id,
                name: actor?.name ?? game.i18n.format(LABEL + "MissingCrew", { id }),
                img: actor?.img ?? CONFIG.Actor.documentClass.DEFAULT_ICON,
                canAct: rollable.includes(id)
            };
        });
    }

    /**
     * The Enemy Actions tab: every enemy tactic with its effect, and the GM's Roll button during the Enemy Tactics
     * phase.
     * @param {Record<string, {disabled: boolean, reason: string|null}>|undefined} buttons
     */
    _tacticRows(buttons) {
        const opponents = this._opponents();
        return Object.keys(CONFIG.SFRPG.narrativeTactics).map(key => {
            const button = buttons?.[key];
            return {
                key,
                label: game.i18n.localize(`${LABEL}Tactics.${key}.Name`),
                effect: effectWithDCs(`${LABEL}Tactics.${key}.Effect`, [this.actor], opponents),
                dcGroups: dcGroupView(tacticDCGroups(CONFIG.SFRPG.narrativeTactics[key], opponents.map(shipDCs))),
                roll: button
                    ? { disabled: button.disabled, hint: button.reason ? game.i18n.localize(`${LABEL}TacticRejected.${button.reason}`) : "" }
                    : null
            };
        });
    }

    /** The once-per-combat upgrade buttons, during a narrative combat with this ship, for the GM and owners. */
    _onceButtonRows(upgrades) {
        const found = upgradeButtonsCombatFor(this.actor);
        if (!found) return [];
        return onceButtons(upgrades, found.used).map(button => ({
            ...button,
            label: game.i18n.localize(`SFRPG.NarrativeStarship.Upgrades.${button.key}.Name`),
            hint: game.i18n.localize(`SFRPG.NarrativeStarship.UpgradeButtons.${button.used ? "Used" : button.key}`)
        }));
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Set the layout on the window element as well as the form, so callers can find it either way.
        const layout = narrativeLayout(this.actor.system.crew?.useNPCCrew);
        this.element?.[0]?.setAttribute("data-narrative-layout", layout);

        // Owners who can't edit the sheet still use the upgrade buttons, and crew owners who can't edit the ship
        // still use the Act and Roll buttons.
        html.find(".narrative-upgrade-use").click(this._onUseUpgrade.bind(this));
        html.find(".narrative-act").click(this._onNarrativeAct.bind(this));
        html.find(".narrative-action-roll").click(this._onCrewActionRoll.bind(this));
        html.find(".narrative-tactic-roll").click(this._onTacticRoll.bind(this));
        html.find(".narrative-crew-name").click(this._onCrewView.bind(this));

        if (!this.options.editable) return;

        html.find(".narrative-hp-pip").click(this._onHPPipClick.bind(this));
        html.find(".narrative-skill-add").click(this._onSkillModifierAdd.bind(this));
        html.find(".narrative-skill-remove").click(this._onSkillModifierRemove.bind(this));
        html.find(".narrative-standard-toggle").click(this._onStandardSheetToggle.bind(this));
        html.find(".narrative-tactics-open").click(this._onOpenTactics.bind(this));
        html.find(".narrative-crew-remove").click(this._onCrewRemove.bind(this));
    }

    /**
     * An actor dropped on the sheet joins the PC ship's crew list. Narrative ships have no crew roles, so where it
     * is dropped doesn't matter. Enemy ships have no crew list.
     * @param {Event} event The drop event
     * @param {string} actorId
     * @returns {Promise<boolean>}
     */
    async _onCrewDrop(event, actorId) {
        if (narrativeLayout(this.actor.system.crew?.useNPCCrew) !== "pc") return false;
        const actor = game.actors.get(actorId);
        if (!CREW_ACTOR_TYPES.includes(actor?.type)) {
            ui.notifications.warn(game.i18n.localize(LABEL + "CrewDropInvalid"));
            return false;
        }
        const crew = addCrewMember(this.actor.system.narrative?.crew, actorId);
        if (!crew) return false;
        await this.actor.update({ "system.narrative.crew": crew });
        return true;
    }

    /**
     * Removes a crew member from the crew list.
     * @param {Event} event The click event
     */
    async _onCrewRemove(event) {
        event.preventDefault();
        const id = event.currentTarget.closest(".narrative-crew-member").dataset.actorId;
        const crew = (this.actor.system.narrative?.crew ?? []).filter(member => member !== id);
        await this.actor.update({ "system.narrative.crew": crew });
    }

    /**
     * Opens a crew member's sheet.
     * @param {Event} event The click event
     */
    _onCrewView(event) {
        event.preventDefault();
        const actor = game.actors.get(event.currentTarget.closest(".narrative-crew-member").dataset.actorId);
        if (actor?.testUserPermission(game.user, "LIMITED")) actor.sheet.render(true);
    }

    /**
     * Opens the crew action dialog for a Roll button on the Crew Actions tab, with that action selected. When the
     * user can roll for more than one crew member, asks which one first.
     * @param {Event} event The click event
     */
    async _onCrewActionRoll(event) {
        event.preventDefault();
        const actionKey = event.currentTarget.dataset.actionKey;
        const found = actableCrew(this.actor);
        if (!found) return;
        const actorId = found.rollable.length === 1 ? found.rollable[0] : await this._askCrewMember(found.rollable);
        const actor = game.actors.get(actorId);
        if (!actor) return;
        await openNarrativeCrewActionDialog({ combat: found.combat, ship: this.actor, actor, actionKey });
    }

    /**
     * Asks which crew member rolls.
     * @param {string[]} ids
     * @returns {Promise<string|null>}
     */
    async _askCrewMember(ids) {
        const options = ids.map(id => {
            const name = foundry.utils.escapeHTML(game.actors.get(id)?.name ?? id);
            return `<option value="${id}">${name}</option>`;
        });
        return foundry.applications.api.DialogV2.prompt({
            window: { title: game.i18n.localize(LABEL + "PickCrewTitle") },
            content: `<div class="form-group"><label>${game.i18n.localize(LABEL + "PickCrew")}</label>`
                + `<div class="form-fields"><select name="actorId">${options.join("")}</select></div></div>`,
            ok: {
                label: game.i18n.localize(LABEL + "Dialog.Roll"),
                icon: "fas fa-dice-d20",
                callback: (event, button) => button.form.elements.actorId.value
            },
            rejectClose: false
        });
    }

    /**
     * Rolls an enemy tactic from a Roll button on the Enemy Actions tab. Asks for the PC ship target when there is
     * more than one and none is forced, and for Cruel Taunt's DC.
     * @param {Event} event The click event
     */
    async _onTacticRoll(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const tactic = button.dataset.tactic;
        const found = enemyTacticButtons(this.actor);
        if (!found || found.buttons[tactic]?.disabled !== false) return;
        const { combat } = found;
        const state = combat.getFlag("sfrpg", "narrative");
        const pcShips = Object.entries(state.ships)
            .filter(([, ship]) => ship.side === "pc" && !ship.flags?.includes("out"))
            .map(([id]) => id);
        const prompt = tacticPrompt(tactic, {
            pcTarget: Boolean(NARRATIVE_TACTICS[tactic]?.pcTarget),
            pcShips,
            forced: state.ships[this.actor.id]?.forcedTactic,
            round: combat.round
        });
        let targetId = prompt.targetId;
        let choice;
        if (prompt.askTarget || prompt.askChoice) {
            const answer = await this._askTacticOptions(combat, tactic, prompt, pcShips);
            if (!answer) return;
            targetId = answer.targetId ?? targetId;
            choice = answer.choice;
        }
        button.disabled = true;
        await runEnemyTactic(combat, { enemyId: this.actor.id, tactic, targetId: targetId ?? undefined, choice });
    }

    /**
     * Asks the GM for a tactic's PC ship target, its Cruel Taunt DC, or both.
     * @returns {Promise<{targetId?: string, choice?: string}|null>}
     */
    async _askTacticOptions(combat, tactic, prompt, pcShips) {
        const group = (label, select) => `<div class="form-group"><label>${game.i18n.localize(label)}</label>`
            + `<div class="form-fields">${select}</div></div>`;
        const parts = [];
        if (prompt.askTarget) {
            const options = pcShips.map(id => {
                const name = foundry.utils.escapeHTML(shipActor(combat, id)?.name ?? id);
                return `<option value="${id}">${name}</option>`;
            });
            parts.push(group(LABEL + "TacticsDialog.Target", `<select name="targetId">${options.join("")}</select>`));
        }
        if (prompt.askChoice) {
            parts.push(group(LABEL + "TacticsDialog.DC", `<select name="choice">`
                + `<option value="average">${game.i18n.localize(LABEL + "AverageDC")}</option>`
                + `<option value="hard">${game.i18n.localize(LABEL + "HardDC")}</option></select>`));
        }
        const answer = await foundry.applications.api.DialogV2.prompt({
            window: { title: game.i18n.localize(`${LABEL}Tactics.${tactic}.Name`) },
            content: parts.join(""),
            ok: {
                label: game.i18n.localize(LABEL + "Dialog.Roll"),
                icon: "fas fa-dice-d20",
                callback: (event, dialogButton) => new foundry.applications.ux.FormDataExtended(dialogButton.form).object
            },
            rejectClose: false
        });
        return answer && typeof answer === "object" ? answer : null;
    }

    /**
     * Asks the GM to use a once-per-combat upgrade.
     * @param {Event} event The click event
     */
    _onUseUpgrade(event) {
        event.preventDefault();
        const found = upgradeButtonsCombatFor(this.actor);
        if (found) requestUpgradeUse(found.combat, this.actor, event.currentTarget.dataset.upgrade);
    }

    /**
     * Installs or removes the upgrade whose box was checked or cleared.
     * @param {HTMLInputElement} input
     */
    async _onUpgradePick(input) {
        const key = input.closest(".narrative-upgrade").dataset.upgrade;
        const update = input.checked
            ? { [`system.narrative.upgrades.${key}`]: 1 }
            : { [`system.narrative.upgrades.-=${key}`]: null };
        await this.actor.update(update);
    }

    /**
     * Saves a change to an installed upgrade's count. The count is kept between 0 and the upgrade's maximum,
     * and a count of 0 removes the upgrade.
     * @param {HTMLInputElement} input
     */
    async _onUpgradeChange(input) {
        const key = input.closest(".narrative-upgrade").dataset.upgrade;
        const count = clampUpgradeCount(key, input.value);
        const update = count > 0
            ? { [`system.narrative.upgrades.${key}`]: count }
            : { [`system.narrative.upgrades.-=${key}`]: null };
        await this.actor.update(update);
    }

    /**
     * Opens the GM's Enemy Tactics dialog for the combat this ship is in.
     * @param {Event} event The click event
     */
    _onOpenTactics(event) {
        event.preventDefault();
        const combat = tacticsCombatFor(this.actor);
        if (combat) openNarrativeTacticsDialog(combat);
    }

    /**
     * Opens the crew action dialog for the crew member of the clicked Act button, with no action chosen yet.
     * @param {Event} event The click event
     */
    async _onNarrativeAct(event) {
        event.preventDefault();
        const id = event.currentTarget.closest(".narrative-crew-member").dataset.actorId;
        const actor = game.actors.get(id);
        const found = actableCrew(this.actor);
        if (!actor || !found?.rollable.includes(id)) return;
        await openNarrativeCrewActionDialog({ combat: found.combat, ship: this.actor, actor });
    }

    /**
     * Sets the ship's current HP from a clicked pip.
     * @param {Event} event The click event
     */
    async _onHPPipClick(event) {
        event.preventDefault();
        const index = Number(event.currentTarget.dataset.index);
        const current = this.actor.system.narrative?.derived?.hpValue ?? 0;
        await this.actor.update({ "system.narrative.hp.value": hpFromPipClick(index, current) });
    }

    /**
     * Adds the skill modifier chosen in the add row.
     * @param {Event} event The click event
     */
    async _onSkillModifierAdd(event) {
        event.preventDefault();
        const row = event.currentTarget.closest(".narrative-skill-new");
        const key = row.querySelector(".narrative-skill-select").value;
        const value = Number(row.querySelector(".narrative-skill-value").value) || 0;
        if (!key) return;
        await this.actor.update({ [`system.narrative.skillModifiers.${key}`]: value });
    }

    /**
     * Removes a skill modifier.
     * @param {Event} event The click event
     */
    async _onSkillModifierRemove(event) {
        event.preventDefault();
        const key = event.currentTarget.closest(".narrative-skill-row").dataset.skill;
        await this.actor.update({ [`system.narrative.skillModifiers.-=${key}`]: null });
    }

    /**
     * Switches this ship to the standard starship sheet. Foundry closes this sheet and opens the new one.
     * @param {Event} event The click event
     */
    async _onStandardSheetToggle(event) {
        event.preventDefault();
        await this.actor.setFlag("core", "sheetClass", `sfrpg.${ActorSheetSFRPGStarship.name}`);
    }

    /**
     * The add rows' selects and values are read when the add button is clicked,
     * so changing them must not submit the form and redraw the sheet.
     * @param {Event} event The change event
     */
    async _onChangeInput(event) {
        if (event.target.closest(".narrative-skill-new")) return;
        if (event.target.classList.contains("narrative-upgrade-check")) return this._onUpgradePick(event.target);
        // An upgrade count saves itself, so 0 removes the key instead of saving 0.
        if (event.target.closest(".narrative-upgrade")) return this._onUpgradeChange(event.target);
        return super._onChangeInput(event);
    }

    _updateObject(event, formData) {
        normalizeNarrativeFormData(formData);
        return super._updateObject(event, formData);
    }
}
