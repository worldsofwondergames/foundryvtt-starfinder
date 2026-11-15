import { openNarrativeCrewActionDialog } from "../../apps/narrative-crew-action-dialog.js";
import { openNarrativeTacticsDialog } from "../../apps/narrative-tactics-dialog.js";
import { showStandardSheetToggle } from "../../rules/narrative-starship/mode.js";
import {
    hpFromPipClick,
    hpPips,
    narrativeLayout,
    narrativeStatRows,
    normalizeNarrativeFormData,
    skillModifierView
} from "../../rules/narrative-starship/sheet-view.js";
import { actableCrew, tacticsCombatFor } from "../../system/narrative-starship-combat.js";
import { ActorSheetSFRPGStarship } from "./starship.js";

/**
 * The narrative starship sheet (Starfinder Enhanced pp. 176-184).
 * Shows the EN stat block for NPC ships and a crew view for PC ships.
 * Crew handling, item drops, and the tier input come from the standard starship sheet.
 */
export class ActorSheetSFRPGStarshipNarrative extends ActorSheetSFRPGStarship {
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.classes = [...options.classes, "narrative-starship"];
        options.width = 560;
        options.tabs = [];
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
            // Act buttons during the Crew Actions phase, keyed by role and crew actor id.
            actable: layout === "pc" ? actableCrew(this.actor)?.actable ?? null : null,
            // The GM's Enemy Tactics button on an enemy ship.
            showTactics: layout === "npc" && Boolean(tacticsCombatFor(this.actor))
        };

        data.enrichedSpecialAbilities = await foundry.applications.ux.TextEditor.enrichHTML(narrative.specialAbilities ?? "", {
            async: true,
            rollData: this.actor.getRollData() ?? {},
            secrets: this.actor.isOwner
        });

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Set the layout on the window element as well as the form, so callers can find it either way.
        const layout = narrativeLayout(this.actor.system.crew?.useNPCCrew);
        this.element?.[0]?.setAttribute("data-narrative-layout", layout);

        if (!this.options.editable) return;

        html.find(".narrative-hp-pip").click(this._onHPPipClick.bind(this));
        html.find(".narrative-skill-add").click(this._onSkillModifierAdd.bind(this));
        html.find(".narrative-skill-remove").click(this._onSkillModifierRemove.bind(this));
        html.find(".narrative-standard-toggle").click(this._onStandardSheetToggle.bind(this));
        html.find(".narrative-act").click(this._onNarrativeAct.bind(this));
        html.find(".narrative-tactics-open").click(this._onOpenTactics.bind(this));
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
     * Opens the crew action dialog for the crew member and role of the clicked Act button.
     * @param {Event} event The click event
     */
    async _onNarrativeAct(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const actor = game.actors.get(button.closest(".crew").dataset.actorId);
        const found = actableCrew(this.actor);
        if (!actor || !found) return;
        await openNarrativeCrewActionDialog({ combat: found.combat, ship: this.actor, actor, role: button.dataset.role });
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
     * The add row's skill select and value are read when the add button is clicked,
     * so changing them must not submit the form and redraw the sheet.
     * @param {Event} event The change event
     */
    async _onChangeInput(event) {
        if (event.target.closest(".narrative-skill-new")) return;
        return super._onChangeInput(event);
    }

    _updateObject(event, formData) {
        normalizeNarrativeFormData(formData);
        return super._updateObject(event, formData);
    }
}
