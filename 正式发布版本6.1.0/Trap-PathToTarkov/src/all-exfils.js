"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidExfilForMap = void 0;
const all_vanilla_exfils_1 = require("./_generated/all-vanilla-exfils");
// APPLY ALIASES FOR MAP
const ALL_EXFILS = {
    ...all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT,
    bigmap: all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT.customs,
    rezervbase: all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT.reserve,
    factory4_day: all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT.factory,
    factory4_night: all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT.factory,
    tarkovstreets: all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT.streets,
    sandbox: all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT.groundzero,
    sandbox_high: all_vanilla_exfils_1.ALL_DUMPED_EXFILS_FROM_SCRIPT.groundzero,
};
const isValidExfilForMap = (mapName, exfilName) => {
    const exfils = ALL_EXFILS[mapName] ?? [];
    return exfils.includes(exfilName);
};
exports.isValidExfilForMap = isValidExfilForMap;
