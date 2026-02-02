import SFRPGActorBase from "./base-actor.mjs";

const { fields } = foundry.data;

export default class SFRPGActorMech extends SFRPGActorBase {
    static defineSchema() {
        const schema = super.defineSchema();

        // merge schema with templates
        foundry.utils.mergeObject(schema, {
            ...SFRPGActorBase.conditionsTemplate(),
            ...SFRPGActorBase.crewTemplate({type: "mech"})
        });

        // Add additional fields needed to template fields
        foundry.utils.mergeObject(schema, {
            attributes: new fields.SchemaField({
                hp: new fields.SchemaField({
                    max: new fields.NumberField({
                        initial: 10,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    }),
                    value: new fields.NumberField({
                        initial: 10,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    })
                }, {label: "SFRPG.Health"}),
                sp: new fields.SchemaField({
                    max: new fields.NumberField({
                        initial: 0,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    }),
                    value: new fields.NumberField({
                        initial: 0,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    })
                }, {label: "SFRPG.MechSheet.Attributes.ShieldPoints"}),
                hardness: new fields.NumberField({
                    initial: 0,
                    min: 0,
                    integer: true,
                    nullable: false,
                    required: true,
                    label: "SFRPG.MechSheet.Attributes.Hardness"
                }),
                eac: new fields.SchemaField({
                    value: new fields.NumberField({
                        initial: 10,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    })
                }, {label: "SFRPG.EnergyArmorClassShort", hint: "SFRPG.EnergyArmorClass"}),
                kac: new fields.SchemaField({
                    value: new fields.NumberField({
                        initial: 10,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    })
                }, {label: "SFRPG.KineticArmorClassShort", hint: "SFRPG.KineticArmorClass"}),
                strength: new fields.SchemaField({
                    value: new fields.NumberField({
                        initial: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    })
                }, {label: "SFRPG.MechSheet.Attributes.EffectiveStrength"}),
                attackBonus: new fields.SchemaField({
                    value: new fields.NumberField({
                        initial: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    })
                }, {label: "SFRPG.MechSheet.Attributes.AttackBonus"}),
                pp: new fields.SchemaField({
                    initial: new fields.NumberField({
                        initial: 3,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    }),
                    max: new fields.NumberField({
                        initial: 5,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    }),
                    regen: new fields.NumberField({
                        initial: 1,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    }),
                    value: new fields.NumberField({
                        initial: 3,
                        min: 0,
                        integer: true,
                        nullable: false,
                        required: true
                    })
                }, {label: "SFRPG.MechSheet.Attributes.PowerPoints"}),
                speed: new fields.SchemaField({
                    land: new fields.StringField({
                        initial: "60 ft.",
                        blank: true,
                        label: "SFRPG.MechSheet.Attributes.Speed.Land"
                    }),
                    fly: new fields.StringField({
                        initial: "",
                        blank: true,
                        label: "SFRPG.MechSheet.Attributes.Speed.Fly"
                    }),
                    swim: new fields.StringField({
                        initial: "",
                        blank: true,
                        label: "SFRPG.MechSheet.Attributes.Speed.Swim"
                    })
                }),
                reach: new fields.StringField({
                    initial: "15 ft.",
                    blank: true,
                    label: "SFRPG.Reach"
                }),
                senses: new fields.StringField({
                    initial: "darkvision 120 ft., low-light vision, blindsense (vibration) 30 ft.",
                    blank: true,
                    label: "SFRPG.MechSheet.Attributes.Senses"
                }),
                size: new fields.StringField({
                    initial: "huge",
                    blank: false,
                    choices: Object.keys(CONFIG.SFRPG.mechSizes),
                    required: true,
                    label: "SFRPG.Size"
                }),
                systems: new fields.SchemaField({
                    upperLimbs: new fields.SchemaField(
                        SFRPGActorMech._mechSystemFieldData(),
                        {label: "SFRPG.MechSheet.Systems.UpperLimbs"}
                    ),
                    lowerLimbs: new fields.SchemaField(
                        SFRPGActorMech._mechSystemFieldData(),
                        {label: "SFRPG.MechSheet.Systems.LowerLimbs"}
                    ),
                    frame: new fields.SchemaField(
                        SFRPGActorMech._mechSystemFieldData(),
                        {label: "SFRPG.MechSheet.Systems.Frame"}
                    ),
                    powerCore: new fields.SchemaField(
                        SFRPGActorMech._mechSystemFieldData(),
                        {label: "SFRPG.MechSheet.Systems.PowerCore"}
                    ),
                    auxSystem: new fields.SchemaField(
                        SFRPGActorMech._mechSystemFieldData(),
                        {label: "SFRPG.MechSheet.Systems.AuxSystem"}
                    )
                }),
                slots: new fields.SchemaField({
                    frame: new fields.NumberField({
                        initial: 2,
                        min: 0,
                        integer: true,
                        nullable: false,
                        label: "SFRPG.MechSheet.Attributes.Slots.Frame"
                    }),
                    upperLimb: new fields.NumberField({
                        initial: 0,
                        min: 0,
                        integer: true,
                        nullable: false,
                        label: "SFRPG.MechSheet.Attributes.Slots.UpperLimb"
                    }),
                    lowerLimb: new fields.NumberField({
                        initial: 0,
                        min: 0,
                        integer: true,
                        nullable: false,
                        label: "SFRPG.MechSheet.Attributes.Slots.LowerLimb"
                    }),
                    auxiliary: new fields.NumberField({
                        initial: 2,
                        min: 0,
                        integer: true,
                        nullable: false,
                        label: "SFRPG.MechSheet.Attributes.Slots.Auxiliary"
                    })
                })
            }),
            currency: new fields.SchemaField({
                mp: new fields.NumberField({
                    initial: 0,
                    min: 0,
                    nullable: true
                })
            }),
            details: new fields.SchemaField({
                tier: new fields.NumberField({
                    initial: 1,
                    min: 0,
                    nullable: false,
                    label: "SFRPG.MechSheet.Details.Tier"
                }),
                frame: new fields.StringField({
                    initial: "",
                    blank: true,
                    label: "SFRPG.MechSheet.Details.Frame"
                }),
                model: new fields.StringField({
                    initial: "",
                    blank: true,
                    label: "SFRPG.MechSheet.Details.Model"
                }),
                notes: new fields.HTMLField(),
                source: new fields.StringField({
                    initial: "",
                    blank: true,
                    label: "SFRPG.SourceBook"
                })
            })
        });

        return schema;
    }

    static _mechSystemFieldData() {
        return {
            value: new fields.StringField({
                initial: "nominal",
                blank: false,
                choices: Object.keys(CONFIG.SFRPG.mechSystemStatus),
                required: true,
                label: "SFRPG.MechSheet.Systems.Status"
            })
        };
    }
}
