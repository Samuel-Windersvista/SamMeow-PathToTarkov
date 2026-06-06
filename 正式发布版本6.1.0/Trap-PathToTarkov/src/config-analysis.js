"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeConfig = void 0;
const all_exfils_1 = require("./all-exfils");
const config_1 = require("./config");
const exfils_targets_1 = require("./exfils-targets");
const utils_1 = require("./utils");
const ALLOWED_MAPS = [
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
    'sandbox_high', // ground zero (level 20+)
];
const checkAccessViaErrors = (field, givenAccessVia, config) => {
    const accessVia = (0, utils_1.ensureArray)(givenAccessVia);
    if (accessVia.length === 1 && accessVia[0] === '*') {
        return [];
    }
    const errors = [];
    accessVia.forEach(offraidPosition => {
        if (!config.infiltrations[offraidPosition]) {
            errors.push(`wrong ${field}: "${offraidPosition}" is not a valid offraid position`);
        }
    });
    return errors;
};
const checkLocalesErrors = (byLocale, suffixMessage) => {
    const errors = [];
    Object.keys(byLocale).forEach(locale => {
        if (!(0, config_1.isLocaleAvailable)(locale)) {
            errors.push(`unknown locale "${locale}" found ${suffixMessage}`);
        }
    });
    return errors;
};
/**
 * This will also check ptt transit custom notation, e.g. "factory4_day.Gate 3"
 */
