/**
 * The buttons a component's action shows on the mech sheet's Actions tab.
 *
 * An action that takes an action shows that in a green button, as the special
 * actions do, and one that costs Power Points shows the cost in a blue button
 * beside it. Cloak shows both, "Standard" and "4 PP". Fade costs nothing, so it
 * shows only "Full". Both buttons use the action.
 *
 * @param {{actionType?: string|null, ppCost?: number|null}} action
 * @param {Object<string, string>} actionTypeLabels Localized names, keyed by action type.
 * @param {string} constantLabel The label for an action with neither.
 * @returns {{actionTypeLabel: string|null, ppLabel: string|null}}
 */
export function gearActionButtons(action, actionTypeLabels, constantLabel) {
    const ppLabel = action.ppCost > 0 ? `${action.ppCost} PP` : null;
    const actionTypeLabel = actionTypeLabels[action.actionType] ?? null;

    if (!ppLabel && !actionTypeLabel) return { actionTypeLabel: constantLabel, ppLabel: null };
    return { actionTypeLabel, ppLabel };
}
