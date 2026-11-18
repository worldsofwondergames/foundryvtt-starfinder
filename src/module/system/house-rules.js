import { houseRuleThrownFeet } from "../rules/mech-thrown.js";

/**
 * World settings for house rules. They are registered after the system's other
 * settings, so Foundry lists them together at the end of the system's settings,
 * under the heading added on render.
 */

/** The house rule settings, in the order they are listed. */
export const HOUSE_RULE_SETTINGS = ["houseRuleMechUpgradeLimit", "houseRuleThrownMechRange"];

/**
 * The thrown mech weapon range the house rule sets, in feet.
 *
 * @returns {number|null} Null when the setting is blank, to keep each weapon's own range.
 */
export function thrownHouseFeet() {
    return houseRuleThrownFeet(game.settings.get("sfrpg", "houseRuleThrownMechRange"));
}

/** Register the house rule settings. */
export function registerHouseRuleSettings() {
    game.settings.register("sfrpg", "houseRuleMechUpgradeLimit", {
        name: "SFRPG.Settings.HouseRules.MechUpgradeLimit.Name",
        hint: "SFRPG.Settings.HouseRules.MechUpgradeLimit.Hint",
        scope: "world",
        config: true,
        default: false,
        type: Boolean,
        onChange: () => {
            for (const actor of game.actors.filter(a => a.type === "mech")) {
                if (actor.sheet?.rendered) actor.sheet.render(false);
            }
        }
    });

    game.settings.register("sfrpg", "houseRuleThrownMechRange", {
        name: "SFRPG.Settings.HouseRules.ThrownMechRange.Name",
        hint: "SFRPG.Settings.HouseRules.ThrownMechRange.Hint",
        scope: "world",
        config: true,
        default: "",
        type: String,
        onChange: () => {
            for (const actor of game.actors.filter(a => a.type === "mech")) {
                if (actor.sheet?.rendered) actor.sheet.render(false);
            }
        }
    });
}

/**
 * Put a House Rules heading above the first house rule setting.
 *
 * @param {Application} app The settings window.
 * @param {HTMLElement|JQuery} html Its rendered element.
 */
export function addHouseRulesHeading(app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector(".sfrpg-house-rules-heading")) return;

    const input = root.querySelector(`[name="sfrpg.${HOUSE_RULE_SETTINGS[0]}"]`);
    const group = input?.closest(".form-group");
    if (!group) return;

    const heading = document.createElement("h3");
    heading.className = "sfrpg-house-rules-heading";
    heading.textContent = game.i18n.localize("SFRPG.Settings.HouseRules.Heading");
    group.before(heading);
}