const getErrorsForOffraidPositions = (config, spawnConfig) => {
    const errors = [];
    errors.push(...checkAccessViaErrors('hideout_main_stash_access_via', config.hideout_main_stash_access_via, config));
    errors.push(...checkAccessViaErrors('respawn_at', config.respawn_at ?? [], config));
    errors.push(...checkAccessViaErrors('hydration.access_via', config.offraid_regen_config.hydration.access_via, config));
    errors.push(...checkAccessViaErrors('energy.access_via', config.offraid_regen_config.energy.access_via, config));
    errors.push(...checkAccessViaErrors('health.access_via', config.offraid_regen_config.health.access_via, config));
    config.hideout_secondary_stashes.forEach(secondaryStashConfig => {
        errors.push(...checkAccessViaErrors(`hideout_secondary_stashes.${secondaryStashConfig.name}.access_via`, secondaryStashConfig.access_via, config));
    });
    Object.keys(config.traders_config).forEach(traderId => {
        const trader = config.traders_config[traderId];
        errors.push(...checkAccessViaErrors(`traders_config.${traderId}.access_via`, trader.access_via, config));
    });
    // check exfils targets (offraid positions + ptt transit custom notation)
    Object.keys(config.exfiltrations).forEach(mapName => {
        const targetsByExfil = config.exfiltrations[mapName];
        Object.keys(targetsByExfil).forEach(extractName => {
            const exfilTargets = targetsByExfil[extractName];
            if (!exfilTargets || exfilTargets.length === 0) {
                errors.push(`no offraid position specified for exfil "${extractName}"`);
                return;
            }
            exfilTargets.forEach(exfilTarget => {
                const parsed = (0, exfils_targets_1.parseExilTargetFromPTTConfig)(exfilTarget);
                const offraidPosition = parsed.targetOffraidPosition;
                if (offraidPosition && !config.infiltrations[offraidPosition]) {
                    errors.push(`wrong offraidPosition: "${offraidPosition}" in exfiltrations.${mapName}.${extractName}`);
                }
                if (!offraidPosition && (!parsed.transitTargetMapName || !parsed.transitTargetSpawnPointId)) {
                    errors.push(`cannot parse exfil target in exfiltrations.${mapName}.${extractName}`);
                }
                if (parsed.transitTargetMapName && parsed.transitTargetSpawnPointId) {
                    if (!ALLOWED_MAPS.includes(parsed.transitTargetMapName)) {
                        errors.push(`bad exfil target in exfiltrations.${mapName}.${extractName}: ${parsed.transitTargetMapName} is now allowed as a map`);
                    }
                    const spawns = spawnConfig[parsed.transitTargetMapName] ?? {};
                    if (!spawns[parsed.transitTargetSpawnPointId]) {
                        errors.push(`bad exfil target in exfiltrations.${mapName}.${extractName}: unknown spawn point id "${parsed.transitTargetSpawnPointId}"`);
                    }
                }
            });
        });
    });
    // check offraidPosition displayName locales
    Object.keys(config.offraid_positions ?? {}).forEach(offraidPositionName => {
        const displayNameByLocale = config.offraid_positions?.[offraidPositionName]?.displayName ?? {};
        errors.push(...checkLocalesErrors(displayNameByLocale, `for offraid position "${offraidPositionName}"`));
    });
    return errors;
};
const getInfiltrationHash = (spawns) => {
    const results = Object.keys(spawns).flatMap(mapName => {
        return spawns[mapName].map(spawnName => {
            return `${mapName}.${spawnName}`;
        });
    });
    return results.sort().join('/');
};
const getWarningsForOffraidPositions = (config) => {
    const warnings = [];
    const offraidPosByHash = {};
    Object.keys(config.infiltrations).forEach(offraidPosition => {
        if (!config.offraid_positions?.[offraidPosition]) {
            warnings.push(`offraid position "${offraidPosition}" is not declared in "offraids_positions"`);
        }
        const spawnsByMap = config.infiltrations[offraidPosition];
        const hash = getInfiltrationHash(spawnsByMap);
        if (offraidPosByHash[hash]) {
            warnings.push(`offraid position "${offraidPosition}" seems to be a duplicate of "${offraidPosByHash[hash]}"`);
        }
        else {
            offraidPosByHash[hash] = offraidPosition;
        }
    });
    Object.keys(config.offraid_positions ?? {}).forEach(offraidPosition => {
        if (!config.infiltrations[offraidPosition]) {
            warnings.push(`the declared "offraid_positions.${offraidPosition}" is not used in "infiltrations"`);
        }
    });
    return warnings;
};
const getErrorsForExfils = (config) => {
    const errors = [];
    Object.keys(config.exfiltrations).forEach(mapName => {
        // check all exfils maps are valid
        if (!ALLOWED_MAPS.includes(mapName)) {
            errors.push(`${mapName} is now allowed as a map name in "exfiltrations"`);
        }
        const targetsByExfil = config.exfiltrations[mapName] ?? {};
        Object.keys(targetsByExfil).forEach(extractName => {
            // check there is no "." characters in given extractName
            if (extractName.indexOf('.') !== -1) {
                errors.push(`bad extract name "${extractName}": the "." character is forbidden`);
            }
            const exfilTargets = targetsByExfil[extractName];
            // check there is at least one exfil target
            if (exfilTargets.length === 0) {
                errors.push(`no exfil targets found for "exfiltrations.${mapName}.${extractName}"`);
            }
            if (!(0, all_exfils_1.isValidExfilForMap)(mapName, extractName)) {
                errors.push(`invalid extract name "${extractName}" for map "${mapName}" in "exfiltrations"`);
            }
        });
    });
    Object.keys(config.exfiltrations_config ?? {}).forEach(mapName => {
        // check all exfils maps are valid
        if (!ALLOWED_MAPS.includes(mapName)) {
            errors.push(`${mapName} is now allowed as a map name in "exfiltrations_config"`);
        }
        const configByExfils = config.exfiltrations_config?.[mapName] ?? {};
        Object.keys(configByExfils).forEach(extractName => {
            // check for extract point name validity (in exfiltrations_config)
            if (!(0, all_exfils_1.isValidExfilForMap)(mapName, extractName)) {
                errors.push(`invalid extract name "${extractName}" for map "${mapName}" in "exfiltrations_config"`);
            }
            const displayNameByLocale = configByExfils[extractName]?.displayName ?? {};
            errors.push(...checkLocalesErrors(displayNameByLocale, `for extract "${extractName}" on map "${mapName}"`));
        });
    });
    return errors;
};
const getWarningsForExfils = (config) => {
    const warnings = [];
    Object.keys(config.exfiltrations).forEach(mapName => {
        const noVanillaTransits = !config.enable_all_vanilla_transits;
        if (noVanillaTransits && (0, utils_1.isEmpty)(config.exfiltrations[mapName])) {
            warnings.push(`no exfils found for map ${mapName} in "exfiltrations"`);
        }
    });
    Object.keys(config.exfiltrations_config ?? {}).forEach(mapName => {
        const configByExfils = config.exfiltrations_config?.[mapName] ?? {};
        Object.keys(configByExfils).forEach(extractName => {
            const exfilTargets = config.exfiltrations?.[mapName]?.[extractName];
            if (!exfilTargets || exfilTargets.length === 0) {
                warnings.push(`unused "exfiltrations_config.${mapName}.${extractName}" you can remove it from the config`);
            }
        });
    });
    return warnings;
};
// Note: offraidPosition is already checked by `getErrorsForOffraidPositions`
const getErrorsSecondaryStashes = (config) => {
    const errors = [];
    const names = new Set();
    config.hideout_secondary_stashes.forEach(stashConfig => {
        if (stashConfig.name === config_1.EMPTY_STASH.name || stashConfig.name === config_1.ROAMING_EMERGENCY_STASH.name) {
            errors.push(`secondary stash "${stashConfig.name}" is a special reserved name, please choose another.`);
        }
        if (names.has(stashConfig.name)) {
            errors.push(`duplicated secondary stash ${stashConfig.name} found`);
        }
        names.add(stashConfig.name);
    });
    return errors;
};
const getWarningsSecondaryStashes = (config) => {
    const warnings = [];
    const offraidPositions = new Set();
    config.hideout_secondary_stashes.forEach(stashConfig => {
        (0, utils_1.ensureArray)(stashConfig.access_via).forEach(offraidPosition => {
            if (offraidPositions.has(offraidPosition)) {
                warnings.push(`offraid position is already used by stash "${stashConfig.name}"`);
            }
            else {
                offraidPositions.add(offraidPosition);
            }
        });
    });
    return warnings;
};
const getErrorsForInfils = (config, spawnConfig) => {
    const errors = [];
    Object.keys(config.infiltrations).forEach(offraidPosition => {
        // 1. check offraidPosition format
        if (offraidPosition.indexOf('.') !== -1) {
            errors.push(`bad offraid position name "${offraidPosition}": the "." character is forbidden`);
        }
        const spawnPointsByMap = config.infiltrations[offraidPosition];
        if ((0, utils_1.isEmpty)(spawnPointsByMap)) {
            errors.push(`no map found in "infiltrations" for offraid position "${offraidPosition}"`);
        }
        Object.keys(spawnPointsByMap).forEach(mapName => {
            // 2. check for map validity
            if (!ALLOWED_MAPS.includes(mapName)) {
                errors.push(`${mapName} is now allowed as a map name in "infiltrations"`);
                return;
            }
            // 3. check for existing spawnpoints for given map (in player_spawnpoints.json)
            if (!spawnConfig[mapName]) {
                errors.push(`no spawn points found for map ${mapName} in player_spawnpoints.json`);
                return;
            }
            const spawnPoints = spawnPointsByMap[mapName];
            // ignore wildcards
            if (spawnPoints[0] === '*') {
                return;
            }
            // 4. check for spawnPoints validity
            spawnPoints.forEach(spawnPointName => {
                const spawn = spawnConfig[mapName][spawnPointName];
                if (!spawn) {
                    errors.push(`unknown player spawnpoint reference "${spawnPointName}" for map ${mapName}`);
                }
            });
        });
    });
    return errors;
};
const getWarningsForInfils = (config, spawnConfig) => {
    const warnings = [];
    void config;
    void spawnConfig;
    return warnings;
};
const getErrorsForAdditionalSpawnpoints = (config) => {
    const errors = [];
    const additionalSpawnConfig = config.infiltrations_config?.additional_player_spawnpoints ?? {};
    Object.keys(additionalSpawnConfig).forEach(mapName => {
        if (!ALLOWED_MAPS.includes(mapName)) {
            errors.push(`${mapName} is now allowed as a map name in "infiltrations_config.additional_player_spawnpoints"`);
            return;
        }
    });
    return errors;
};
const getWarningsForAdditionalSpawnpoints = (config) => {
    const warnings = [];
    void config;
    return warnings;
};
const getErrorsForGeneralConfig = (config) => {
    const errors = [];
    // check for wrong locale on `debug_exfiltrations_tooltips_locale`
    const debugTooltipsLocale = config.debug_exfiltrations_tooltips_locale;
    if (debugTooltipsLocale && !(0, config_1.isLocaleAvailable)(debugTooltipsLocale)) {
        errors.push(`wrong locale "${debugTooltipsLocale}" set to "debug_exfiltrations_tooltips_locale"`);
    }
    // check extracts_prompt_template locales
    errors.push(...checkLocalesErrors(config.extracts_prompt_template ?? {}, `for extracts_prompt_template`));
    // check transits_prompt_template locales
    errors.push(...checkLocalesErrors(config.transits_prompt_template ?? {}, `for transits_prompt_template`));
    return errors;
};
const getWarningsForGeneralConfig = (config) => {
    const warnings = [];
    void config;
    return warnings;
};
const getErrorsForUnsupportedProperties = (config) => {
    const errors = [];
    // check for usage of "vanilla_exfils_requirements"
    if ('vanilla_exfils_requirements' in config) {
        errors.push('"vanilla_exfils_requirements" is no longer supported since version 6');
    }
    // check for usage of "enabled"
    if ('enabled' in config) {
        errors.push('the property "enabled" is no longer supported since version 6, please refer to "runUninstallProcedure" in UserConfig.json5');
    }
    // check for usage of "bypass_uninstall_procedure"
    if ('bypass_uninstall_procedure' in config) {
        errors.push('"bypass_uninstall_procedure" property is no longer supported since version 6');
    }
    // check for usage of "bypass_keep_found_in_raid_tweak"
    if ('bypass_keep_found_in_raid_tweak' in config) {
        errors.push('"bypass_keep_found_in_raid_tweak" property is no longer supported since version 6, please refer to "keepFoundInRaidTweak" in UserConfig.json5');
    }
    // check for usage of "reset_offraid_position_on_player_die"
    if ('reset_offraid_position_on_player_die' in config) {
        errors.push('"reset_offraid_position_on_player_die" property is no longer supported since version 6, please refer to "resetOffraidPositionOnPlayerDeath" in UserConfig.json5');
    }
    // check for usage of "hideout_multistash_enabled"
    if ('hideout_multistash_enabled' in config) {
        errors.push('"hideout_multistash_enabled" property is no longer supported since version 6, please refer to "multistash" in UserConfig.json5');
    }
    // check for usage of "traders_access_restriction"
    if ('traders_access_restriction' in config) {
        errors.push('"traders_access_restriction" property is no longer supported since version 6, please refer to "tradersAccessRestriction" in UserConfig.json5');
    }
    // check for usage of "player_scav_move_offraid_position"
    if ('player_scav_move_offraid_position' in config) {
        errors.push('"player_scav_move_offraid_position" property is no longer supported since version 6, please refer to "playerScavMoveOffraidPosition" in UserConfig.json5');
    }
    return errors;
};
const getWarningsForUnsupportedProperties = (config) => {
    const warnings = [];
    void config;
    return warnings;
};
const getErrorsForSpawnConfig = (spawnConfig) => {
    const errors = [];
    Object.keys(spawnConfig).forEach(mapName => {
        const spawns = spawnConfig[mapName];
        Object.keys(spawns).forEach(spawnPointName => {
            if (spawnPointName.indexOf('.') !== -1) {
                errors.push(`Invalid name for spawnpoint "${spawnPointName}": the "." character is forbidden`);
            }
        });
    });
    return errors;
};
const getWarningsForSpawnConfig = (spawnConfig) => {
    const warnings = [];
    void spawnConfig;
    return warnings;
};
const analyzeConfig = (config, spawnConfig) => {
    const errors = [];
    const warnings = [];
    // check there is at least one offraid position
    if ((0, utils_1.isEmpty)(config.infiltrations)) {
        errors.push('no offraid position found in "infiltrations"');
    }
    // check there is at least one map
    if ((0, utils_1.isEmpty)(config.exfiltrations)) {
        errors.push('no map found in "exfiltrations"');
    }
    // check initial_offraid_position
    if (!config.infiltrations[config.initial_offraid_position]) {
        errors.push(`wrong initial_offraid_position "${config.initial_offraid_position}"`);
    }
    // check all offraid positions
    errors.push(...getErrorsForOffraidPositions(config, spawnConfig));
    warnings.push(...getWarningsForOffraidPositions(config));
    // checks for exfil maps
    errors.push(...getErrorsForExfils(config));
    warnings.push(...getWarningsForExfils(config));
    // check for secondary stashes
    errors.push(...getErrorsSecondaryStashes(config));
    warnings.push(...getWarningsSecondaryStashes(config));
    // check for infiltrations maps and spawn points
    errors.push(...getErrorsForInfils(config, spawnConfig));
    warnings.push(...getWarningsForInfils(config, spawnConfig));
    // check for additional spawnpoints
    errors.push(...getErrorsForAdditionalSpawnpoints(config));
    warnings.push(...getWarningsForAdditionalSpawnpoints(config));
    // check the rest of the config
    errors.push(...getErrorsForGeneralConfig(config));
    warnings.push(...getWarningsForGeneralConfig(config));
    // check the spawn config
    errors.push(...getErrorsForSpawnConfig(spawnConfig));
    warnings.push(...getWarningsForSpawnConfig(spawnConfig));
    // check unsupported properties (old ptt configs)
    errors.push(...getErrorsForUnsupportedProperties(config));
    warnings.push(...getWarningsForUnsupportedProperties(config));
    return {
        errors,
        warnings,
    };
};
exports.analyzeConfig = analyzeConfig;
