/** The speed types a mech can have. A part of a speed string with no type is land. */
export const MECH_SPEED_TYPES = Object.freeze(["land", "fly", "swim", "burrow", "climb"]);

/**
 * Split one part of a speed string, such as "climb 60 ft." or "+10 ft.", into
 * its type and the rest.
 *
 * @param {string} part
 * @returns {{type: string|null, value: string}} type is null when the part names no type.
 */
function speedPart(part) {
    const match = part.match(/^(fly|swim|burrow|climb)\s*/i);
    if (!match) return { type: null, value: part };
    return { type: match[1].toLowerCase(), value: part.slice(match[0].length) };
}

function parts(speedStr) {
    return speedStr.split(",").map(s => s.trim())
        .filter(Boolean);
}

/**
 * Set a mech's speeds from a frame's speed string, such as "40 ft., climb 60 ft.".
 *
 * @param {string} speedStr
 * @param {object} speedObj The mech's speeds, keyed by MECH_SPEED_TYPES.
 */
export function parseSpeedString(speedStr, speedObj) {
    if (!speedStr) return;
    for (const type of MECH_SPEED_TYPES) speedObj[type] = "";
    for (const part of parts(speedStr)) {
        const { type, value } = speedPart(part);
        speedObj[type ?? "land"] = value;
    }
}

/**
 * Apply a lower limb's speed string. "+10 ft." with no type changes land speed,
 * "climb +20 ft." changes climb speed, and "burrow 40 ft." sets a speed the mech
 * doesn't have yet.
 *
 * @param {string} speedStr
 * @param {object} speedObj
 */
export function applySpeedModifiers(speedStr, speedObj) {
    if (!speedStr) return;
    for (const part of parts(speedStr)) {
        const { type, value } = speedPart(part);
        const modMatch = value.match(/^([+-]\d+)\s*ft\./);
        if (modMatch) {
            const mod = parseInt(modMatch[1]);
            const target = type ?? "land";
            const current = parseInt(speedObj[target]) || 0;
            if (type === null && current <= 0) continue;
            speedObj[target] = `${current + mod} ft.`;
        } else {
            const target = type ?? "land";
            if (!speedObj[target]) speedObj[target] = value;
        }
    }
}

/**
 * Add a tooltip line for each part of a component's speed string.
 *
 * @param {string} speedStr
 * @param {object} tooltipObj Tooltip lines, keyed by MECH_SPEED_TYPES.
 * @param {string} sourceName The component's name.
 */
export function addSpeedTooltips(speedStr, tooltipObj, sourceName) {
    if (!speedStr) return;
    for (const part of parts(speedStr)) {
        const { type, value } = speedPart(part);
        tooltipObj[type ?? "land"].push(`${sourceName}: ${value}`);
    }
}
