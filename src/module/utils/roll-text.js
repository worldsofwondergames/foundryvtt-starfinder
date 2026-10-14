/**
 * Add text after a rendered roll's total, such as the damage type beside a
 * damage roll's number.
 *
 * Foundry v13 renders the total as an h4. Older versions used an h3, so both
 * are found. HTML with no total is returned unchanged rather than having the
 * text spliced in at the wrong place.
 *
 * @param {string} html A roll rendered by Roll#render.
 * @param {string} text The text to add.
 * @returns {string}
 */
export function appendTextToRoll(html, text) {
    return html.replace(/(<h([34]) class="dice-total">)([\s\S]*?)(<\/h\2>)/, `$1$3 ${text}$4`);
}
