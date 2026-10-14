import { COMPONENT_LABELS } from "./mech-system-failure.js";
import { auxiliaryFailureChance } from "./mech-system-effects.js";

const FAILED = ["malfunctioning", "inoperable"];

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
    const components = Object.keys(COMPONENT_LABELS)
        .map(component => ({ component, status: systems[component]?.value }))
        .filter(({ status }) => FAILED.includes(status));

    const chance = auxiliaryFailureChance(systems.auxSystem?.value);
    const checks = chance > 0
        ? auxiliary.filter(system => system.constant && !system.disabled)
            .map(({ id, name }) => ({ id, name, chance }))
        : [];
    const stopped = auxiliary.filter(system => system.disabled).map(system => system.name);

    if (components.length === 0 && checks.length === 0 && stopped.length === 0) return null;
    return { components, checks, stopped };
}
