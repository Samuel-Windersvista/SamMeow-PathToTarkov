"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserConfig = exports.loadAdditionalPlayerSpawnpoints = exports.processSpawnConfig = exports.mergeAdditionalSpawnpoints = exports.processConfig = exports.MAPLIST = exports.SLOT_ID_LOCKED_STASH = exports.SLOT_ID_HIDEOUT = exports.EMPTY_STASH = exports.VANILLA_STASH_IDS = exports.STANDARD_STASH_ID = exports.JAEGER_INTRO_QUEST = exports.FENCE_ID = exports.PRAPOR_ID = exports.SPAWN_CONFIG_FILENAME = exports.ADDITIONAL_PLAYER_SPAWNPOINTS_FILENAME = exports.CONFIG_FILENAME = exports.DEFAULT_SELECTED_PTT_CONFIG = exports.USER_CONFIG_PATH = exports.DO_NOT_DISTRIBUTE_DIR = exports.CONFIGS_DIR = exports.PACKAGE_JSON_PATH = exports.DEFAULT_FALLBACK_LANGUAGE = exports.AVAILABLE_LOCALES = exports.isLocaleAvailable = exports.INDEXED_AVAILABLE_LOCALES = void 0;
const path_1 = require("path");
const utils_1 = require("./utils");
const exfils_targets_1 = require("./exfils-targets");
exports.INDEXED_AVAILABLE_LOCALES = {
    ch: true,
    cz: true,
    en: true,
    'es-mx': true,
    es: true,
    fr: true,
    ge: true,
    hu: true,
    it: true,
    jp: true,
    kr: true,
    pl: true,
    po: true,
    ro: true,
    ru: true,
    sk: true,
    tu: true,
};
const isLocaleAvailable = (givenLocale) => {
    const availableLocales = exports.INDEXED_AVAILABLE_LOCALES;
    const locale = givenLocale.trim().toLowerCase();
    return Boolean(availableLocales[locale]);
};
exports.isLocaleAvailable = isLocaleAvailable;
exports.AVAILABLE_LOCALES = Object.keys(exports.INDEXED_AVAILABLE_LOCALES);
exports.DEFAULT_FALLBACK_LANGUAGE = 'en';
exports.PACKAGE_JSON_PATH = (0, path_1.join)(__dirname, '../package.json');
exports.CONFIGS_DIR = (0, path_1.join)(__dirname, '../configs');
/**
 * The `shared_player_spawnpoints.json5` file will be copied in this directory at release time.
 * This is an attempt to prevent config makers to distribute this file.
 *
 * Additional player spawnpoints should be embedded in the desired config
 */
