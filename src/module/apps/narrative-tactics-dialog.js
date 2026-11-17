import { NARRATIVE_TACTICS, availableNextTactics, availableTactics, revealPending, tacticDC } from "../rules/narrative-starship/tactics.js";
import { pendingMines } from "../rules/narrative-starship/upgrades.js";
import { TACTICS_PHASE, effectWithDCs, presetEnemyTactic, rollEnemyMines, runEnemyTactic, shipActor } from "../system/narrative-starship-combat.js";

const LABEL = "SFRPG.NarrativeStarship.";

/** The open dialog for each combat id. */
const openDialogs = new Map();

/**
 * @param {object[]} statuses
 * @param {string|null} selected
 * @param {Actor[]} own The enemy ship, for the DCs its effect text names.
 * @param {Actor[]} targets The PC ships.
 */
function tacticOptions(statuses, selected, own, targets) {
    return statuses.map(status => ({
        value: status.key,
        label: game.i18n.localize(`${LABEL}Tactics.${status.key}.Name`),
        disabled: status.disabled,
        title: status.disabled ? game.i18n.localize(`${LABEL}TacticRejected.${status.reason}`) : "",
        selected: status.key === selected,
        pcTarget: NARRATIVE_TACTICS[status.key].pcTarget,
        dc: NARRATIVE_TACTICS[status.key].dc ?? "",
        effect: effectWithDCs(`${LABEL}Tactics.${status.key}.Effect`, own, targets)
    }));
}

/** The first tactic the GM can pick, or the forced one. */
function firstOpen(statuses) {
    return statuses.find(s => !s.disabled)?.key ?? null;
}

/**
 * Shows the target select only for tactics that target a PC ship and the DC choice only for Cruel Taunt, and
 * writes the chosen tactic's DC against the chosen target and its effect under the selects.
 */
function updateRow(row) {
    for (const select of row.querySelectorAll("select[data-field='tactic']")) {
        const group = select.closest("[data-group]");
        const option = select.selectedOptions[0];
        const target = group.querySelector("[data-part='target']");
        const choice = group.querySelector("[data-part='choice']");
        const showTarget = option?.dataset.pcTarget === "true";
        if (target) target.style.display = showTarget ? "" : "none";
        if (choice) choice.style.display = select.value === "cruelTaunt" ? "" : "none";

        const kind = option?.dataset.dc === "choice" ? group.querySelector("[data-field='choice']")?.value : option?.dataset.dc;
        const ship = showTarget ? group.querySelector("[data-field='target']")?.selectedOptions[0] : null;
        const dc = kind && ship ? ship.dataset[kind] : "";
        const dcText = group.querySelector(".narrative-tactic-dc");
        if (dcText) dcText.textContent = dc ? game.i18n.format(`${LABEL}Tabs.DC`, { dc }) : "";
        const effect = group.querySelector(".narrative-tactic-effect-text");
        if (effect) effect.textContent = option?.dataset.effect ?? "";
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
            classes: ["sfrpg", "narrative-tactics", "themed", "theme-light"],
            window: { title: "SFRPG.NarrativeStarship.TacticsDialog.DialogTitle", icon: "fas fa-dice-d20", resizable: true },
            position: { width: 600, height: "auto" },
            actions: {
                roll: NarrativeTacticsDialog.#onRoll,
                preset: NarrativeTacticsDialog.#onPreset,
                mines: NarrativeTacticsDialog.#onMines,
                continue: NarrativeTacticsDialog.#onContinue
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
            const pcActors = pcs.map(pc => shipActor(combat, pc.id));
            // Each target's DC for an Average and a Hard tactic, after the effects that make tactics use the Hard DC.
            const targetsFor = (forced, enemyId) => pcs.map(pc => {
                const derived = shipActor(combat, pc.id)?.system.narrative?.derived ?? {};
                const dcs = { average: derived.averageDC, hard: derived.hardDC };
                const dcOf = choice => tacticDC(state, { enemyId, targetId: pc.id, tactic: "cruelTaunt", choice }, dcs, round);
                return { ...pc, selected: pc.id === forced, average: dcOf("average"), hard: dcOf("hard") };
            });

            const rows = Object.entries(state.ships)
                .filter(([, ship]) => ship.side === "enemy" && !ship.flags.includes("out"))
                .map(([id, ship]) => {
                    const statuses = availableTactics(state, id, round);
                    const forced = ship.forcedTactic?.round === round ? ship.forcedTactic : null;
                    const row = {
                        id,
                        name: name(id),
                        img: shipActor(combat, id)?.img ?? "",
                        chosen: ship.tactic ? game.i18n.localize(`${LABEL}Tactics.${ship.tactic}.Name`) : "",
                        chosenTarget: ship.tacticTarget ? name(ship.tacticTarget) : "",
                        tactics: tacticOptions(statuses, forced?.tactic ?? firstOpen(statuses), [shipActor(combat, id)], pcActors),
                        targets: targetsFor(forced?.targetShip, id),
                        targetLocked: Boolean(forced?.targetShip),
                        forced: Boolean(forced),
                        // Mine Layer: the ship's mines check comes before its tactic.
                        mines: ship.tactic ? null : pendingMines(state, id, round)
                    };
                    if (revealPending(state, id, round)) {
                        const next = availableNextTactics(state, id, round);
                        row.reveal = { tactics: tacticOptions(next, firstOpen(next), [shipActor(combat, id)], pcActors), targets: targetsFor(null, id) };
                    }
                    return row;
                });
            const canRoll = combat.flags.sfrpg?.phase === TACTICS_PHASE;
            // Every enemy ship has rolled its tactic, so the GM can move on to Crew Actions.
            const allChosen = rows.length > 0 && rows.every(row => row.chosen);
            return { rows, canRoll, allChosen, round };
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

        /** Moves the combat on to the Crew Actions phase and closes the dialog. */
        static async #onContinue(event, target) {
            target.disabled = true;
            if (this.combat.flags.sfrpg?.phase === TACTICS_PHASE) await this.combat.nextTurn();
            await this.close();
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
