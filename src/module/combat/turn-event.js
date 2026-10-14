/**
 * Run one of the system's turn or round events and wait for it to finish.
 *
 * Foundry runs a combat's turn events one after another, and a failure in one
 * would stop the rest, including the next creature's start of turn. A failure
 * is logged instead, so the combat carries on.
 *
 * @param {string} label What the event is, for the log, such as "End of Boz's turn".
 * @param {function(): Promise<*>} work The event's work.
 * @returns {Promise<void>}
 */
export async function runTurnEvent(label, work) {
    try {
        await work();
    } catch (error) {
        console.error(`Starfinder | ${label} failed`, error);
    }
}
