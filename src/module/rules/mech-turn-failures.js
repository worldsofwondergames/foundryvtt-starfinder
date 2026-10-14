import { COMPONENT_LABELS } from "./mech-system-failure.js";
import { auxiliaryFailureChance } from "./mech-system-effects.js";

const FAILED = ["malfunctioning", "inoperable"];

/**
 * A mech's malfunctioning and inoperable components, in the order the sheet
 * lists them.
 *
 * @param {Object<string, {value: string}>} systems The mech's stored component statuses.
 * @returns {{component: string, status: string}[]}
 */
export function failedComponents(systems = {}) {
    return Object.keys(COMPONENT_LABELS)
        .map(component => ({ component, status: systems[component]?.value }))
        .filter(({ status }) => FAILED.includes(status));
}

/** The icon each component shows on the mech's token while it is failing. */
export const FAILURE_ICONS = Object.freeze({
    upperLimbs: "icons/svg/sword.svg",
    lowerLimbs: "icons/svg/wingfoot.svg",
    frame: "icons/svg/shield.svg",
    auxSystem: "icons/svg/aura.svg",
    powerCore: "icons/svg/lightning.svg",
    cockpit: "icons/svg/eye.svg"
});

/** The tint of a failing component's icon: amber while malfunctioning, red once inoperable. */
export const FAILURE_TINTS = Object.freeze({
    malfunctioning: "#e8a317",
    inoperable: "#d42a2a"
});

/**
 * The icons a mech's token shows for its failing components. They follow the
 * stored status, so a Power Points override, which leaves it alone, does not
 * change them.
 *
 * @param {Object<string, {value: string}>} systems The mech's stored component statuses.
 * @returns {{component: string, status: string, img: string, tint: string}[]}
 */
export function failureIcons(systems = {}) {
    return failedComponents(systems).map(({ component, status }) => ({
        component,
        status,
        img: FAILURE_ICONS[component],
        tint: FAILURE_TINTS[status]
    }));
}

/**
 * What a mech's System Failure card lists at the start of its turn.
 *
 * Every failing component is listed with what it costs, so the operators are
 * reminded each turn. An auxiliary system that gives a constant benefit is never
 * activated, so the check a failing auxiliary component owes is made for it at
 * the start of each turn instead. A system that has stopped working is listed
 * on its own, since there is nothing left to check.
 *
 * The turn's overrides and failed checks are cleared as the turn starts, so
 * neither is read here.
 *
 * @param {Object<string, {value: string}>} systems The mech's component statuses.
 * @param {{id: string, name: string, constant: boolean, disabled: boolean}[]} auxiliary
 *     Its auxiliary systems, with whether each gives a constant benefit and
 *     whether a failure has stopped it.
 * @returns {{components: {component: string, status: string}[], checks: {id: string, name: string, chance: number}[], stopped: string[]}|null}
 *     The lines, or null when nothing is failing.
 */
export function turnStartFailures(systems = {}, auxiliary = []) {
    const components = failedComponents(systems);

    const chance = auxiliaryFailureChance(systems.auxSystem?.value);
    const checks = chance > 0
        ? auxiliary.filter(system => system.constant && !system.disabled)
            .map(({ id, name }) => ({ id, name, chance }))
        : [];
    const stopped = auxiliary.filter(system => system.disabled).map(system => system.name);

    if (components.length === 0 && checks.length === 0 && stopped.length === 0) return null;
    return { components, checks, stopped };
}
