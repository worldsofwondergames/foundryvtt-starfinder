import SFRPGItemBase from './base-item.mjs';

const { fields } = foundry.data;

export default class SFRPGItemMechWeapon extends SFRPGItemBase {

    static LOCALIZATION_PREFIXES = [
        'SFRPG.Item.Base',
        'SFRPG.Item.MechWeapon'
    ];

    static defineSchema() {
        const schema = super.defineSchema();

        foundry.utils.mergeObject(schema, {
            damage: new fields.SchemaField({
                parts: new fields.ArrayField(
                    new fields.SchemaField(
                        SFRPGItemBase.damagePartTemplate(),
                        {required: false, nullable: true}
                    ),
                    {required: true}
                )
            }),
            weaponType: new fields.StringField({
                initial: "melee",
                blank: false,
                required: true,
                label: "SFRPG.MechSheet.Weapon.Type"
            }),
            slot: new fields.StringField({
                initial: "frame",
                blank: false,
                required: true,
                label: "SFRPG.MechSheet.Weapon.Slot"
            }),
            range: new fields.StringField({
                initial: "",
                blank: true,
                label: "SFRPG.MechSheet.Weapon.Range"
            }),
            area: new fields.StringField({
                initial: "",
                blank: true,
                label: "SFRPG.MechSheet.Weapon.Area"
            }),
            capacity: new fields.NumberField({
                initial: null,
                min: 0,
                integer: true,
                nullable: true,
                label: "SFRPG.MechSheet.Weapon.Capacity"
            }),
            usage: new fields.NumberField({
                initial: null,
                min: 0,
                integer: true,
                nullable: true,
                label: "SFRPG.MechSheet.Weapon.Usage"
            }),
            ppCost: new fields.NumberField({
                initial: 0,
                min: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Weapon.PpCost"
            }),
            mpCost: new fields.NumberField({
                initial: 0,
                min: 0,
                integer: true,
                required: true,
                label: "SFRPG.MechSheet.Weapon.MpCost"
            }),
            save: new fields.SchemaField({
                ...SFRPGItemBase.saveTemplate()
            }, {
                required: true,
                label: "SFRPG.Items.Action.SavingThrow"
            }),
            special: new fields.StringField({
                initial: "",
                blank: true,
                label: "SFRPG.MechSheet.Weapon.Special"
            })
        });

        return schema;
    }
}
