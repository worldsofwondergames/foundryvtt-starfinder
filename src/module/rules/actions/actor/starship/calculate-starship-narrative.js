import { narrativeInputFromShip } from "../../../narrative-starship/actor-input.js";
import { deriveNarrativeStats } from "../../../narrative-starship/stats.js";

export default function(engine) {
    engine.closures.add("calculateStarshipNarrative", (fact) => {
        const data = fact.data;
        const useAlternate = game.settings.get("sfrpg", "narrativeAlternateDCs");

        const derived = deriveNarrativeStats(narrativeInputFromShip(data, fact.items, useAlternate));
        derived.hpValue = data.narrative.hp.value ?? derived.hpMax;
        data.narrative.derived = derived;

        return fact;
    });
}
