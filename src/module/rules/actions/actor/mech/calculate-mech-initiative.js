import { mechInitiative } from "../../../mech-initiative.js";

export default function(engine) {
    engine.closures.add("calculateMechInitiative", (fact) => {
        const data = fact.data;
        const actor = fact.actor;

        if (!data.attributes.init) {
            data.attributes.init = {};
        }

        const init = data.attributes.init;
        init.tooltip = [];

        const operators = actor.crew?.operator?.actors?.filter(a => a) || [];
        const tier = data.details?.tier ?? 0;
        const { total, operatorMod, tierMinimum, lowestIndex } = mechInitiative(
            operators.map(operator => operator.system?.attributes?.init?.total ?? 0),
            tier
        );

        init.mod = operatorMod;
        init.total = total;

        if (lowestIndex !== null) {
            init.tooltip.push(game.i18n.format("SFRPG.MechSheet.Initiative.OperatorTooltip", {
                name: operators[lowestIndex].name,
                mod: operatorMod.signedString()
            }));
        } else {
            init.tooltip.push(game.i18n.localize("SFRPG.MechSheet.Initiative.NoOperatorTooltip"));
        }

        if (tierMinimum > 0) {
            init.tooltip.push(game.i18n.format("SFRPG.MechSheet.Initiative.TierMinimumTooltip", {
                mod: tierMinimum.signedString(),
                tier: tier
            }));
        }

        init.rollTooltip = [...init.tooltip];

        return fact;
    });
}
