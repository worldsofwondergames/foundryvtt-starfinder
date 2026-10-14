import { RPC } from "../rpc.js";

/**
 * The class marking a button whose roll has already been made. The stylesheet
 * dims and strikes through a link carrying it.
 */
export const SPENT_CLASS = "replenish-spent";

/** The message flag listing the buttons on a card that have been rolled. */
const SPENT_FLAG = "spentButtons";

/** The cards whose dice are rolled once, by whoever presses them first. */
const SINGLE_USE_CARDS = ".mech-action-card, .mech-failure-card, .condition-end-check-card";

/**
 * The buttons on those cards that roll once. Stop bleeding is left out: any
 * healer can try again.
 */
const SINGLE_USE_ACTIONS = [
    "mechAttackBonus",
    "mechSaveBonus",
    "mechReplenish",
    "mechFailureRoll",
    "mechPowerCoreLoss",
    "mechCockpitSave",
    "mechAuxiliaryPick",
    "mechChanceCheck",
    "conditionEndCheck"
];

/**
 * Buttons that share one roll. A condition card offers one attempt, made with
 * either Roll or Smother.
 */
const SHARED_KEYS = { conditionEndCheck: "conditionEndCheck" };

/** How long a player waits for the GM to answer before giving up. */
const CLAIM_TIMEOUT_MS = 10000;

/**
 * The name a button with a `data-action` is recorded under.
 *
 * @param {string} action
 * @param {string} [index] Which of several buttons of that action it is.
 * @returns {string}
 */
export function actionKey(action, index) {
    return SHARED_KEYS[action] ?? `${action}:${index ?? "0"}`;
}

/**
 * The name a rolled button is recorded under on its message, or null for a
 * button that can be rolled again.
 *
 * A dice expression is named by its place among the card's expressions, since
 * the text editor builds those links each time the card is drawn.
 *
 * @param {Element} link The button.
 * @returns {string|null}
 */
export function buttonKey(link) {
    const card = link?.closest(SINGLE_USE_CARDS);
    if (!card) return null;

    const action = link.dataset.action;
    if (action) return SINGLE_USE_ACTIONS.includes(action) ? actionKey(action, link.dataset.index) : null;

    if (link.classList.contains("inline-roll") && !link.classList.contains("inline-result")) {
        return `roll:${[...card.querySelectorAll("a.inline-roll:not(.inline-result)")].indexOf(link)}`;
    }

    return null;
}

/**
 * The spent list with the keys added, or null when one of them is already spent.
 *
 * @param {string[]} spent
 * @param {string[]} keys
 * @returns {string[]|null}
 */
export function claimedKeys(spent, keys) {
    if (keys.some(key => spent.includes(key))) return null;
    return [...spent, ...keys];
}

/**
 * The spent list with the keys taken back off.
 *
 * @param {string[]} spent
 * @param {string[]} keys
 * @returns {string[]}
 */
export function releasedKeys(spent, keys) {
    return spent.filter(key => !keys.includes(key));
}

/**
 * Strike through and unbind every spent button on a rendered card.
 *
 * Keys are worked out for every button before any is changed, because a spent
 * dice expression stops counting as one and would shift the places of the rest.
 *
 * @param {Element} root The rendered message.
 * @param {string[]} spent The keys of the buttons that have been rolled.
 */
export function showSpentButtons(root, spent) {
    if (!spent?.length) return;

    const links = [...root.querySelectorAll("a")].map(link => ({ link, key: buttonKey(link) }));

    for (const { link, key } of links) {
        if (!key || !spent.includes(key)) continue;

        delete link.dataset.action;
        link.classList.remove("inline-roll", "roll");
        link.classList.add("enriched-link", SPENT_CLASS);
    }
}

let queue = Promise.resolve();

/**
 * Run claims one after another, so two arriving together can't both see a
 * button as unspent.
 *
 * @param {function(): Promise<boolean>} work
 * @returns {Promise<boolean>}
 */
function queued(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
}

/**
 * Record buttons as rolled on their message. Runs for the active GM.
 *
 * @param {string} messageId
 * @param {string[]} keys
 * @returns {Promise<boolean>} False when one of them was already rolled.
 */
export function grantClaim(messageId, keys) {
    return queued(async () => {
        const message = game.messages.get(messageId);
        if (!message) return false;

        const next = claimedKeys(message.getFlag("sfrpg", SPENT_FLAG) ?? [], keys);
        if (!next) return false;

        await message.setFlag("sfrpg", SPENT_FLAG, next);
        return true;
    });
}

/**
 * Hand buttons back after their roll was called off. Runs for the active GM.
 *
 * @param {string} messageId
 * @param {string[]} keys
 * @returns {Promise<boolean>}
 */
export function grantRelease(messageId, keys) {
    return queued(async () => {
        const message = game.messages.get(messageId);
        if (!message) return false;

        await message.setFlag("sfrpg", SPENT_FLAG, releasedKeys(message.getFlag("sfrpg", SPENT_FLAG) ?? [], keys));
        return true;
    });
}

const pending = new Map();

/**
 * Ask the active GM to claim or release buttons, and wait for the answer.
 *
 * @param {string} eventName "claimChatButton" or "releaseChatButton".
 * @param {string} messageId
 * @param {string[]} keys
 * @returns {Promise<boolean|null>} Null when the GM did not answer.
 */
