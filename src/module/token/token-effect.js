import { COMPONENT_LABELS } from "../rules/mech-system-failure.js";

/**
 * A dummy Active Effect showing a mech's failing component on its token. It is
 * worked out from the component's stored status each time the token is drawn,
 * so nothing has to be created or removed as the component fails or is fixed.
 */
export class MechFailureTokenEffect {
    isTemporary = true;

    disabled = false;

    flags = {};

    /**
     * @param {Actor} actor The mech.
     * @param {{component: string, status: string, img: string, tint: string}} icon
     */
    constructor(actor, { component, status, img, tint }) {
        this.parent = actor;
        this.component = component;
        this.status = status;
        this.img = img;
        this.tint = tint;
    }

    /** Always shown, as Foundry's ACTIVE_EFFECT_SHOW_ICON.ALWAYS. */
    get showIcon() {
        return CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS;
    }

    get name() {
        return game.i18n.format("SFRPG.MechSheet.SystemFailure.TurnStartComponent", {
            component: game.i18n.localize(`SFRPG.MechSheet.Systems.${COMPONENT_LABELS[this.component]}`),
            status: game.i18n.localize(CONFIG.SFRPG.mechSystemStatus[this.status])
        });
    }

    get statuses() {
        return new Set([`mech-${this.component}-${this.status}`]);
    }

    get duration() {
        return {
            type: "none",
            seconds: null,
            rounds: null,
            turns: null,
            combat: null,
            startTime: null,
            startRound: null,
            startTurn: null,
            label: ""
        };
    }

    getFlag() {
        return undefined;
    }
}

/**
 * A class to create dummy Active Effects used to display icons on tokens
 */
export class TokenEffect {
    #effect;

    tint = null;

    isTemporary = true;

    constructor(effect) {
        this.#effect = effect;
    }

    get parent() {
        return this.#effect.parent;
    }

    /**
     * In Foundry V14 Compared to CONST ACTIVE_EFFECT_SHOW_ICON
     * The icon is never shown. NEVER: 0,
     * The icon is showed if the ActiveEffect has a temporary duration. CONDITIONAL: 1,
     * The icon is always shown. ALWAYS: 2
     */
    get showIcon() {
        return this.#effect.system.showOnToken ? 1 : 0;
    }

    get name() {
        return this.#effect.name;
    }

    get img() {
        return this.#effect.img;
    }

    get description() {
        return this.#effect.system.description.value;
    }

    get flags() {
        return this.#effect.flags;
    }

    get statuses() {
        return new Set([this.#effect.name.slugify({replacement: "-", strict: true})]);
    }

    get disabled() {
        return this.#effect.type === "effect" && this.#effect.isExpired;
    }

    get duration() {
        const effect = this.#effect;
        const isEffect = effect.type === "effect";

        return {
            type: "none",
            seconds: null,
            rounds: null,
            turns: null,
            combat: null,
            startTime: isEffect ? effect.system.activeDuration.activationTime : null,
            startRound: null,
            startTurn: isEffect ? effect.system.activeDuration.expiryInit : null,
            label: isEffect ? effect.system.activeDuration.remaining : ""
        };
    }

    getFlag(scope, flag) {
        return this.#effect.getFlag(scope, flag);
    }
}