exports.DO_NOT_DISTRIBUTE_DIR = (0, path_1.join)(__dirname, '../src/do_not_distribute');
exports.USER_CONFIG_PATH = (0, path_1.join)(exports.CONFIGS_DIR, 'UserConfig.json5');
exports.DEFAULT_SELECTED_PTT_CONFIG = 'Default';
exports.CONFIG_FILENAME = 'config.json5';
exports.ADDITIONAL_PLAYER_SPAWNPOINTS_FILENAME = 'additional_player_spawnpoints.json5';
exports.SPAWN_CONFIG_FILENAME = 'shared_player_spawnpoints.json5';
exports.PRAPOR_ID = '54cb50c76803fa8b248b4571';
exports.FENCE_ID = '579dc571d53a0658a154fbec';
exports.JAEGER_INTRO_QUEST = '5d2495a886f77425cd51e403';
exports.STANDARD_STASH_ID = '566abbc34bdc2d92178b4576';
exports.VANILLA_STASH_IDS = [
    exports.STANDARD_STASH_ID, // Standard
    '5811ce572459770cba1a34ea', // Left Behind
    '5811ce662459770f6f490f32', // Prepare for escape
    '5811ce772459770e9e5f9532', // Edge of darkness
    '6602bcf19cc643f44a04274b', // Unheard
];
const DEFAULT_USER_CONFIG = {
    selectedConfig: exports.DEFAULT_SELECTED_PTT_CONFIG,
    gameplay: {
        multistash: true,
        tradersAccessRestriction: true,
        resetOffraidPositionOnPlayerDeath: true,
        playerScavMoveOffraidPosition: false,
        keepFoundInRaidTweak: true,
        fleaMarketMode: 'everywhere',
        fleaMarketMinLevel: 15,
    },
    runUninstallProcedure: false,
};
const toStashConfig = (rawStashConfig) => {
    const name = rawStashConfig.id; // the id is actually the name (this is to avoid breaking changes in the ptt configs)
    const mongoId = (0, utils_1.getPTTMongoId)(name);
    const mongoTemplateId = (0, utils_1.getPTTMongoId)(`template_${name}`);
    const mongoGridId = (0, utils_1.getPTTMongoId)(`grid_${name}`);
    return {
        name,
        size: rawStashConfig.size,
        access_via: rawStashConfig.access_via,
        mongoId,
        mongoTemplateId,
        mongoGridId,
    };
};
exports.EMPTY_STASH = toStashConfig({
    id: 'PathToTarkov_Empty_Stash',
    size: 0,
    access_via: [], // not used but this simplify typing
});
exports.ROAMING_EMERGENCY_STASH = toStashConfig({
    id: 'PathToTarkov_Roaming_Emergency_Stash',
    size: 20,
    access_via: [], // not used but this simplify typing
});
exports.SLOT_ID_HIDEOUT = 'hideout';
exports.SLOT_ID_LOCKED_STASH = 'ptt_locked_stash';
exports.MAPLIST = [
    'laboratory',
    'factory4_day',
    'factory4_night',
    'bigmap', // customs
    'interchange',
    'lighthouse',
    'rezervbase', // military reserve
    'shoreline',
    'woods',
    'tarkovstreets',
    'sandbox', // ground zero
    'sandbox_high', // ground zero for high level player (> 20)
    'terminal', // even if it's always locked, this is listed here in order to be able to hide the icon in the UI
];
// sandbox_high is a special map for high level players (> 20)
const prepareGroundZeroHighPartial = (maps) => {
    if (maps.sandbox && !maps.sandbox_high) {
        return {
            ...maps,
            sandbox_high: maps.sandbox,
        };
    }
    return maps;
};
const prepareGroundZeroHigh = (maps) => {
    return prepareGroundZeroHighPartial(maps);
};
const fromRawExfiltrations = (rawExfiltrations) => {
    const exfiltrations = {};
    Object.keys(rawExfiltrations).forEach(mapName => {
        const targetsByExfils = rawExfiltrations[mapName] ?? {};
        exfiltrations[mapName] = {};
        Object.keys(targetsByExfils).forEach(extractName => {
            const exfilTargets = (0, utils_1.ensureArray)(targetsByExfils[extractName]);
            exfiltrations[mapName][extractName] = exfilTargets;
        });
    });
    return exfiltrations;
};
// Warning: this mutate the exfiltrations config
const prepareAutomaticTransitsCreation = (config) => {
    const { infiltrations, exfiltrations } = config;
    Object.keys(exfiltrations).forEach(mapName => {
        const targetsByExfil = exfiltrations[mapName];
        Object.keys(targetsByExfil).forEach(exfilName => {
            const exfilTargets = (0, utils_1.ensureArray)(targetsByExfil[exfilName]);
            const newExfilTargets = [];
            exfilTargets.forEach(exfilTarget => {
                newExfilTargets.push(exfilTarget);
                const offraidPosition = (0, exfils_targets_1.parseExilTargetFromPTTConfig)(exfilTarget).targetOffraidPosition;
                if (offraidPosition && infiltrations[offraidPosition]) {
                    Object.keys(infiltrations[offraidPosition]).forEach(targetMapName => {
                        if (targetMapName !== mapName) {
                            const spawns = infiltrations[offraidPosition][targetMapName] ?? [];
                            spawns.forEach(spawnId => {
                                const createdExfilTarget = `${targetMapName}.${spawnId}`;
                                newExfilTargets.push(createdExfilTarget);
                            });
                        }
                    });
                }
            });
            // to avoid duplicates
            targetsByExfil[exfilName] = [...new Set(newExfilTargets)];
        });
    });
};
const processConfig = (originalConfig) => {
    const rawConfig = (0, utils_1.deepClone)(originalConfig);
    rawConfig.infiltrations = rawConfig.infiltrations ?? {};
    rawConfig.infiltrations_config = rawConfig.infiltrations_config ?? {};
    rawConfig.exfiltrations = prepareGroundZeroHigh(rawConfig.exfiltrations ?? {});
    Object.keys(rawConfig.infiltrations).forEach(offraidPosition => {
        rawConfig.infiltrations[offraidPosition] = prepareGroundZeroHigh(rawConfig.infiltrations[offraidPosition]);
        Object.keys(rawConfig.infiltrations[offraidPosition] ?? {}).forEach(mapName => {
            const spawns = (0, utils_1.ensureArray)(rawConfig.infiltrations[offraidPosition][mapName] ?? []);
            rawConfig.infiltrations[offraidPosition][mapName] = spawns;
        });
    });
    const stashConfigs = rawConfig.hideout_secondary_stashes?.map(toStashConfig) ?? [];
    const infiltrationsConfig = rawConfig.infiltrations_config;
    const exfiltrations = fromRawExfiltrations(rawConfig.exfiltrations ?? {});
    const config = {
        ...rawConfig,
        hideout_main_stash_access_via: rawConfig.hideout_main_stash_access_via ?? ['*'],
        hideout_secondary_stashes: stashConfigs,
        infiltrations_config: infiltrationsConfig,
        exfiltrations,
        offraid_regen_config: {
            hydration: {
                access_via: rawConfig.offraid_regen_config?.hydration?.access_via ?? [],
            },
            energy: {
                access_via: rawConfig.offraid_regen_config?.energy?.access_via ?? [],
            },
            health: {
                access_via: rawConfig.offraid_regen_config?.health?.access_via ?? [],
            },
        },
        traders_config: {
            ...rawConfig.traders_config,
        },
    };
    if (config.enable_automatic_transits_creation) {
        prepareAutomaticTransitsCreation(config);
    }
    return config;
};
exports.processConfig = processConfig;
const mergeAdditionalSpawnpoints = (spawnConfig, additionalSpawnConfig) => {
    const clonedSpawnConfig = (0, utils_1.deepClone)(spawnConfig);
    Object.keys(additionalSpawnConfig).forEach(mapName => {
        const infilConfig = additionalSpawnConfig[mapName];
        const spawnPoints = clonedSpawnConfig[mapName];
        if (!infilConfig || !spawnPoints) {
            return;
        }
        Object.keys(infilConfig).forEach(spawnPointName => {
            const spawnPoint = infilConfig[spawnPointName];
            const spawnPoints = clonedSpawnConfig[mapName];
            if (spawnPoint) {
                spawnPoints[spawnPointName] = spawnPoint;
            }
        });
    });
    return clonedSpawnConfig;
};
exports.mergeAdditionalSpawnpoints = mergeAdditionalSpawnpoints;
const processSpawnConfig = (spawnConfig, config) => {
    const additionalPlayerSpawnpoints = config.infiltrations_config?.additional_player_spawnpoints ?? {};
    const mergedConfig = (0, exports.mergeAdditionalSpawnpoints)(spawnConfig, additionalPlayerSpawnpoints);
    return prepareGroundZeroHigh(mergedConfig);
};
exports.processSpawnConfig = processSpawnConfig;
const loadAdditionalPlayerSpawnpoints = (filePath, jsonUtil) => {
    if (!(0, utils_1.fileExists)(filePath)) {
        return {};
    }
    return (0, utils_1.readJsonFile)(filePath, jsonUtil);
};
exports.loadAdditionalPlayerSpawnpoints = loadAdditionalPlayerSpawnpoints;
const getUserConfig = (jsonUtil) => {
    if (!(0, utils_1.fileExists)(exports.USER_CONFIG_PATH)) {
        const userConfig = DEFAULT_USER_CONFIG;
        (0, utils_1.writeJsonFile)(exports.USER_CONFIG_PATH, jsonUtil, userConfig);
        return userConfig;
    }
    let needToWriteFile = false;
    const userConfig = (0, utils_1.deepClone)((0, utils_1.readJsonFile)(exports.USER_CONFIG_PATH, jsonUtil));
    if (!userConfig.selectedConfig) {
        userConfig.selectedConfig = exports.DEFAULT_SELECTED_PTT_CONFIG;
        needToWriteFile = true;
    }
    if (userConfig.runUninstallProcedure === undefined) {
        userConfig.runUninstallProcedure = DEFAULT_USER_CONFIG.runUninstallProcedure;
        needToWriteFile = true;
    }
    if (!userConfig.gameplay) {
        userConfig.gameplay = DEFAULT_USER_CONFIG.gameplay;
        needToWriteFile = true;
    }
    if (userConfig.gameplay.keepFoundInRaidTweak === undefined) {
        userConfig.gameplay.keepFoundInRaidTweak = DEFAULT_USER_CONFIG.gameplay.keepFoundInRaidTweak;
        needToWriteFile = true;
    }
    if (userConfig.gameplay.multistash === undefined) {
        userConfig.gameplay.multistash = DEFAULT_USER_CONFIG.gameplay.multistash;
        needToWriteFile = true;
    }
    if (userConfig.gameplay.playerScavMoveOffraidPosition === undefined) {
        userConfig.gameplay.playerScavMoveOffraidPosition =
            DEFAULT_USER_CONFIG.gameplay.playerScavMoveOffraidPosition;
        needToWriteFile = true;
    }
    if (userConfig.gameplay.resetOffraidPositionOnPlayerDeath === undefined) {
        userConfig.gameplay.resetOffraidPositionOnPlayerDeath =
            DEFAULT_USER_CONFIG.gameplay.resetOffraidPositionOnPlayerDeath;
        needToWriteFile = true;
    }
    if (userConfig.gameplay.tradersAccessRestriction === undefined) {
        userConfig.gameplay.tradersAccessRestriction =
            DEFAULT_USER_CONFIG.gameplay.tradersAccessRestriction;
        needToWriteFile = true;
    }
    if (userConfig.gameplay.fleaMarketMode === undefined) {
        userConfig.gameplay.fleaMarketMode = DEFAULT_USER_CONFIG.gameplay.fleaMarketMode;
        needToWriteFile = true;
    }
    if (userConfig.gameplay.fleaMarketMinLevel === undefined) {
        userConfig.gameplay.fleaMarketMinLevel = DEFAULT_USER_CONFIG.gameplay.fleaMarketMinLevel;
        needToWriteFile = true;
    }
    // Rewrite the file if needed
    if (needToWriteFile) {
        (0, utils_1.writeJsonFile)(exports.USER_CONFIG_PATH, jsonUtil, userConfig);
    }
    return userConfig;
};
exports.getUserConfig = getUserConfig;
