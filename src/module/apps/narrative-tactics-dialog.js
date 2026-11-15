import { NARRATIVE_TACTICS, availableNextTactics, availableTactics, revealPending } from "../rules/narrative-starship/tactics.js";
import { pendingMines } from "../rules/narrative-starship/upgrades.js";
import { TACTICS_PHASE, presetEnemyTactic, rollEnemyMines, runEnemyTactic, shipActor } from "../system/narrative-starship-combat.js";

const LABEL = "SFRPG.NarrativeStarship.";

/** The open dialog for each combat id. */
const openDialogs = new Map();

function tacticOptions(statuses, selected) {
    return statuses.map(status => ({
        value: status.key,
        label: game.i18n.localize(`${LABEL}Tactics.${status.key}.Name`),
        disabled: status.disabled,
        title: status.disabled ? game.i18n.localize(`${LABEL}TacticRejected.${status.reason}`) : "",
        selected: status.key === selected,
        pcTarget: NARRATIVE_TACTICS[status.key].pcTarget
    }));
}

/** The first tactic the GM can pick, or the forced one. */
function firstOpen(statuses) {
    return statuses.find(s => !s.disabled)?.key ?? null;
}

/** Shows the target select only for tactics that target a PC ship, and the DC choice only for Cruel Taunt. */
function updateRow(row) {
    for (const select of row.querySelectorAll("select[data-field='tactic']")) {
        const group = select.closest("[data-group]");
        const option = select.selectedOptions[0];
        const target = group.querySelector("[data-part='target']");
        const choice = group.querySelector("[data-part='choice']");
        // The hidden attribute loses to the form-group display rule, so set the style.
        if (target) target.style.display = option?.dataset.pcTarget === "true" ? "" : "none";
        if (choice) choice.style.display = select.value === "cruelTaunt" ? "" : "none";
    }
}

let TacticsApp = null;

/** The application class, built on first use so this module loads without Foundry (for tests). */
function tacticsAppClass() {
    if (TacticsApp) return TacticsApp;
    const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

    TacticsApp = class NarrativeTacticsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
        constructor(combat, options = {}) {
            super(options);
            this.combat = combat;
        }

        static DEFAULT_OPTIONS = {
            classes: ["sfrpg", "narrative-tactics"],
            window: { title: "SFRPG.NarrativeStarship.TacticsDialog.DialogTitle", resizable: true },
            position: { width: 560, height: "auto" },
            actions: {
                roll: NarrativeTacticsDialog.#onRoll,
                preset: NarrativeTacticsDialog.#onPreset,
                mines: NarrativeTacticsDialog.#onMines
            }
        };

        static PARTS = {
            body: { template: "systems/sfrpg/templates/apps/narrative-tactics.hbs" }
        };

        async _prepareContext() {
            const combat = this.combat;
            const state = combat.getFlag("sfrpg", "narrative") ?? { ships: {}, modifiers: [] };
            const round = combat.round;
            const name = id => shipActor(combat, id)?.name ?? id;
            const pcs = Object.entries(state.ships)
                .filter(([, ship]) => ship.side === "pc" && !ship.flags.includes("out"))
                .map(([id]) => ({ id, name: name(id) }));
            const targetsFor = forced => pcs.map(pc => ({ ...pc, selected: pc.id === forced }));

            const rows = Object.entries(state.ships)
                .filter(([, ship]) => ship.side === "enemy" && !ship.flags.includes("out"))
                .map(([id, ship]) => {
                    const statuses = availableTactics(state, id, round);
                    const forced = ship.forcedTactic?.round === round ? ship.forcedTactic : null;
                    const row = {
                        id,
                        name: name(id),
                        chosen: ship.tactic ? game.i18n.localize(`${LABEL}Tactics.${ship.tactic}.Name`) : "",
                        chosenTarget: ship.tacticTarget ? name(ship.tacticTarget) : "",
                        tactics: tacticOptions(statuses, forced?.tactic ?? firstOpen(statuses)),
                        targets: targetsFor(forced?.targetShip),
                        targetLocked: Boolean(forced?.targetShip),
                        forced: Boolean(forced),
                        // Mine Layer: the ship's mines check comes before its tactic.
                        mines: ship.tactic ? null : pendingMines(state, id, round)
                    };
                    if (revealPending(state, id, round)) {
                        const next = availableNextTactics(state, id, round);
                        row.reveal = { tactics: tacticOptions(next, firstOpen(next)), targets: targetsFor(null) };
                    }
                    return row;
                });
            return { rows, canRoll: combat.flags.sfrpg?.phase === TACTICS_PHASE, round };
        }

        _onRender(context, options) {
            super._onRender(context, options);
            for (const row of this.element.querySelectorAll(".narrative-tactic-row")) {
                row.addEventListener("change", () => updateRow(row));
                updateRow(row);
            }
        }

        _onClose(options) {
            super._onClose(options);
            if (openDialogs.get(this.combat.id) === this) openDialogs.delete(this.combat.id);
        }

        /** Reads a group's selects. */
        static #read(target) {
            const group = target.closest("[data-group]");
            const value = field => group.querySelector(`[data-field='${field}']`)?.value || undefined;
            return { enemyId: target.closest(".narrative-tactic-row").dataset.enemyId, tactic: value("tactic"), targetId: value("target"), choice: value("choice") };
        }

        static async #onRoll(event, target) {
            const input = NarrativeTacticsDialog.#read(target);
            target.disabled = true;
            await runEnemyTactic(this.combat, input);
            if (this.rendered) this.render();
        }

        static async #onMines(event, target) {
            target.disabled = true;
            await rollEnemyMines(this.combat, target.closest(".narrative-tactic-row").dataset.enemyId);
            if (this.rendered) this.render();
        }

        static async #onPreset(event, target) {
            const input = NarrativeTacticsDialog.#read(target);
            await presetEnemyTactic(this.combat, input);
            if (this.rendered) this.render();
        }
    };
    return TacticsApp;
}

/**
 * Opens the GM's Enemy Tactics dialog for a narrative combat, or brings the open one to the front.
 * @param {Combat} combat
 */
export function openNarrativeTacticsDialog(combat) {
    if (!game.user.isGM || !combat) return null;
    let dialog = openDialogs.get(combat.id);
    if (!dialog) {
        const App = tacticsAppClass();
        dialog = new App(combat, { id: `narrative-tactics-${combat.id}` });
        openDialogs.set(combat.id, dialog);
    }
    dialog.render({ force: true });
    return dialog;
}

/**
 * Redraws the open tactics dialog of a combat, if any, after its state or phase changed.
 * @param {Combat} combat
 */
export function refreshNarrativeTacticsDialog(combat) {
    const dialog = openDialogs.get(combat?.id);
    if (dialog?.rendered) dialog.render();
}
