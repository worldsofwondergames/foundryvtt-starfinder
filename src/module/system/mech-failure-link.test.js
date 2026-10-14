// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { failureRecipients, transitionButtons } from "./mech-failure-link.js";

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
