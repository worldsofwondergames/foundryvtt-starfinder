# How Conditions End

A survey of the 42 condition items in `src/items/conditions/`, made for #96. Each
row quotes the clause in the item's own description that says how the condition
ends. Where the description has no such clause, the row says so, and the
condition lasts as long as the spell, attack or ability that caused it.

A **Time** condition ends after a duration, and a **Check** condition ends on a
saving throw or skill check. An **Event** condition ends when something happens,
such as healing, repair or standing up. A **Source** condition has no end clause
in its description, so it ends with its source.

The system handles some of these already. Conditions in the **Time** and
**Source** categories can be given a number of rounds when they are switched on
(14.1.5). Burning, Corrode and Frostbite offer their Reflex save at the end of
the creature's turn, Bleeding has a Stop bleeding link for the Medicine check,
and a timed condition can be given a save to end it (14.1.8).

| Condition | Category | End clause |
| --- | --- | --- |
| Asleep | Check, Event | "If you succeed at a Perception check to notice something despite the penalty, you automatically awaken. You are also awoken if you are slapped or wounded. An ally can wake you as a standard action." |
| Bleeding | Check, Event | "Your bleeding can be stopped with a successful DC 15 Medicine check as a standard action, or through the application of any ability that restores Hit Points." |
| Blinded | Source | No end clause in its text. |
| Broken (Armor) | Event | "Items lose the broken condition if the spell restores the object to half its original Hit Points or higher." Magic items can also be repaired with Mysticism and technological items with Engineering. |
| Broken (Tool or Aug) | Event | Same as Broken (Armor). |
| Broken (Vehicle) | Event | Same as Broken (Armor). |
| Broken (Weapon) | Event | Same as Broken (Armor). |
| Burning | Check, Event | "At the end of each round you are burning, you can attempt a Reflex saving throw to remove this condition. The DC of this saving throw is equal to 10 + the amount of fire damage you took this round from the burning condition." Also: "You can also automatically end this condition by jumping into enough water to douse yourself." |
| Confused | Source | No end clause in its text. |
| Corrode | Check | "See Burning for the saving throw that ends the condition." |
| Cowering | Source | No end clause in its text. |
| Dazed | Time | "A dazed condition typically lasts 1 round." |
| Dazzled | Source | No end clause in its text. |
| Dead | Event | "You can be restored to life via magic or technology capable of such a feat." |
| Deafened | Source | No end clause in its text. |
| Dying | Event | "Stabilizing or being healed above 0 Hit Points ends the dying condition, as does death." |
| Encumbered | Source | No end clause in its text. |
| Entangled | Source | No end clause in its text. |
| Exhausted | Time | "After 1 hour of complete rest, you instead become Fatigued." |
| Fascinated | Check, Event | "Any potential threat, such as a hostile creature approaching, grants you a new saving throw against the fascinating effect. Any obvious threat, such as someone drawing a weapon, casting a spell, or aiming a ranged weapon at you, automatically ends the condition. An ally can shake you free of the effect and end this condition as a standard action." |
| Fatigued | Time | "After 8 hours of complete rest, you are no longer fatigued." |
| Flat-Footed | Event | "At the start of a combat, if you are surprised, you are Flat-Footed until you become aware of combat and have had a chance to act." |
| Frightened | Time | "The duration of the Frightened condition increases by the duration of the second effect." |
| Frostbite | Check | "See Burning for the saving throw that ends the condition." |
| Grappled | Check | Refers to "your check to escape being Grappled". |
| Helpless | Source | No end clause in its text. |
| Invisible | Source | No end clause in its text. |
| Nauseated | Source | No end clause in its text. |
| Negative Level | Check, Event | "If you have temporary negative levels, you can attempt a saving throw each day to remove those negative levels. The DC is the same as the DC of the effect that caused the negative levels." Also: "Permanent negative levels can be removed through spells such as Restoration." |
| Off-Kilter | Event | "You must use a method of propulsion to right yourself or grab a stabilizing object such as a wall or ladder (usually as a move action) in order to end this condition." |
| Off-Target | Source | No end clause in its text. |
| Overburdened | Source | No end clause in its text. |
| Panicked | Source | No end clause in its text. |
| Paralyzed | Source | No end clause in its text. |
| Pinned | Check | "You can always attempt to free yourself, usually through an attack roll or Acrobatics check." |
| Prone | Event | "Standing up from prone is a move action." |
| Shaken | Time | "The duration of the shaken condition increases by the duration of the second effect." |
| Sickened | Source | No end clause in its text. |
| Stable | Source | No end clause in its text. |
| Staggered | Source | No end clause in its text. |
| Stunned | Source | No end clause in its text. |
| Unconscious | Source | No end clause in its text. |

## Not Yet Surveyed

- Afflictions, meaning diseases, poisons, drugs, radiation and curses, with their onset, save intervals, tracks and cures.
- Mech conditions and mech system status.
- Starship critical damage conditions.
- Vehicle conditions.
- Monster abilities and universal creature rules that impose conditions with their own end clauses.
- Conditions imposed by spells and items, which end with their source.
