/**
 * Round state for narrative starship combat. Plain JSON, stored in a combat flag.
 * Every function returns a new state and leaves its input untouched.
 */

function copyState(state) {
    const ships = {};
    for (const [id, ship] of Object.entries(state.ships)) ships[id] = { ...ship, flags: [...ship.flags] };
    const usedOnce = {};
    for (const [id, list] of Object.entries(state.usedOnce)) usedOnce[id] = [...list];
    const copyLists = lists => Object.fromEntries(Object.entries(lists ?? {}).map(([id, list]) => [id, [...list]]));
    return {
        ships,
        modifiers: state.modifiers.map(modifier => ({ ...modifier })),
        skillsThisRound: copyLists(state.skillsThisRound),
        skillsLastRound: copyLists(state.skillsLastRound),
        actedThisRound: { ...state.actedThisRound },
        allowedActions: { ...state.allowedActions },
        usedOnce,
        allOutAttackLockedUntilRound: state.allOutAttackLockedUntilRound
    };
}

/**
 * Builds the state for the start of a combat. Crew is not stored; it comes from the actors.
 * @param {Array<{id: string, side: "pc"|"enemy"}>} ships
 * @returns {object}
 */
export function initialState(ships) {
    const state = {
        ships: {},
        modifiers: [],
        skillsThisRound: {},
        skillsLastRound: {},
        actedThisRound: {},
        allowedActions: {},
        usedOnce: {},
        allOutAttackLockedUntilRound: 0
    };
    for (const { id, side } of ships) {
        state.ships[id] = {
            side,
            successes: 0,
            hitsThisRound: 0,
            tactic: null,
            tacticTarget: null,
            forcedTactic: null,
            flags: []
        };
        state.usedOnce[id] = [];
    }
    return state;
}

/**
 * @param {object} state
 * @param {{shipId: string, actorId: string, role: string}} who
 * @param {Record<string, Record<string, string[]>>} crewByShip
 * @returns {{ok: boolean, reason?: string}}
 */
export function canAct(state, { shipId, actorId, role }, crewByShip) {
    const ship = state.ships[shipId];
    if (!ship || ship.side !== "pc") return { ok: false, reason: "wrongSide" };
    const crew = crewByShip?.[shipId]?.[role] ?? [];
    if (!crew.includes(actorId)) return { ok: false, reason: "notCrew" };
    const allowed = state.allowedActions[actorId] ?? 1;
    if ((state.actedThisRound[actorId] ?? 0) >= allowed) return { ok: false, reason: "alreadyActed" };
    return { ok: true };
}

/**
 * @param {object} state
 * @param {string} targetId
 * @param {number} n
 * @returns {object}
 */
export function addSuccesses(state, targetId, n) {
    const next = copyState(state);
    next.ships[targetId].successes += n;
    return next;
}

/**
 * Counts one action for the actor and adds the skill to the ones used this round.
 * @param {object} state
 * @param {string} actorId
 * @param {string} skillKey
 * @returns {object}
 */
export function recordAction(state, actorId, skillKey) {
    const next = copyState(state);
    next.actedThisRound[actorId] = (next.actedThisRound[actorId] ?? 0) + 1;
    next.skillsThisRound[actorId] = [...(next.skillsThisRound[actorId] ?? []), skillKey];
    return next;
}

/**
 * Gives the actor one more action this round (Give Orders).
 * @param {object} state
 * @param {string} actorId
 * @returns {object}
 */
export function grantExtraAction(state, actorId) {
    const next = copyState(state);
    next.allowedActions[actorId] = (next.allowedActions[actorId] ?? 1) + 1;
    return next;
}

/**
 * @param {object} state
 * @param {{target: string, kind: string, value: number, expiresAfterRound: number, fromRound?: number}} modifier
 * fromRound, when given, is the first round the modifier counts in. Use it for effects that start next round.
 * @returns {object}
 */
export function addModifier(state, { target, kind, value, expiresAfterRound, fromRound }) {
    const next = copyState(state);
    const modifier = { target, kind, value, expiresAfterRound };
    if (fromRound !== undefined) modifier.fromRound = fromRound;
    next.modifiers.push(modifier);
    return next;
}

/**
 * Sum of active modifiers for a target and kind during the given round.
 * @param {object} state
 * @param {string} target
 * @param {string} kind
 * @param {number} round
 * @returns {number}
 */
export function modifiersFor(state, target, kind, round) {
    return state.modifiers
        .filter(m => m.target === target && m.kind === kind && m.expiresAfterRound >= round && (m.fromRound ?? 0) <= round)
        .reduce((sum, m) => sum + m.value, 0);
}

/**
 * Turns successes into hits, checks for ships going out, and clears per-round data, including
 * each enemy's chosen tactic.
 * Hits from other sources are applied by callers.
 * @param {object} state
 * @param {Record<string, {threshold: number, hp: number}>} statsById
 * @param {Record<string, number>} hpById Hits each ship can still take before this round.
 * @param {number} round
 * @returns {{state: object, hits: Record<string, number>, out: string[], ended: "pcWin"|"pcLoss"|null}}
 */
export function resolveRound(state, statsById, hpById, round) {
    const next = copyState(state);
    const hits = {};
    const out = [];
    const gone = new Set();
    for (const [id, ship] of Object.entries(next.ships)) {
        const stats = statsById[id];
        const remaining = hpById[id] ?? stats?.hp ?? 0;
        const threshold = Math.max(1, stats?.threshold ?? 1);
        const taken = Math.floor(ship.successes / threshold);
        hits[id] = taken;
        ship.successes -= taken * threshold;
        if (remaining <= 0) {
            gone.add(id);
        } else if (taken >= remaining) {
            gone.add(id);
            out.push(id);
        }
    }
    const sideOut = side => {
        const ids = Object.keys(next.ships).filter(id => next.ships[id].side === side);
        return ids.length > 0 && ids.every(id => gone.has(id));
    };
    let ended = null;
    if (sideOut("pc")) ended = "pcLoss";
    else if (sideOut("enemy")) ended = "pcWin";

    for (const ship of Object.values(next.ships)) {
        ship.hitsThisRound = 0;
        ship.tactic = null;
        ship.tacticTarget = null;
    }
    // Only the skills used this round count against next round. A crew member who skipped this round has none.
    next.skillsLastRound = next.skillsThisRound;
    next.skillsThisRound = {};
    next.actedThisRound = {};
    next.allowedActions = {};
    next.modifiers = next.modifiers.filter(m => m.expiresAfterRound > round);
    return { state: next, hits, out, ended };
}
