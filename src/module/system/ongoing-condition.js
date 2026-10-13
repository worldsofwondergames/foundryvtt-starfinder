import {
    ONGOING_CONDITIONS,
    addOngoingSource,
    mergeRounds,
    ongoingSources,
    sourceOf,
    remainingHealth,
    tickRounds
} from "../rules/ongoing-damage.js";

/**
 * Actors whose ongoing condition is being applied by code that already knows
 * the amount, keyed "actorUuid:condition". setCondition() fires the
 * onActorSetCondition hook, and the hook would otherwise ask for the amount a
 * second time.
 * @type {Set<string>}
 */
const applying = new Set();

/**
 * Ask for the amount and the optional number of rounds of an ongoing condition.
 *
 * @param {Object} options
 * @param {string} options.condition A key of ONGOING_CONDITIONS.
 * @param {string|null} [options.formula] The amount to offer, such as the weapon's critical damage.
 * @param {string} [options.targets] Names of the creatures it is applied to, for the prompt.
 * @returns {Promise<{formula: string, rounds: number|null}|null>} The answer, or null if the dialog was closed.
 */
export async function promptOngoingCondition({ condition, formula = null, targets = "" }) {
    const rule = ONGOING_CONDITIONS[condition];
    const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
    const offered = formula || rule.defaultFormula || "";

    const content = `
        <p>${game.i18n.format("SFRPG.OngoingDamage.Prompt", { condition: label, targets })}</p>
        <div class="form-group">
            <label>${game.i18n.localize("SFRPG.OngoingDamage.Formula")}</label>
            <input type="text" name="formula" value="${offered}" />
        </div>
        <div class="form-group">
            <label>${game.i18n.localize("SFRPG.OngoingDamage.Rounds")}</label>
            <input type="number" name="rounds" min="1" step="1" placeholder="${game.i18n.localize("SFRPG.OngoingDamage.RoundsPlaceholder")}" />
        </div>`;

    const result = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.format("SFRPG.OngoingDamage.Title", { condition: label }) },
        content,
        ok: {
            label: game.i18n.localize("SFRPG.OngoingDamage.Apply"),
            callback: (event, button) => ({
                formula: button.form.elements.formula.value.trim(),
                rounds: button.form.elements.rounds.value === "" ? null : Number(button.form.elements.rounds.value)
            })
        },
        rejectClose: false
    });
    if (!result) return null;
    if (!result.formula) {
        ui.notifications.warn(game.i18n.format("SFRPG.OngoingDamage.NoFormula", { condition: label }));
        return null;
    }
    return { formula: result.formula, rounds: Number.isInteger(result.rounds) && result.rounds > 0 ? result.rounds : null };
}

/**
 * Give an actor an ongoing condition with an amount and optional rounds.
 *
 * The condition item is created as usual, then given one turn event for this
 * source. Adding a source to a condition the actor already has follows that
 * condition's stacking rule.
 *
 * @param {ActorSFRPG} actor The creature taking the condition.
 * @param {Object} options
 * @param {string} options.condition A key of ONGOING_CONDITIONS.
 * @param {string} options.formula The amount rolled each turn.
 * @param {number|null} [options.rounds] Rounds the condition lasts, or null until removed.
 * @param {string} [options.source] Where it came from, such as the weapon's name, shown on the damage card.
 * @returns {Promise<Item|null>} The condition item, or null if it could not be applied.
 */
export async function applyOngoingCondition(actor, { condition, formula, rounds = null, source = "" }) {
    if (!ONGOING_CONDITIONS[condition] || !formula) return null;

    const key = `${actor.uuid}:${condition}`;
    const isNew = !actor.hasCondition(condition);
    applying.add(key);
    try {
        if (isNew) await actor.setCondition(condition, true);
    } finally {
        applying.delete(key);
    }

    const item = actor.getCondition(condition);
    if (!item) return null;
    await writeSource(item, { condition, formula, rounds, source, isNew });
    return item;
}

async function writeSource(item, { condition, formula, rounds, source, isNew }) {
    const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
    const name = source ? `${label} (${source})` : label;
    await item.update({
        "system.turnEvents": addOngoingSource(item.system.turnEvents, { condition, formula, name }),
        "flags.sfrpg.ongoingRounds": mergeRounds(item.getFlag("sfrpg", "ongoingRounds"), rounds, isNew)
    });
}

/**
 * When an ongoing condition is switched on by hand, from the token HUD or the
 * sheet, ask how much damage it deals.
 *
 * The hook runs only on the client that set the condition, so only that user
 * is asked. Closing the dialog leaves the condition on with no damage roll.
 *
 * @param {{actor: ActorSFRPG, item: Item, conditionName: string, enabled: boolean}} data The hook's data.
 */
export async function onOngoingConditionSet({ actor, item, conditionName, enabled }) {
    if (!enabled || !ONGOING_CONDITIONS[conditionName]) return;
    if (applying.has(`${actor.uuid}:${conditionName}`)) return;
    if (!item?.isOwner) return;

    const answer = await promptOngoingCondition({ condition: conditionName, targets: actor.name });
    if (!answer) return;
    await writeSource(item, { condition: conditionName, ...answer, source: "", isNew: true });
}

