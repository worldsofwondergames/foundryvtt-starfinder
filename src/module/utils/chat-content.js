/**
 * Chat message content that is HTML, wrapping plain text in a span.
 *
 * Modules that read a new message's content as HTML, such as Automated
 * Animations, throw on plain text and log "COULD NOT GET ITEM ID". A span keeps
 * the text looking the same in chat.
 *
 * @param {string} [content] The message content.
 * @returns {string} The content, wrapped when it doesn't start with a tag.
 */
export function asChatHtml(content) {
    if (typeof content !== "string" || !content) return content;
    return content.trimStart().startsWith("<") ? content : `<span>${content}</span>`;
}