function askGM(eventName, messageId, keys) {
    const requestId = foundry.utils.randomID();
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            pending.delete(requestId);
            ui.notifications.warn(game.i18n.localize("SFRPG.ChatButton.NoAnswer"));
            resolve(null);
        }, CLAIM_TIMEOUT_MS);
        pending.set(requestId, granted => {
            clearTimeout(timer);
            resolve(granted);
        });
        RPC.sendMessageTo("gm", eventName, { requestId, messageId, keys });
    });
}

/**
 * Claim or release buttons on a message, through the active GM when there is
 * one. Without a GM, a user who can update the message records it directly.
 *
 * @param {ChatMessage} message
 * @param {string[]} keys
 * @param {boolean} release
 * @returns {Promise<boolean|null>} False when a button was already rolled, and
 *     null when the claim could not be asked for, with a notice already shown.
 */
async function settle(message, keys, release) {
    if (game.users.activeGM?.isSelf) {
        return release ? grantRelease(message.id, keys) : grantClaim(message.id, keys);
    }
    if (game.users.activeGM) {
        return askGM(release ? "releaseChatButton" : "claimChatButton", message.id, keys);
    }
    if (!message.canUserModify(game.user, "update")) {
        ui.notifications.warn(game.i18n.localize("SFRPG.ChatButton.NeedsGM"));
        return null;
    }

    const spent = message.getFlag("sfrpg", SPENT_FLAG) ?? [];
    const next = release ? releasedKeys(spent, keys) : claimedKeys(spent, keys);
    if (!next) return false;
    await message.setFlag("sfrpg", SPENT_FLAG, next);
    return true;
}

/**
 * The message a rendered button belongs to.
 *
 * @param {Element} link
 * @returns {ChatMessage|null}
 */
function messageOf(link) {
    const id = link.closest("[data-message-id]")?.dataset.messageId;
    return id ? game.messages.get(id) ?? null : null;
}

/** Returned by a roll's work to say it was called off and the button is free again. */
export const CANCELED = Symbol("canceled");

/**
 * Roll a card's button once. The button is claimed before anything is rolled,
 * so a second user pressing it at the same moment is turned away, and the
 * strikethrough shows for everyone as soon as the claim is recorded.
 *
 * @param {Element} link The button pressed.
 * @param {function(): Promise<*>} work Rolls and applies the result. Returns
 *     CANCELED when nothing was rolled, such as a roll dialog being closed.
 * @returns {Promise<*>} What the work returned, or null when the button was
 *     already rolled or the work was canceled.
 */
export async function rollOnce(link, work) {
    const key = buttonKey(link);
    const message = messageOf(link);
    if (!key || !message) return unlessCanceled(await work());

    if (link.dataset.claiming || link.classList.contains(SPENT_CLASS)) return null;
    link.dataset.claiming = "true";
    let granted;
    try {
        granted = await settle(message, [key], false);
    } finally {
        delete link.dataset.claiming;
    }
    if (granted !== true) {
        if (granted === false) ui.notifications.info(game.i18n.localize("SFRPG.ChatButton.AlreadyRolled"));
        return null;
    }

    let result;
    try {
        result = await work();
    } catch (error) {
        await settle(message, [key], true);
        throw error;
    }
    if (result === CANCELED) {
        await settle(message, [key], true);
        return null;
    }
    return result;
}

/**
 * Spend a button without rolling it, such as a card for a condition that has
 * already ended.
 *
 * @param {Element} link
 * @returns {Promise<void>}
 */
export async function spendButton(link) {
    const key = buttonKey(link);
    const message = messageOf(link);
    if (key && message) await settle(message, [key], false);
}

/**
 * Work called off on a button that isn't rolled once returns null, like any
 * other refusal.
 *
 * @param {*} result
 * @returns {*}
 */
function unlessCanceled(result) {
    return result === CANCELED ? null : result;
}

/**
 * Answer a player's claim or release. Every GM receives it, and only the
 * active GM acts.
 *
 * @param {object} message The RPC message.
 * @returns {Promise<void>}
 */
export async function onChatButtonRequest(message) {
    if (!game.users.activeGM?.isSelf) return;

    const { requestId, messageId, keys } = message.payload ?? {};
    const granted = message.eventName === "releaseChatButton"
        ? await grantRelease(messageId, keys)
        : await grantClaim(messageId, keys);
    RPC.sendMessageTo(message.sender, "chatButtonAnswer", { requestId, granted });
}

/**
 * Pass the GM's answer to the click waiting for it.
 *
 * @param {object} message The RPC message.
 */
export function onChatButtonAnswer(message) {
    const { requestId, granted } = message.payload ?? {};
    pending.get(requestId)?.(Boolean(granted));
    pending.delete(requestId);
}

/**
 * Roll a dice expression on a single-use card through the claim, instead of
 * letting Foundry's own handler roll it. Bound in the capture phase so it runs
 * before that handler, which is bound to the document body.
 *
 * @param {MouseEvent} event
 * @returns {Promise<void>}
 */
export async function onSingleUseInlineRoll(event) {
    const link = event.target?.closest?.("a.inline-roll");
    if (!link || !buttonKey(link) || !messageOf(link)) return;

    event.preventDefault();
    event.stopPropagation();
    await rollOnce(link, () => foundry.applications.ux.TextEditor.implementation._onClickInlineRoll(event));
}

/**
 * Show a message's spent buttons when it is drawn.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function onRenderSpentButtons(message, html) {
    showSpentButtons(html, message.getFlag("sfrpg", SPENT_FLAG) ?? []);
}
