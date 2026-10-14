// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buttonKey } from "./chat-button-claim.js";
import { OWNER_ONLY_CLASS, chanceLink, chanceOutcome, failureRecipients, hideOwnerOnlyActions, transitionButtons } from "./mech-failure-link.js";
import en from "../../../static/lang/en.json";

describe("hideOwnerOnlyActions", () => {
    function resultCard() {
        const root = document.createElement("div");
        root.innerHTML = `<div class="sfrpg chat-card mech-failure-card" data-actor-uuid="Actor.kestra">
            <p class="result">Cockpit is now Malfunctioning.</p>
            <div class="${OWNER_ONLY_CLASS}"><a data-action="mechCockpitSave">Thoris: Reflex save</a></div></div>`;
        return root;
    }

    it("shows a player who doesn't own the mech what failed, without the dice to roll for it", () => {
        const root = resultCard();
        hideOwnerOnlyActions(root, () => false);

        expect(root.querySelector(".result")).not.toBeNull();
        expect(root.querySelector("[data-action]")).toBeNull();
    });

    it("keeps the dice for the mech's owner", () => {
        const root = resultCard();
        hideOwnerOnlyActions(root, uuid => uuid === "Actor.kestra");

        expect(root.querySelector("[data-action='mechCockpitSave']")).not.toBeNull();
    });
});

describe("chanceOutcome", () => {
    const text = key => en.SFRPG.MechSheet.SystemFailure[key];

    it("tells a constant system's check apart from an activated one's, which spends an action", () => {
        expect(text(chanceOutcome("constant", true))).not.toBe(text(chanceOutcome("auxiliary", true)));
        expect(text(chanceOutcome("constant", true))).not.toMatch(/Power Points/);
    });

    it("names the constant system that failed or worked", () => {
        expect([text(chanceOutcome("constant", true)), text(chanceOutcome("constant", false))]).toEqual([
            expect.stringContaining("{name}"),
            expect.stringContaining("{name}")
        ]);
    });

    it("tells a failed check from one that worked", () => {
        for (const purpose of ["auxiliary", "constant", "cockpit"]) {
            expect(chanceOutcome(purpose, true)).not.toBe(chanceOutcome(purpose, false));
        }
    });
});

describe("chanceLink", () => {
    function card(links) {
        const element = document.createElement("div");
        element.className = "sfrpg chat-card mech-failure-card";
        element.innerHTML = links.join("");
        return element;
    }
    const check = (index, systemId) => chanceLink({ chance: 25, purpose: "auxiliary", label: systemId, systemId, index, tooltip: "" });

    it("gives each check on a turn's card its own claim, so rolling one leaves the others live", () => {
        const links = [...card([check(0, "ammo"), check(1, "hatch")]).querySelectorAll("a")];

        expect(links.map(buttonKey)).toEqual(["mechChanceCheck:0", "mechChanceCheck:1"]);
    });

    it("names the system it checks, so a failed check stops that system", () => {
        const link = card([check(0, "hatch")]).querySelector("a");

        expect(link.dataset.systemId).toBe("hatch");
        expect(link.dataset.chance).toBe("25");
    });
});

describe("failureRecipients", () => {
    function world(owners) {
        const users = [
            { id: "gm", isGM: true },
            { id: "pilot", isGM: false },
            { id: "bystander", isGM: false }
        ];
        const actor = { testUserPermission: (user) => owners.includes(user.id) };
        return { users, actor };
    }

    it("tells the GM, who is running the fight", () => {
        const { users, actor } = world([]);

        expect(failureRecipients(users, actor)).toContain("gm");
    });

    it("tells the mech's owner, whose mech is coming apart", () => {
        const { users, actor } = world(["pilot"]);

        expect(failureRecipients(users, actor)).toContain("pilot");
    });

    it("leaves out a player with no claim on the mech", () => {
        const { users, actor } = world(["pilot"]);

        expect(failureRecipients(users, actor)).not.toContain("bystander");
    });

    it("names each recipient once, so the whisper list holds no duplicates", () => {
        const { users, actor } = world(["gm", "pilot"]);
        const recipients = failureRecipients(users, actor);

        expect(recipients).toEqual([...new Set(recipients)]);
    });
});

describe("transitionButtons", () => {
    const mech = { tier: 4, operatorCount: 3, auxiliaryCount: 2 };

    it("offers no button for a component whose failure costs nothing extra", () => {
        expect(transitionButtons({ component: "upperLimbs", status: "malfunctioning", ...mech })).toEqual([]);
    });

    it("offers the Power Point loss when the core fails", () => {
        expect(transitionButtons({ component: "powerCore", status: "malfunctioning", ...mech }))
            .toEqual([{ action: "mechPowerCoreLoss", formula: "1d4", index: 0 }]);
    });

    it("offers no Power Point loss for a core that is still working", () => {
        expect(transitionButtons({ component: "powerCore", status: "nominal", ...mech })).toEqual([]);
    });

    it("offers one save per affected operator when the cockpit malfunctions", () => {
        expect(transitionButtons({ component: "cockpit", status: "malfunctioning", ...mech })).toEqual([
            { action: "mechCockpitSave", formula: "4d8", index: 0 },
            { action: "mechCockpitSave", formula: "4d8", index: 1 }
        ]);
    });

    it("offers a save for every operator when the cockpit is inoperable", () => {
        expect(transitionButtons({ component: "cockpit", status: "inoperable", ...mech })).toHaveLength(3);
    });

    it("offers the selection roll only when the auxiliary component becomes inoperable", () => {
        expect(transitionButtons({ component: "auxSystem", status: "malfunctioning", ...mech })).toEqual([]);
        expect(transitionButtons({ component: "auxSystem", status: "inoperable", ...mech }))
            .toEqual([{ action: "mechAuxiliaryPick", formula: "1d2", index: 0 }]);
    });

    it("offers no selection roll to a mech carrying no auxiliary systems", () => {
        expect(transitionButtons({ component: "auxSystem", status: "inoperable", ...mech, auxiliaryCount: 0 }))
            .toEqual([]);
    });
});
