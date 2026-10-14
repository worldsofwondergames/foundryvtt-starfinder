import { failedComponents } from "../rules/mech-turn-failures.js";
import { failureLine } from "./mech-failure-link.js";

/**
 * Whether an actor update changed a mech's stored component statuses, which
 * its token's failure icons are drawn from.
 *
 * @param {{type: string}} actor
 * @param {object} changed The update's changes.
 * @returns {boolean}
 */
export function changesFailureIcons(actor, changed) {
    return actor?.type === "mech" && foundry.utils.hasProperty(changed ?? {}, "system.attributes.systems");
}

/**
 * Redraw the effect icons of a mech's tokens after its components change. A
 * linked token is only redrawn by Foundry for changes to its own effects.
 *
 * @param {Actor} actor
 * @param {object} changed
 */
export function onUpdateMechSystems(actor, changed) {
    if (!changesFailureIcons(actor, changed)) return;
    for (const token of actor.getActiveTokens()) token.renderFlags.set({ redrawEffects: true });
}

/**
 * What a mech token's tooltip says: one line for each failing component.
 *
 * @param {Actor} actor
 * @returns {string|null} The HTML, or null when nothing is failing.
 */
export function failureTooltip(actor) {
    if (actor?.type !== "mech") return null;
    const lines = failedComponents(actor.system.attributes?.systems).map(({ component, status }) => failureLine(component, status));
    return lines.length ? `<ul class="mech-turn-failures">${lines.map(line => `<li>${line}</li>`).join("")}</ul>` : null;
}

let anchor = null;

/**
 * Show a mech's failing components in a tooltip above its token while it is
 * hovered. Foundry gives the icons on a token no tooltip of their own.
 *
 * @param {Token} token
 * @param {boolean} hovered
 */
export function onHoverMechToken(token, hovered) {
    if (!hovered) {
        if (anchor && game.tooltip.element === anchor) game.tooltip.deactivate();
        return;
    }

    const html = failureTooltip(token.actor);
    if (!html) return;

    anchor ??= Object.assign(document.body.appendChild(document.createElement("div")), { id: "sfrpg-mech-failure-anchor" });
    const { x, y } = canvas.clientCoordinatesFromCanvas({ x: token.center.x, y: token.document.y });
    Object.assign(anchor.style, { position: "fixed", left: `${x}px`, top: `${y}px`, width: "1px", height: "1px", pointerEvents: "none" });
    game.tooltip.activate(anchor, { html, direction: "UP", cssClass: "mech-failure-tooltip" });
}
