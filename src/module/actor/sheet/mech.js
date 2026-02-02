import { ActorSFRPG } from "../actor.js";
import { ActorSheetSFRPG } from "./base.js";

/**
 * An Actor sheet for a mech in the SFRPG system.
 * @type {ActorSheetSFRPG}
 */
export class ActorSheetSFRPGMech extends ActorSheetSFRPG {
    constructor(...args) {
        super(...args);

        this.acceptedItemTypes.push(...CONFIG.SFRPG.mechDefinitionItemTypes);
        this.acceptedItemTypes.push(...CONFIG.SFRPG.physicalItemTypes);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["sfrpg", "sheet", "actor", "mech"],
            width: 700
        });
    }

    get template() {
        if (!game.user.isGM && this.actor.limited) return "systems/sfrpg/templates/actors/mech-sheet-limited.hbs";
        return "systems/sfrpg/templates/actors/mech-sheet-full.hbs";
    }

    async getData() {
        const data = await super.getData();

        const tier = parseFloat(data.system.details.tier || 0);
        const tiers = { 0: "0", 0.25: "1/4", [1 / 3]: "1/3", 0.5: "1/2" };
        data.labels["tier"] = tier >= 1 ? String(tier) : tiers[tier] || 1;

        this._getCrewData(data);

        // Enrich text editors
        data.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(this.actor.system.details.notes, {
            async: true,
            rollData: this.actor.getRollData() ?? {},
            secrets: this.actor.isOwner
        });

        return data;
    }

    /**
     * Process any flags that the crew actor might have that would affect the sheet.
     *
     * @param {Object} data The data object to update with any crew data.
     */
    async _getCrewData(data) {
        const crewData = this.actor.system.crew;

        const pilotActors = crewData.pilot.actorIds.map(crewId => game.actors.get(crewId));
        const operatorActors = crewData.operator.actorIds.map(crewId => game.actors.get(crewId));
        const passengerActors = crewData.passenger.actorIds.map(crewId => game.actors.get(crewId));

        const localizedNoLimit = game.i18n.format("SFRPG.MechSheet.Crew.UnlimitedMax");

        const crew = {
            pilots: {
                label:
                    game.i18n.format("SFRPG.MechSheet.Crew.Pilot")
                    + " "
                    + game.i18n.format("SFRPG.MechSheet.Crew.AssignedCount", {
                        current: pilotActors.length,
                        max: crewData.pilot.limit > -1 ? crewData.pilot.limit : localizedNoLimit
                    }),
                actors: pilotActors,
                dataset: { type: "mechCrew", role: "pilot" }
            },
            operators: {
                label:
                    game.i18n.format("SFRPG.MechSheet.Crew.Operators")
                    + " "
                    + game.i18n.format("SFRPG.MechSheet.Crew.AssignedCount", {
                        current: operatorActors.length,
                        max: crewData.operator.limit > -1 ? crewData.operator.limit : localizedNoLimit
                    }),
                actors: operatorActors,
                dataset: { type: "mechCrew", role: "operator" }
            },
            passengers: {
                label:
                    game.i18n.format("SFRPG.MechSheet.Crew.Passengers")
                    + " "
                    + game.i18n.format("SFRPG.MechSheet.Crew.AssignedCount", {
                        current: passengerActors.length,
                        max: crewData.passenger.limit > -1 ? crewData.passenger.limit : localizedNoLimit
                    }),
                actors: passengerActors,
                dataset: { type: "mechCrew", role: "passenger" }
            }
        };

        data.crew = Object.values(crew);
    }

    /**
     * Organize and classify items for mech sheets.
     *
     * @param {Object} data Data for the sheet
     * @private
     */
    _prepareItems(data) {
        const actorData = data.actor.system;

        const inventory = {
            inventory: { label: game.i18n.localize("SFRPG.MechSheet.Inventory.Inventory"), items: [], dataset: { type: this.acceptedItemTypes }, allowAdd: true }
        };

        const [
            weapons,
            frames,
            auxiliarySystems,
            upgrades,
            cargo,
            actorResources
        ] = data.items.reduce((arr, item) => {
            item.img = item.img || DEFAULT_TOKEN;
            if (!item.config) item.config = {};
            const hasAttack = item.type === "mechWeapon";
            const hasDamage = item.system.damage?.parts
                && item.system.damage.parts.length > 0;

            if (item.type === "actorResource") {
                this._prepareActorResource(item, actorData);
            }

            if (item.config.hasAttack || hasAttack) {
                this._prepareAttackString(item);
            }

            if (item.config.hasDamage || hasDamage) {
                this._prepareDamageString(item);
            }

            if (item.type === "mechWeapon") {
                item.config.hasAttack = true;
                item.config.hasDamage = hasDamage;
                arr[0].push(item);
            } else if (item.type === "mechFrame") arr[1].push(item);
            else if (item.type === "mechAuxiliary") arr[2].push(item);
            else if (item.type === "mechUpgrade") arr[3].push(item);
            else if (item.type === "actorResource") arr[5].push(item);
            else if (this.acceptedItemTypes.includes(item.type)) arr[4].push(item);

            return arr;
        }, [[], [], [], [], [], []]);

        this.processItemContainment(cargo, function(itemType, itemData) {
            inventory.inventory.items.push(itemData);
        });
        data.inventory = inventory;

        const weaponItems = [];
        this.processItemContainment(weapons, function(itemType, itemData) {
            weaponItems.push(itemData);
        });

        const features = {
            frame: {
                category: game.i18n.format("SFRPG.MechSheet.Features.Frame", { current: frames.length }),
                items: frames,
                hasActions: false,
                dataset: { type: "mechFrame" }
            },
            weapons: {
                category: game.i18n.format("SFRPG.MechSheet.Features.Weapons"),
                items: weapons,
                hasActions: true,
                dataset: { type: "mechWeapon" }
            },
            auxiliarySystems: {
                category: game.i18n.format("SFRPG.MechSheet.Features.AuxiliarySystems"),
                items: auxiliarySystems,
                hasActions: false,
                dataset: { type: "mechAuxiliary" }
            },
            upgrades: {
                category: game.i18n.format("SFRPG.MechSheet.Features.Upgrades"),
                items: upgrades,
                hasActions: false,
                dataset: { type: "mechUpgrade" }
            },
            resources: {
                category: game.i18n.format("SFRPG.ActorSheet.Features.Categories.ActorResources"),
                items: actorResources,
                hasActions: false,
                dataset: { type: "actorResource" }
            }
        };

        data.features = Object.values(features);
    }

    /**
     * Activate event listeners using the prepared sheet HTML
     *
     * @param {JQuery} html The prepared HTML object ready to be rendered into the DOM
     */
    activateListeners(html) {
        super.activateListeners(html);

        if (!this.options.editable) return;

        // Crew Tab
        html.find('.crew-delete').click(this._onRemoveFromCrew.bind(this));

        const handler = ev => this._onDragCrewStart(ev);
        html.find('li.crew').each((i, li) => {
            li.setAttribute("draggable", true);
            li.addEventListener("dragstart", handler, false);
        });

        html.find('.crew-list').each((i, li) => {
            li.addEventListener("dragover", this._onCrewDragOver.bind(this), false);
        });

        html.find('li.crew-header').each((i, li) => {
            li.addEventListener("dragenter", this._onCrewDragEnter, false);
            li.addEventListener("dragleave", this._onCrewDragLeave, false);
        });

        // Operator Tab
        html.find('.crew-view').click(event => this._onActorView(event));
    }

    /**
     * This method is called upon form submission after form data is validated
     *
     * @param {Event} event The initial triggering submission event
     * @param {Object} formData The object of validated form data with which to update the object
     * @private
     */
    _updateObject(event, formData) {
        const tiers = { "1/4": 0.25, "1/3": 1 / 3, "1/2": 0.5 };
        const v = "system.details.tier";
        let tier = formData[v];
        tier = tiers[tier] || parseFloat(tier);
        if (tier) formData[v] = tier < 1 ? tier : parseInt(tier);

        return super._updateObject(event, formData);
    }

    /** @override */
    async _onDrop(event) {
        event.preventDefault();

        const data = TextEditor.getDragEventData(event);
        if (Hooks.call('dropActorSheetData', this.actor, this, data) === false) {
            // Further processing halted
        } else if (data.type === "Actor") {
            const actor = await ActorSFRPG.fromDropData(data);
            return this._onCrewDrop(event, actor.id);
        } else if (data.type === "Item") {
            const rawItemData = (await Item.fromDropData(data)).toObject();

            if (CONFIG.SFRPG.mechDefinitionItemTypes.includes(rawItemData.type)) {
                return this.actor.createEmbeddedDocuments("Item", [rawItemData]);
            } else if (this.acceptedItemTypes.includes(rawItemData.type)) {
                return this.processDroppedItems(event, data);
            } else {
                ui.notifications.error(game.i18n.format("SFRPG.MechSheet.InvalidItem", { name: rawItemData.name }));
                return false;
            }
        }

        return false;
    }

    /**
     * Handles drop events for the Crew list
     *
     * @param {Event}  event The originating drop event
     * @param {string} actorId  The id of the crew being dropped on the mech.
     */
    async _onCrewDrop(event, actorId) {
        $(event.target).css('background', '');

        const targetRole = event.target.dataset.role;
        if (!targetRole || !actorId) return false;

        const crew = foundry.utils.deepClone(this.actor.system.crew);
        const crewRole = crew[targetRole];
        const oldRole = this.actor.getCrewRoleForActor(actorId);

        if (crewRole.limit === -1 || crewRole.actorIds.length < crewRole.limit) {
            crewRole.actorIds.push(actorId);

            if (oldRole) {
                const originalRole = crew[oldRole];
                originalRole.actorIds = originalRole.actorIds.filter(x => x !== actorId);
            }

            await this.actor.update({
                "system.crew": crew
            }).then(this.render(false));
        } else {
            ui.notifications.error(game.i18n.format("SFRPG.MechSheet.Crew.CrewLimitReached", {targetRole: targetRole}));
        }

        return true;
    }

    /**
     * Handles dragenter for the crew tab
     * @param {Event} event The originating dragenter event
     */
    _onCrewDragEnter(event) {
        $(event.target).css('background', "rgba(0,0,0,0.3)");
    }

    /**
     * Handles dragleave for the crew tab
     * @param {Event} event The originating dragleave event
     */
    _onCrewDragLeave(event) {
        $(event.target).css('background', '');
    }

    /**
     * Handle dragging crew members on the sheet.
     *
     * @param {Event} event Originating dragstart event
     */
    _onDragCrewStart(event) {
        const actorId = event.currentTarget.dataset.actorId;
        const actor = game.actors.get(actorId);

        const dragData = actor.toDragData();

        if (this.actor.isToken) dragData.tokenId = actorId;
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    /**
     * Handles ondragover for crew drag-n-drop
     *
     * @param {Event} event Originating ondragover event
     */
    _onCrewDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }

    /**
     * Remove an actor from the crew.
     *
     * @param {Event} event The originating click event
     */
    async _onRemoveFromCrew(event) {
        event.preventDefault();

        const actorId = $(event.currentTarget).parents('.crew')
            .data('actorId');
        this.actor.removeFromCrew(actorId);
    }

    /**
     * Opens the sheet of a crew member.
     *
     * @param {Event} event The originating click event
     */
    async _onActorView(event) {
        event.preventDefault();

        const actorId = $(event.currentTarget).parents('.crew')
            .data('actorId');
        const actor = game.actors.get(actorId);
        actor.sheet.render(true);
    }
}
