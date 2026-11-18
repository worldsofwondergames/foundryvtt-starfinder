import SFRPGItemBase from './base-item.mjs';

const { fields } = foundry.data;

export default class SFRPGItemMechUpgrade extends SFRPGItemBase {

    static LOCALIZATION_PREFIXES = [
        'SFRPG.Item.Base',
        'SFRPG.Item.MechUpgrade'
    ];

    static defineSchema() {
        const schema = super.defineSchema();

        foundry.utils.mergeObject(schema, {
            mpCost: new fields.NumberField({
                initial: 0,
                min: 0,
                required: true,
                label: "SFRPG.MechSheet.Upgrade.MpCost"
            }),
            eacBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.EacBonus"
            }),
            kacBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.KacBonus"
            }),
            reflexBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.ReflexBonus"
            }),
            fortitudeBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.FortitudeBonus"
            }),
            speedBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.SpeedBonus"
            }),
            baseHpBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.BaseHpBonus"
            }),
            hpAdvancementBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.HpAdvancementBonus"
            }),
            spBonusPerTier: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.SpBonusPerTier"
            }),
            repeatable: new fields.BooleanField({
                initial: true,
                label: "SFRPG.MechSheet.Upgrade.Repeatable"
            }),
            repeatCostStep: new fields.NumberField({
                initial: 1,
                min: 0,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.RepeatCostStep"
            }),
            coreTemplate: new fields.BooleanField({
                initial: false,
                label: "SFRPG.MechSheet.Upgrade.CoreTemplate"
            }),
            ppRegenBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.PpRegenBonus"
            }),
            ppInitialBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.PpInitialBonus"
            }),
            ppMaxBonus: new fields.NumberField({
                initial: 0,
                integer: true,
                nullable: false,
                label: "SFRPG.MechSheet.Upgrade.PpMaxBonus"
            })
        });

        return schema;
    }
}
