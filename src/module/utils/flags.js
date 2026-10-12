/**
 * Clear one of the system's flags on a document.
 *
 * An unlinked token's actor is built from the base actor plus the token's own
 * changes. Unsetting a flag only removes the token's change, so a value the
 * base actor still holds shows through again and the flag never clears. Writing
 * null instead hides the base actor's value. Every other document is unset as
 * normal.
 *
 * @param {{isToken?: boolean, setFlag: Function, unsetFlag: Function}} document The actor or item.
 * @param {string} key The flag's name under the sfrpg scope.
 * @returns {Promise<*>} The update.
 */
export function clearSystemFlag(document, key) {
    if (document.isToken) return document.setFlag("sfrpg", key, null);
    return document.unsetFlag("sfrpg", key);
}