/**
 * Handle the Apply link on a critical hit's chat card.
 *
 * The condition goes on the user's targeted tokens, or their controlled tokens
 * when nothing is targeted. Each one needs to be owned by the user, which in
 * practice means the GM applies it to enemies.
 *
 * @param {Event} event The click event.
 * @param {HTMLElement} link The Apply link that was clicked.
 * @returns {Promise<number>} How many actors received the condition.
 */
export async function onApplyOngoingClick(event, link) {
    event.preventDefault();
    event.stopPropagation();

    const { condition, formula, source } = link.dataset;
    const tokens = game.user.targets.size ? [...game.user.targets] : canvas.tokens?.controlled ?? [];
    const actors = tokens.map(t => t.actor).filter(Boolean);
    if (!actors.length) {
        ui.notifications.warn(game.i18n.localize("SFRPG.OngoingDamage.NoTargets"));
        return 0;
    }
    const denied = actors.filter(a => !a.isOwner);
    if (denied.length) {
        ui.notifications.warn(game.i18n.format("SFRPG.OngoingDamage.NotOwner", { names: denied.map(a => a.name).join(", ") }));
        return 0;
    }

    const answer = await promptOngoingCondition({ condition, formula: formula || null, targets: actors.map(a => a.name).join(", ") });
    if (!answer) return 0;

    for (const actor of actors) {
        await applyOngoingCondition(actor, { condition, ...answer, source });
    }
    return actors.length;
}

/**
 * Roll each ongoing condition's damage at the start of the affected creature's
 * turn, apply it, count down the condition's timer, and post one card saying
 * what happened.
 *
 * The damage goes through applyDamage with the condition's damage type, so
 * immunity, resistance and vulnerability apply.
 *
 * @param {ActorSFRPG} actor The creature whose turn started.
 * @returns {Promise<string[]>} The conditions that ended.
 */
export async function rollOngoingConditions(actor) {
    const ended = [];
    for (const condition of Object.keys(ONGOING_CONDITIONS)) {
        const item = actor.getCondition?.(condition);
        if (!item?.system.enabled) continue;

        const card = await rollOngoingDamage(actor, item, condition);
        const { rounds, expired } = tickRounds(item.getFlag("sfrpg", "ongoingRounds"));
        const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);

        if (expired) {
            card.lines.push(game.i18n.format("SFRPG.OngoingDamage.LastRound", { condition: label }));
            await actor.setCondition(condition, false);
            ended.push(condition);
        } else if (rounds !== null) {
            card.lines.push(game.i18n.format(rounds === 1 ? "SFRPG.OngoingDamage.OneRoundLeft" : "SFRPG.OngoingDamage.RoundsLeft", { rounds }));
            await item.setFlag("sfrpg", "ongoingRounds", rounds);
        } else {
            card.lines.push(game.i18n.localize("SFRPG.OngoingDamage.UntilRemoved"));
        }

        const content = `<div class="sfrpg ongoing-damage-card">${card.lines.map(line => `<p>${line}</p>`).join("")}</div>`;
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            rolls: card.rolls,
            sound: card.rolls.length ? CONFIG.sounds.dice : null
        });
    }
    return ended;
}

/**
 * Roll every source of an ongoing condition and apply the total.
 *
 * @param {ActorSFRPG} actor The affected creature.
 * @param {Item} item The condition item.
 * @param {string} condition A key of ONGOING_CONDITIONS.
 * @returns {Promise<{lines: string[], rolls: Roll[]}>} What the card says, and the rolls behind it.
 */
async function rollOngoingDamage(actor, item, condition) {
    const rule = ONGOING_CONDITIONS[condition];
    const sources = ongoingSources(item.system.turnEvents);
    const label = game.i18n.localize(CONFIG.SFRPG.conditionTypes[condition]);
    if (!sources.length) {
        return { lines: [game.i18n.format("SFRPG.OngoingDamage.NoDamage", { condition: label, name: actor.name })], rolls: [] };
    }

    const rolls = [];
    for (const source of sources) {
        rolls.push(await new Roll(source.formula).evaluate());
    }
    const amount = rolls.reduce((sum, roll) => sum + roll.total, 0);
    const type = rule.damageType ? game.i18n.localize(CONFIG.SFRPG.damageTypes[rule.damageType] ?? rule.damageType).toLowerCase() : "";

    const before = remainingHealth(actor.system.attributes);
    const Damage = game.sfrpg.Actor.Damage.SFRPGDamage;
    await actor.applyDamage(Damage.createDamage(amount, rule.damageType ? [rule.damageType] : []));
    const lost = before - remainingHealth(actor.system.attributes);

    const lines = [game.i18n.format(type ? "SFRPG.OngoingDamage.Dealt" : "SFRPG.OngoingDamage.DealtUntyped", {
        condition: label,
        amount,
        type,
        name: actor.name
    })];
    // One line for the dice. Foundry's own roll display repeats the formula three times.
    lines.push(game.i18n.format("SFRPG.OngoingDamage.Rolled", {
        rolls: rolls.map((roll, i) => {
            const from = sourceOf(sources[i].name);
            // In <code> so the chat's dice linking leaves the already rolled formula alone.
            const formula = `<code>${roll.formula}</code>`;
            return from ? `${formula} (${from}): ${roll.total}` : `${formula}: ${roll.total}`;
        }).join(", ")
    }));
    if (lost !== amount) lines.push(game.i18n.format("SFRPG.OngoingDamage.Lost", { name: actor.name, lost }));

    return { lines, rolls };
}
