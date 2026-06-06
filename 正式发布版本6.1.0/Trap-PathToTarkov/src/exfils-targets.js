"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExilTargetFromPTTConfig = exports.parseExfilTargetFromExitName = exports.getExfilsTargets = void 0;
const helpers_1 = require("./helpers");
const map_name_resolver_1 = require("./map-name-resolver");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const all_vanilla_exfils_1 = require("./_generated/all-vanilla-exfils");
const getExfilsTargets = (pttController, config, mapName, locationBase) => {
    const result = {};
    const exfilsConfig = config.exfiltrations[mapName];
    if (!exfilsConfig) {
        return result;
    }
    const userConfig = pttController.getUserConfig();
    // Get all extracts including Scav ones from external resources
    const allExtracts = getAllExtractsFromExternalResources(mapName);
    // Debug logging
    const baseExtracts = locationBase.exits.map(exit => exit.Name);
    const scavExtracts = allExtracts.filter(name => !baseExtracts.includes(name));
    if (scavExtracts.length > 0) {
        pttController.debug(`Found ${scavExtracts.length} additional Scav extracts for ${mapName}: ${scavExtracts.join(', ')}`);
    }
    void allExtracts.forEach(exfilName => {
        const targets = (exfilsConfig[exfilName] || []).map(targetValue => {
            const parsed = (0, exports.parseExilTargetFromPTTConfig)(targetValue);
            return {
                exitName: exfilName,
                isTransit: Boolean(parsed.transitTargetMapName),
                offraidPosition: parsed.targetOffraidPosition ?? '',
                transitMapId: (0, map_name_resolver_1.resolveLocationIdFromMapName)(parsed.transitTargetMapName ?? ''),
                transitSpawnPointId: parsed.transitTargetSpawnPointId ?? '',
                nextMaps: getNextMaps(config, parsed, mapName),
                nextTraders: getNextTraders(pttController.tradersController, config, userConfig, parsed),
            };
        });
        if (targets.length > 0) {
            result[exfilName] = targets;
        }
    });
    return result;
};
exports.getExfilsTargets = getExfilsTargets;
const getNextMaps = (config, parsedExfilTarget, currentMapName) => {
    const transitMapName = parsedExfilTarget.transitTargetMapName;
    const offraidPosition = parsedExfilTarget.targetOffraidPosition;
    if (transitMapName) {
        if ((0, map_name_resolver_1.isSameMap)(currentMapName, transitMapName) ||
            transitMapName === 'sandbox_high' ||
            transitMapName === 'factory4_night') {
            return [];
        }
        return [(0, map_name_resolver_1.resolveLocationIdFromMapName)(transitMapName)];
    }
    if (offraidPosition) {
        const locationIds = Object.keys(config.infiltrations[offraidPosition] ?? {})
            .filter(mapName => mapName !== 'sandbox_high' &&
            mapName !== 'factory4_night' &&
            !(0, map_name_resolver_1.isSameMap)(currentMapName, mapName))
            .map(map_name_resolver_1.resolveLocationIdFromMapName);
        return locationIds;
    }
    return ['PTT_ERROR_GET_NEXT_MAPS'];
};
const getNextTraders = (tradersController, config, userConfig, parsedExfilTarget) => {
    if (!userConfig.gameplay.tradersAccessRestriction) {
        return [];
    }
    if (parsedExfilTarget.transitTargetMapName) {
        return [];
    }
    const offraidPosition = parsedExfilTarget.targetOffraidPosition;
    if (offraidPosition) {
        const traderIds = Object.keys(config.traders_config).filter(traderId => {
            const traderConfig = config.traders_config[traderId];
            // do not show traders that are not installed
            if (!tradersController.isTraderInstalled(traderId)) {
                return false;
            }
            // do not show traders that are always enabled
            if ((0, helpers_1.isWildcardAccessVia)(traderConfig.access_via)) {
                return false;
            }
            // show accessible traders
            if ((0, helpers_1.checkAccessVia)(traderConfig.access_via, offraidPosition)) {
                return true;
            }
            // do not show the other traders
            return false;
        });
        return traderIds;
    }
    return ['PTT_ERROR_GET_NEXT_TRADERS'];
};
/**
 * @param compoundExfilName e.g. "Gate 3.MY_OFFRAID_POSITION" for extract and "Gate 3.bigmap.MY_SPAWN_POINT" for transit
 */
const parseExfilTargetFromExitName = (compoundExfilName) => {
    const splitted = compoundExfilName.split('.');
    if (splitted.length === 0) {
        return {
            exitName: null,
            targetOffraidPosition: null,
            transitTargetMapName: null,
            transitTargetSpawnPointId: null,
        };
    }
    const exitName = splitted[0];
    if (splitted.length === 1) {
        return {
            exitName,
            targetOffraidPosition: null,
            transitTargetMapName: null,
            transitTargetSpawnPointId: null,
        };
    }
    if (splitted.length === 2) {
        const offraidPosition = splitted[1];
        return {
            exitName,
            targetOffraidPosition: offraidPosition,
            transitTargetMapName: null,
            transitTargetSpawnPointId: null,
        };
    }
    const locationId = (0, map_name_resolver_1.resolveMapNameFromLocation)(splitted[1]);
    const spawnPointId = splitted[2];
    return {
        exitName,
        targetOffraidPosition: null,
        transitTargetMapName: locationId,
        transitTargetSpawnPointId: spawnPointId,
    };
};
exports.parseExfilTargetFromExitName = parseExfilTargetFromExitName;
// Helper function to get all extracts including Scav ones from external resources
const getAllExtractsFromExternalResources = (mapName) => {
    try {
        const externalResourcesPath = path.join(__dirname, '..', 'external-resources', 'maps', `${mapName}_allExtracts.json`);
        if (fs.existsSync(externalResourcesPath)) {
            const extractsData = JSON.parse(fs.readFileSync(externalResourcesPath, 'utf8'));
            return extractsData.map((exit) => exit.Name);
        }
    }
    catch (error) {
        // Fall back to generated data if external resources not available
    }
    // Fall back to using the generated all exfils data with aliases
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
    return ALL_EXFILS[mapName] || [];
};
/**
 * @param exfilTargetFromConfig e.g. "MY_OFFRAID_POSITION" for extract and "bigmap.MY_SPAWN_POINT" for transit
 */
const parseExilTargetFromPTTConfig = (exfilTargetFromConfig) => {
    const splitted = exfilTargetFromConfig.split('.');
    if (splitted.length === 0) {
        return {
            targetOffraidPosition: null,
            transitTargetMapName: null,
            transitTargetSpawnPointId: null,
        };
    }
    if (splitted.length === 1) {
        return {
            targetOffraidPosition: splitted[0],
            transitTargetMapName: null,
            transitTargetSpawnPointId: null,
        };
    }
    return {
        targetOffraidPosition: null,
        transitTargetMapName: splitted[0],
        transitTargetSpawnPointId: splitted[1],
    };
};
exports.parseExilTargetFromPTTConfig = parseExilTargetFromPTTConfig;
