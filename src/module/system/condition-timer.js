import { TIMED_CONDITIONS, startConditionTimer, tickConditionTimer } from "../rules/condition-timer.js";
import { startEndCheck } from "../rules/condition-end-check.js";

/**
 * Whether it is this actor's turn in the active combat.
 *
 * Compared by uuid so an unlinked token's copy of an actor is told apart from
 * the base actor and from other tokens of it.
 *
 * @param {ActorSFRPG} actor
 * @returns {boolean}
 */
function isActorsTurn(actor) {
    const combat = game.combat;
    return Boolean(combat?.started && combat.combatant?.actor?.uuid === actor.uuid);
}

/**
 * Ask how many rounds a condition lasts, and whether a save ends it sooner.
 *
 * @param {string} condition A key of CONFIG.SFRPG.conditionTypes.
 * @param {string} name The affected creature's name, for the prompt.
 * @returns {Promise<{rounds: number|null, check: {kind: string, id: string, dc: number|null}|null}|null>}
 *     The rounds, or null to keep it until removed, and the save that ends it, or
 *     null for none. Null when the dialog is closed.
 */
export async function promptConditionRounds(condition, name) {
    const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
    const saves = Object.entries(CONFIG.SFRPG.saves)
        .map(([id, key]) => `<option value="${id}">${game.i18n.localize(key)}</option>`)
        .join("");
    const content = `
        <p>${game.i18n.format("SFRPG.ConditionTimer.Prompt", { condition: label, name })}</p>
        <div class="form-group">
            <label>${game.i18n.localize("SFRPG.ConditionTimer.Rounds")}</label>
            <input type="number" name="rounds" min="1" step="1" placeholder="${game.i18n.localize("SFRPG.ConditionTimer.RoundsPlaceholder")}" autofocus />
        </div>
        <div class="form-group">
            <label>${game.i18n.localize("SFRPG.ConditionTimer.SaveToEnd")}</label>
            <select name="save">
                <option value="">${game.i18n.localize("SFRPG.ConditionTimer.SaveNone")}</option>
                ${saves}
            </select>
        </div>
        <div class="form-group">
            <label>${game.i18n.localize("SFRPG.ConditionTimer.SaveDC")}</label>
            <input type="number" name="dc" min="1" step="1" />
        </div>
        <p class="hint">${game.i18n.localize("SFRPG.ConditionTimer.SaveHint")}</p>`;

    const number = value => (value === "" ? null : Number(value));
    const answer = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.format("SFRPG.ConditionTimer.Title", { condition: label }) },
        content,
        ok: {
            label: game.i18n.localize("SFRPG.ConditionTimer.Apply"),
            callback: (event, button) => {
                const { rounds, save, dc } = button.form.elements;
                return { rounds: number(rounds.value), save: save.value, dc: number(dc.value) };
            }
        },
        rejectClose: false
    });
    if (!answer) return null;

    const rounds = Number.isInteger(answer.rounds) && answer.rounds > 0 ? answer.rounds : null;
    const check = answer.save ? { kind: "save", id: answer.save, dc: answer.dc } : null;
    return { rounds, check };
}

/**
 * Give a condition the actor already has a number of rounds to last.
 *
 * @param {ActorSFRPG} actor The affected creature.
 * @param {string} condition A key of TIMED_CONDITIONS.
 * @param {number|null} rounds The rounds, or null to keep it until removed.
 * @returns {Promise<void>}
 */
export async function setConditionTimer(actor, condition, rounds) {
    const item = actor.getCondition(condition);
    if (!item) return;

    const timer = startConditionTimer(rounds, isActorsTurn(actor));
    if (timer) await item.setFlag("sfrpg", "conditionTimer", timer);
    else if (item.getFlag("sfrpg", "conditionTimer")) await item.unsetFlag("sfrpg", "conditionTimer");
}

/**
 * When a timed condition is switched on by hand, from the token HUD or the
 * sheet, ask how many rounds it lasts.
 *
 * The hook runs only on the client that set the condition, so only that user is
 * asked. Flat-footed switched on because of stunned or a similar condition is
 * not asked about, since it ends with that condition. A blank answer or a closed
 * dialog leaves the condition on until someone removes it.
 *
 * @param {{actor: ActorSFRPG, item: Item, conditionName: string, enabled: boolean, automatic?: boolean}} data The hook's data.
 */
export async function onTimedConditionSet({ actor, item, conditionName, enabled, automatic }) {
    if (!enabled || automatic || !TIMED_CONDITIONS.includes(conditionName)) return;
    if (!item?.isOwner) return;

    const answer = await promptConditionRounds(conditionName, actor.name);
    if (!answer) return;
    if (answer.rounds) await setConditionTimer(actor, conditionName, answer.rounds);

    // A save the GM gave the condition is offered at the end of each of the
    // creature's turns. A save with no usable DC is left out.
    const check = answer.check ? startEndCheck(answer.check, { saves: CONFIG.SFRPG.saves, skills: CONFIG.SFRPG.skills }) : null;
    if (check) await actor.getCondition(conditionName)?.setFlag("sfrpg", "conditionEndCheck", check);
}

/**
 * Count down the timers on an actor's conditions at the end of its turn and
 * remove any that run out.
 *
 * The condition goes through setCondition, so its item, its token icon and the
 * actor's condition flag all clear, and flat-footed it caused goes with it.
 *
 * @param {ActorSFRPG} actor The creature whose turn ended.
 * @returns {Promise<string[]>} The conditions that ended.
 */
export async function tickConditionTimers(actor) {
    const ended = [];
    for (const condition of TIMED_CONDITIONS) {
        const item = actor.getCondition?.(condition);
        const current = item?.getFlag("sfrpg", "conditionTimer");
        if (!current) continue;

        const { timer, expired } = tickConditionTimer(current);
        if (expired) {
            await actor.setCondition(condition, false);
            ended.push(condition);
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: game.i18n.format("SFRPG.ConditionTimer.Expired", {
                    name: actor.name,
                    condition: game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition])
                })
            });
        } else if (timer) {
            await item.setFlag("sfrpg", "conditionTimer", timer);
        }
    }
    return ended;
}

/**
 * Remove a condition whose item is switched off on the sheet's effects list.
 *
 * A disabled condition item stayed on the actor: its icon stayed on the token,
 * its flag stayed set and its timer kept counting down. Switching it off now
 * removes it the same way the token HUD does.
 *
 * Runs only on the client that made the change.
 *
 * @param {Item} item The updated item.
 * @param {object} changes The changed data.
 * @param {object} options
 * @param {string} userId The user who made the change.
 * @returns {Promise<void>}
 */
export async function onConditionItemDisabled(item, changes, options, userId) {
    if (userId !== game.user.id) return;
    if (foundry.utils.getProperty(changes, "system.enabled") !== false) return;

    const actor = item.actor;
    const condition = item.system?.slug;
    if (!actor || item.type !== "effect" || !CONFIG.SFRPG.conditionTypes[condition]) return;
    if (actor.getCondition(condition)?.id !== item.id) return;

    await actor.setCondition(condition, false);
}
