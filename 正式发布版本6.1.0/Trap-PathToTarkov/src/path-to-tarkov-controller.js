"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathToTarkovController = void 0;
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const stash_controller_1 = require("./stash-controller");
const traders_controller_1 = require("./traders-controller");
const utils_1 = require("./utils");
const map_name_resolver_1 = require("./map-name-resolver");
const TradersAvailabilityService_1 = require("./services/TradersAvailabilityService");
const fix_repeatable_quests_1 = require("./fix-repeatable-quests");
const keep_fir_tweak_1 = require("./keep-fir-tweak");
const ExfilsTooltipsTemplater_1 = require("./services/ExfilsTooltipsTemplater");
// indexed by mapName
// Warning: do not re-use, it should only be use by the `generateAll` override
const getIndexedLocations = (locations) => {
    // WARNING: type lies here
    // TODO: improve type
    const locationsList = Object.values(locations).filter((l) => l && l.Id);
    return locationsList.reduce((indexed, location) => {
        return {
            ...indexed,
            [(0, map_name_resolver_1.resolveMapNameFromLocation)(location.Id)]: location,
        };
    }, {});
};
class PathToTarkovController {
    constructor(baseConfig, spawnConfig, userConfig, packageJson, tradersAvailabilityService, container, db, saveServer, configServer, getRaidCache, logger, debug) {
        this.baseConfig = baseConfig;
        this.spawnConfig = spawnConfig;
        this.userConfig = userConfig;
        this.packageJson = packageJson;
        this.tradersAvailabilityService = tradersAvailabilityService;
        this.container = container;
        this.db = db;
        this.saveServer = saveServer;
        this.getRaidCache = getRaidCache;
        this.logger = logger;
        this.debug = debug;
        // configs are indexed by sessionId
        this.configCache = {};
        this.getRespawnOffraidPosition = (sessionId) => {
            const profile = this.saveServer.getProfile(sessionId);
            const profileTemplateId = profile.info.edition;
            const overrideByProfiles = this.getConfig(sessionId).override_by_profiles?.[profileTemplateId];
            const respawnAt = (0, utils_1.shuffle)(overrideByProfiles?.respawn_at ?? this.getConfig(sessionId).respawn_at ?? []);
            if (respawnAt.length === 0) {
                return this.getInitialOffraidPosition(sessionId);
            }
            // TODO: if '*' -> pick a random offraid position from all available
            return respawnAt[0];
        };
        this.getInitialOffraidPosition = (sessionId) => {
            const profile = this.saveServer.getProfile(sessionId);
            const profileTemplateId = profile.info.edition;
            const config = this.getConfig(sessionId);
            const overrideByProfiles = config.override_by_profiles?.[profileTemplateId];
            return overrideByProfiles?.initial_offraid_position ?? config.initial_offraid_position;
        };
        this.getOffraidPosition = (sessionId) => {
            const defaultOffraidPosition = this.getInitialOffraidPosition(sessionId);
            const profile = this.saveServer.getProfile(sessionId);
            this.logger.info(`[PTT Debug] getOffraidPosition - sessionId: ${sessionId}, profileId: ${profile?.info?.id}, username: ${profile?.info?.username}, defaultOffraidPosition: ${defaultOffraidPosition}`);
            // Check if this is a headless client
            const profileName = profile?.info?.username || '';
            const isHeadless = profileName.toLowerCase().includes('headless');
            if (isHeadless) {
                // For headless clients, try to find the main profile's offraid position
                this.logger.info(`[PTT Debug] Detected headless client: ${profileName}`);
                // Get all profiles and find the non-headless one
                const profiles = this.saveServer.getProfiles();
                for (const [otherSessionId, otherProfile] of Object.entries(profiles)) {
                    const otherProfileName = otherProfile?.info?.username || '';
                    const otherPttProfile = otherProfile;
                    if (!otherProfileName.toLowerCase().includes('headless') &&
                        otherPttProfile?.PathToTarkov?.offraidPosition) {
                        this.logger.info(`[PTT Debug] Found main profile: ${otherProfileName} with offraid position: ${otherPttProfile.PathToTarkov.offraidPosition}`);
                        // Use the main profile's offraid position for the headless client
                        if (!profile.PathToTarkov) {
                            profile.PathToTarkov = {};
                        }
                        profile.PathToTarkov.offraidPosition = otherPttProfile.PathToTarkov.offraidPosition;
                        this.logger.info(`[PTT Debug] Synced headless client offraid position to: ${otherPttProfile.PathToTarkov.offraidPosition}`);
                        return otherPttProfile.PathToTarkov.offraidPosition;
                    }
                }
            }
            if (!profile.PathToTarkov) {
                profile.PathToTarkov = {};
            }
            if (!profile.PathToTarkov.offraidPosition) {
                profile.PathToTarkov.offraidPosition = defaultOffraidPosition;
            }
            const offraidPosition = profile.PathToTarkov.offraidPosition;
            this.logger.info(`[PTT Debug] Current offraidPosition: ${offraidPosition}`);
            if (!this.getConfig(sessionId).infiltrations[offraidPosition]) {
                this.debug(`[${sessionId}] Unknown offraid position '${offraidPosition}', reset to default '${defaultOffraidPosition}'`);
                profile.PathToTarkov.offraidPosition = defaultOffraidPosition;
                return profile.PathToTarkov.offraidPosition;
            }
            return offraidPosition;
        };
        this.getConfig = sessionId => {
            const existingConfig = this.configCache[sessionId];
            if (existingConfig) {
                return existingConfig;
            }
            // TODO: instead of persisting the config directly, persist the performed action and replay them in order to rebuild the config
            const newConfig = (0, utils_1.deepClone)(this.baseConfig);
            this.configCache[sessionId] = newConfig;
            return newConfig;
        };
        this.tradersAvailabilityService = new TradersAvailabilityService_1.TradersAvailabilityService();
        this.stashController = new stash_controller_1.StashController(this.getConfig, userConfig, db, saveServer, this.debug);
        this.tradersController = new traders_controller_1.TradersController(this.tradersAvailabilityService, userConfig, db, saveServer, configServer, this.logger);
    }
    init() {
        this.overrideControllers();
        this.overrideRagfairRoutes();
    }
    getFullVersion() {
        return this.packageJson.version;
    }
    setEarlyRagFairConfig() {
        const db = this.db;
        const globals = db.getTables().globals;
        if (!globals) {
            throw new Error('Path To Tarkov: globals not found in database');
        }
        const userConfig = this.getUserConfig();
        const fleaMarketMode = userConfig.gameplay.fleaMarketMode;
        const fleaMarketMinLevel = userConfig.gameplay.fleaMarketMinLevel;
        if (fleaMarketMode === 'disabled') {
            this.debug('Early RagFair configuration: disabled mode');
            globals.config.RagFair.enabled = true; // Keep enabled to prevent UI issues
            globals.config.RagFair.minUserLevel = 99;
        }
        else if (fleaMarketMode === 'everywhere') {
            this.debug(`Early RagFair configuration: enabled everywhere with min level ${fleaMarketMinLevel}`);
            globals.config.RagFair.enabled = true;
            globals.config.RagFair.minUserLevel = fleaMarketMinLevel;
        }
        // Note: location_based mode is handled dynamically per-session in createGetGlobals
    }
    loaded(config) {
        // const allLocales = this.db.getTables()?.locales?.global;
        const quests = this.db.getTables()?.templates?.quests;
        if (!quests) {
            throw new Error('Path To Tarkov: no quests found in db');
        }
        this.tradersAvailabilityService.init(quests);
        this.injectTooltipsInLocales(config);
        this.injectPromptTemplatesInLocales(config);
        this.injectOffraidPositionDisplayNamesInLocales(config);
        this.tradersController.initTraders(config);
        const nbAddedTemplates = this.stashController.initSecondaryStashTemplates(config.hideout_secondary_stashes);
        this.debug(`${nbAddedTemplates} secondary stash templates added`);
        (0, helpers_1.disableRunThrough)(this.db);
        this.debug('disabled run through in-raid status');
    }
    getUserConfig() {
        return this.userConfig;
    }
    setConfig(config, sessionId) {
        // TODO: validation ?
        this.configCache[sessionId] = config;
    }
    setSpawnConfig(spawnConfig) {
        // TODO: validation ?
        this.spawnConfig = spawnConfig;
    }
    // on game start (or profile creation)
    initPlayer(sessionId, _isFreshProfile) {
        // warning: this is not dynamic because of the mutation of the db
        (0, helpers_1.changeRestrictionsInRaid)(this.baseConfig, this.db);
        // warmup cache
        void this.getConfig(sessionId);
        this.stashController.initProfile(sessionId);
        this.fixRepeatableQuestsForProfile(sessionId);
        const offraidPosition = this.getOffraidPosition(sessionId);
        this.updateOffraidPosition(sessionId, offraidPosition);
    }
    isScavMoveOffraidPosition() {
        return this.userConfig.gameplay.playerScavMoveOffraidPosition;
    }
    onPlayerDies(sessionId) {
        if (this.userConfig.gameplay.resetOffraidPositionOnPlayerDeath) {
            const initialOffraidPosition = this.getRespawnOffraidPosition(sessionId);
            this.updateOffraidPosition(sessionId, initialOffraidPosition);
        }
    }
    // returns the new offraid position (or null if not found)
    onPlayerExtracts(params) {
        const { sessionId, newOffraidPosition, isPlayerScav } = params;
        if (this.userConfig.gameplay.keepFoundInRaidTweak) {
            const firTweak = new keep_fir_tweak_1.KeepFoundInRaidTweak(this.saveServer);
            const nbImpactedItems = firTweak.setFoundInRaidOnEquipment(sessionId, isPlayerScav);
            this.debug(`[${sessionId}] FIR tweak added SpawnedInSession on ${nbImpactedItems} item${nbImpactedItems > 1 ? 's' : ''}`);
        }
        else {
            this.debug(`[${sessionId}] FIR tweak disabled`);
        }
        this.updateOffraidPosition(sessionId, newOffraidPosition);
    }
    /**
     * Warning: this function will mutate the given locationBase
     */
    syncLocationBase(locationBase, sessionId) {
        const raidCache = this.getRaidCache(sessionId);
        this.logger.info(`[PTT Debug] syncLocationBase called for sessionId: ${sessionId}`);
        this.logger.info(`[PTT Debug] RaidCache exists: ${!!raidCache}, exitStatus: ${raidCache?.exitStatus}, transitTargetMapName: ${raidCache?.transitTargetMapName}, transitTargetSpawnPointId: ${raidCache?.transitTargetSpawnPointId}`);
        // Check if this might be a headless client with missing raid cache
        if (!raidCache) {
            this.logger.warning(`[PTT Debug] No raid cache found for session ${sessionId}, this might be a headless client`);
            // For headless clients, we should still update spawn points based on offraid position
            this.updateSpawnPoints(locationBase, sessionId);
            this.updateLocationBaseExits(locationBase, sessionId);
            this.updateLocationBaseTransits(locationBase, sessionId);
            return;
        }
        if (raidCache && raidCache.exitStatus === 'Transit') {
            // handle when a player took a vanilla transit
            this.logger.info(`[PTT Debug] Handling vanilla transit`);
            this.updateInfiltrationForPlayerSpawnPoints(locationBase);
        }
        if (raidCache && raidCache.transitTargetMapName && raidCache.transitTargetSpawnPointId) {
            // handle when a player took a ptt transit
            this.logger.info(`[PTT Debug] Handling PTT transit to ${raidCache.transitTargetMapName} at spawn ${raidCache.transitTargetSpawnPointId}`);
            this.updateSpawnPointsForTransit(locationBase, sessionId, raidCache.transitTargetMapName, raidCache.transitTargetSpawnPointId);
        }
        else {
            // handle when a player took a ptt extract
            this.logger.info(`[PTT Debug] Handling PTT extract or initial spawn`);
            this.updateSpawnPoints(locationBase, sessionId);
        }
        this.updateLocationBaseExits(locationBase, sessionId);
        this.updateLocationBaseTransits(locationBase, sessionId);
    }
    debugExfiltrationsTooltips(config) {
        const debugLocale = config.debug_exfiltrations_tooltips_locale;
        if (!debugLocale) {
            return;
        }
        const localeValues = this.getTooltipsTemplater().debugTooltipsForLocale(debugLocale, config);
        this.debug(`debug exfils tooltips => ${JSON.stringify(localeValues, undefined, 2)}`);
    }
    createTooltipsTemplater() {
        const allLocales = this.db.getTables()?.locales?.global;
        if (!allLocales) {
            throw new Error('Path To Tarkov: no locales found in db');
        }
        return new ExfilsTooltipsTemplater_1.ExfilsTooltipsTemplater(allLocales);
    }
    getTooltipsTemplater() {
        if (!this.tooltipsTemplater) {
            this.tooltipsTemplater = this.createTooltipsTemplater();
        }
        return this.tooltipsTemplater;
    }
    // TODO: make it dynamic (aka intercept instead of mutating the db)
    injectTooltipsInLocales(config) {
        const allLocales = this.db.getTables()?.locales?.global;
        if (!allLocales) {
            throw new Error('Path To Tarkov: no locales found in db');
        }
        const partialLocales = this.getTooltipsTemplater().computeLocales(config);
        const report = (0, helpers_1.mutateLocales)(allLocales, partialLocales);
        const nbValuesUpdated = report.nbTotalValuesUpdated / report.nbLocalesImpacted;
        this.debug(`${nbValuesUpdated} extract tooltip values updated for ${report.nbLocalesImpacted} locales (total of ${report.nbTotalValuesUpdated})`);
    }
    // TODO: refactor in a dedicated service
    // TODO: make it dynamic (aka intercept instead of mutating the db)
    injectPromptTemplatesInLocales(config) {
        const allLocales = this.db.getTables()?.locales?.global;
        if (!allLocales) {
            throw new Error('Path To Tarkov: no locales found in db');
        }
        // 1. prepare transits_prompt_template
        const DEFAULT_TRANSITS_PROMPT_TEMPLATE_KEY = 'PTT_TRANSITS_PROMPT_TEMPLATE';
        const DEFAULT_TRANSITS_PROMPT_TEMPLATE_VALUE = 'Transit to {0}';
        const DEFAULT_TRANSITS_PROMPT_TEMPLATE = {
            [config_1.DEFAULT_FALLBACK_LANGUAGE]: DEFAULT_TRANSITS_PROMPT_TEMPLATE_VALUE,
        };
        const transitsPromptTemplate = config.transits_prompt_template ?? DEFAULT_TRANSITS_PROMPT_TEMPLATE;
        // 2. prepare extracts_prompt_template
        const DEFAULT_EXTRACTS_PROMPT_TEMPLATE_KEY = 'PTT_EXTRACTS_PROMPT_TEMPLATE';
        const DEFAULT_EXTRACTS_PROMPT_TEMPLATE_VALUE = 'Extract to {0}';
        const DEFAULT_EXTRACTS_PROMPT_TEMPLATE = {
            [config_1.DEFAULT_FALLBACK_LANGUAGE]: DEFAULT_EXTRACTS_PROMPT_TEMPLATE_VALUE,
        };
        const extractsPromptTemplate = config.extracts_prompt_template ?? DEFAULT_EXTRACTS_PROMPT_TEMPLATE;
        // 3. prepare new locales
        const newLocales = {};
        Object.keys(allLocales).forEach(locale => {
            const localeValues = {
                [DEFAULT_TRANSITS_PROMPT_TEMPLATE_KEY]: transitsPromptTemplate[locale] ?? DEFAULT_TRANSITS_PROMPT_TEMPLATE_VALUE,
                [DEFAULT_EXTRACTS_PROMPT_TEMPLATE_KEY]: extractsPromptTemplate[locale] ?? DEFAULT_EXTRACTS_PROMPT_TEMPLATE_VALUE,
            };
            newLocales[locale] = localeValues;
        });
        // 4. mutate locales
        const report = (0, helpers_1.mutateLocales)(allLocales, newLocales);
        const nbValuesUpdated = report.nbTotalValuesUpdated / report.nbLocalesImpacted;
        this.debug(`${nbValuesUpdated} prompt templates values updated for ${report.nbLocalesImpacted} locales (total of ${report.nbTotalValuesUpdated})`);
    }
    injectOffraidPositionDisplayNamesInLocales(config) {
        const allLocales = this.db.getTables()?.locales?.global;
        if (!allLocales) {
            throw new Error('Path To Tarkov: no locales found in db');
        }
        // 1. create new locales
        const newLocales = {};
        Object.keys(allLocales).forEach(locale => {
            const localeValues = {};
            const offraidPositions = config.offraid_positions ?? {};
            Object.keys(offraidPositions).forEach(offraidPosition => {
                const displayNameValue = ExfilsTooltipsTemplater_1.ExfilsTooltipsTemplater.resolveOffraidPositionDisplayName(config, {
                    offraidPosition,
                    locale: locale,
                });
                localeValues[`PTT_OFFRAIDPOS_DISPLAY_NAME_${offraidPosition}`] = displayNameValue;
            });
            newLocales[locale] = localeValues;
        });
        // 2. mutate locales
        const report = (0, helpers_1.mutateLocales)(allLocales, newLocales);
        const nbValuesUpdated = report.nbTotalValuesUpdated / report.nbLocalesImpacted;
        this.debug(`${nbValuesUpdated} prompt templates values updated for ${report.nbLocalesImpacted} locales (total of ${report.nbTotalValuesUpdated})`);
    }
    fixRepeatableQuestsForProfile(sessionId) {
        const profile = this.saveServer.getProfile(sessionId);
        const pmc = profile.characters.pmc;
        const nbRemovedQuests = (0, fix_repeatable_quests_1.fixRepeatableQuestsForPmc)(pmc);
        this.debug(`${nbRemovedQuests} removed broken repeatable quests in profile ${sessionId}`);
    }
    updateOffraidPosition(sessionId, offraidPosition) {
        if (!offraidPosition) {
            offraidPosition = this.getOffraidPosition(sessionId);
        }
        const profile = this.saveServer.getProfile(sessionId);
        const prevOffraidPosition = profile?.PathToTarkov?.offraidPosition;
        if (!profile.PathToTarkov) {
            profile.PathToTarkov = {};
        }
        profile.PathToTarkov.offraidPosition = offraidPosition;
        if (prevOffraidPosition !== offraidPosition) {
            this.logger.info(`=> PathToTarkov: player offraid position changed to '${offraidPosition}'`);
        }
        const nbCleared = this.stashController.clearRoamingEmergencyStashOnExit(offraidPosition, sessionId);
        if (nbCleared > 0) {
            this.logger.warning(`=> PathToTarkov: cleared ${nbCleared} item${nbCleared > 1 ? 's' : ''} from roaming emergency stash`);
        }
        this.stashController.updateStash(offraidPosition, sessionId);
        const config = this.getConfig(sessionId);
        this.tradersController.updateTraders(config.traders_config, this.userConfig.gameplay.tradersAccessRestriction, offraidPosition, sessionId);
        this.saveServer.saveProfile(sessionId);
    }
    createGenerateAll(originalFn) {
        return (sessionId) => {
            const offraidPosition = this.getOffraidPosition(sessionId);
            const result = originalFn(sessionId);
            const locations = (0, utils_1.deepClone)(result.locations);
            const indexedLocations = getIndexedLocations(locations);
            const unlockedMaps = this.getConfig(sessionId).infiltrations[offraidPosition];
            const unlockedLocationBases = [];
            config_1.MAPLIST.forEach(mapName => {
                const locked = Boolean(!unlockedMaps[mapName]);
                const locationBase = indexedLocations[mapName];
                if (locationBase) {
                    if (!locked) {
                        this.debug(`[${sessionId}] unlock map ${mapName}`);
                        unlockedLocationBases.push(locationBase);
                    }
                    locationBase.Locked = locked;
                    locationBase.Enabled = !locked;
                    this.syncLocationBase(locationBase, sessionId);
                }
            });
            const newPaths = []; // TODO: keep the original path (with filter on locked maps)
            return { ...result, locations, paths: newPaths };
        };
    }
    createGetTemplateItems(originalFn) {
        return (url, info, sessionId) => {
            const offraidPosition = this.getOffraidPosition(sessionId);
            const rawResult = originalFn(url, info, sessionId);
            const parsed = JSON.parse(rawResult);
            const items = parsed.data;
            const size = this.stashController.getStashSize(offraidPosition, sessionId);
            if (size === null) {
                this.debug(`[${sessionId}] main stash selected`);
                return rawResult;
            }
            this.debug(`[${sessionId}] override secondary stash size to ${size}`);
            config_1.VANILLA_STASH_IDS.forEach(stashId => {
                const item = items[stashId];
                const grid = item?._props?.Grids?.[0];
                const gridProps = grid?._props;
                if (gridProps) {
                    gridProps.cellsV = size;
                }
                else {
                    throw new Error('Path To Tarkov: cannot set size for custom stash');
                }
            });
            return JSON.stringify(parsed);
        };
    }
    createGetHideoutAreas(originalFn) {
        return (url, info, sessionId) => {
            const offraidPosition = this.getOffraidPosition(sessionId);
            const rawResult = originalFn(url, info, sessionId);
            const parsed = JSON.parse(rawResult);
            const areas = parsed.data;
            const hideoutEnabled = this.stashController.getHideoutEnabled(offraidPosition, sessionId);
            areas.forEach(area => {
                if (!(0, helpers_1.isIgnoredArea)(area)) {
                    area.enabled = hideoutEnabled;
                }
            });
            if (hideoutEnabled) {
                this.debug(`[${sessionId}] main hideout enabled`);
            }
            else {
                this.debug(`[${sessionId}] main hideout disabled`);
            }
            return JSON.stringify(parsed);
        };
    }
    createGetGlobals(originalFn) {
        return (url, info, sessionId) => {
            this.debug(`[${sessionId}] Datacallbacks.getGlobals call`);
            const offraidPosition = this.getOffraidPosition(sessionId);
            const rawResult = originalFn(url, info, sessionId);
            const parsed = JSON.parse(rawResult);
            const globals = parsed.data;
            const regenDb = globals.config.Health.Effects.Regeneration;
            const offraidRegenConfig = this.getConfig(sessionId).offraid_regen_config;
            // hydration restrictions
            if (!(0, helpers_1.checkAccessVia)(offraidRegenConfig.hydration.access_via, offraidPosition)) {
                this.debug(`[${sessionId}] disable hideout hydration regen`);
                regenDb.Hydration = 0;
            }
            // energy restrictions
            if (!(0, helpers_1.checkAccessVia)(offraidRegenConfig.energy.access_via, offraidPosition)) {
                this.debug(`[${sessionId}] disable hideout energy regen`);
                regenDb.Energy = 0;
            }
            // health restrictions
            if (!(0, helpers_1.checkAccessVia)(offraidRegenConfig.health.access_via, offraidPosition)) {
                this.debug(`[${sessionId}] disable hideout health regen`);
                Object.keys(regenDb.BodyHealth).forEach(k => {
                    const bodyHealth = regenDb.BodyHealth[k];
                    bodyHealth.Value = 0;
                });
            }
            // Handle Ragfair (Flea Market) access
            const userConfig = this.getUserConfig();
            const fleaMarketMode = userConfig.gameplay.fleaMarketMode;
            const fleaMarketMinLevel = userConfig.gameplay.fleaMarketMinLevel;
            if (fleaMarketMode === 'disabled') {
                this.debug(`[${sessionId}] Ragfair disabled by user config`);
                globals.config.RagFair.enabled = true; // Keep enabled to prevent UI issues
                globals.config.RagFair.minUserLevel = 99;
            }
            else if (fleaMarketMode === 'everywhere') {
                this.debug(`[${sessionId}] Ragfair enabled everywhere with min level ${fleaMarketMinLevel}`);
                globals.config.RagFair.enabled = true;
                globals.config.RagFair.minUserLevel = fleaMarketMinLevel;
            }
            else if (fleaMarketMode === 'location_based') {
                const ragfairConfig = this.getConfig(sessionId).traders_config.ragfair;
                if (ragfairConfig) {
                    const ragfairAvailable = (0, helpers_1.checkAccessVia)(ragfairConfig.access_via, offraidPosition);
                    if (ragfairAvailable) {
                        this.debug(`[${sessionId}] Ragfair enabled at position ${offraidPosition} with min level ${fleaMarketMinLevel}`);
                        globals.config.RagFair.enabled = true;
                        globals.config.RagFair.minUserLevel = fleaMarketMinLevel;
                    }
                    else {
                        this.debug(`[${sessionId}] Ragfair disabled at position ${offraidPosition}`);
                        globals.config.RagFair.enabled = true; // Keep enabled to prevent UI issues
                        globals.config.RagFair.minUserLevel = 99;
                    }
                }
                else {
                    // No ragfair config found, default to everywhere mode
                    this.debug(`[${sessionId}] No ragfair config found, defaulting to everywhere mode with min level ${fleaMarketMinLevel}`);
                    globals.config.RagFair.enabled = true;
                    globals.config.RagFair.minUserLevel = fleaMarketMinLevel;
                }
            }
            return JSON.stringify(parsed);
        };
    }
    overrideRagfairRoutes() {
        // Hook into ragfair callbacks to enforce flea market restrictions
        this.container.afterResolution('RagfairCallbacks', (_t, result) => {
            const ragfairCallbacks = Array.isArray(result) ? result[0] : result;
            // Helper function to update server-side globals based on player location
            const updateGlobalsForSession = (sessionID) => {
                const offraidPosition = this.getOffraidPosition(sessionID);
                const userConfig = this.getUserConfig();
                const fleaMarketMode = userConfig.gameplay.fleaMarketMode;
                const fleaMarketMinLevel = userConfig.gameplay.fleaMarketMinLevel;
                // Get the server-side globals
                const globals = this.db.getTables().globals;
                if (!globals) {
                    throw new Error('Path To Tarkov: globals not found in database');
                }
                const originalMinLevel = globals.config.RagFair.minUserLevel;
                // Determine the correct minUserLevel based on fleaMarketMode and player location
                let targetMinLevel = fleaMarketMinLevel;
                if (fleaMarketMode === 'disabled') {
                    targetMinLevel = 99;
                }
                else if (fleaMarketMode === 'location_based') {
                    const ragfairConfig = this.getConfig(sessionID).traders_config.ragfair;
                    if (ragfairConfig && !(0, helpers_1.checkAccessVia)(ragfairConfig.access_via, offraidPosition)) {
                        targetMinLevel = 99;
                    }
                }
                // Update server-side globals
                globals.config.RagFair.minUserLevel = targetMinLevel;
                return originalMinLevel;
            };
            // Override search method
            if (ragfairCallbacks.search) {
                const originalSearch = ragfairCallbacks.search.bind(ragfairCallbacks);
                ragfairCallbacks.search = (url, info, sessionID) => {
                    const originalMinLevel = updateGlobalsForSession(sessionID);
                    const globals = this.db.getTables().globals;
                    try {
                        const result = originalSearch(url, info, sessionID);
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        return result;
                    }
                    catch (error) {
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        throw error;
                    }
                };
            }
            // Override addOffer method
            if (ragfairCallbacks.addOffer) {
                const originalAddOffer = ragfairCallbacks.addOffer.bind(ragfairCallbacks);
                ragfairCallbacks.addOffer = (pmcData, info, sessionID) => {
                    const originalMinLevel = updateGlobalsForSession(sessionID);
                    const globals = this.db.getTables().globals;
                    try {
                        const result = originalAddOffer(pmcData, info, sessionID);
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        return result;
                    }
                    catch (error) {
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        throw error;
                    }
                };
            }
            // Override extendOffer method
            if (ragfairCallbacks.extendOffer) {
                const originalExtendOffer = ragfairCallbacks.extendOffer.bind(ragfairCallbacks);
                ragfairCallbacks.extendOffer = (pmcData, info, sessionID) => {
                    const originalMinLevel = updateGlobalsForSession(sessionID);
                    const globals = this.db.getTables().globals;
                    try {
                        const result = originalExtendOffer(pmcData, info, sessionID);
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        return result;
                    }
                    catch (error) {
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        throw error;
                    }
                };
            }
            // Override getMarketPrice method
            if (ragfairCallbacks.getMarketPrice) {
                const originalGetMarketPrice = ragfairCallbacks.getMarketPrice.bind(ragfairCallbacks);
                ragfairCallbacks.getMarketPrice = (url, info, sessionID) => {
                    const originalMinLevel = updateGlobalsForSession(sessionID);
                    const globals = this.db.getTables().globals;
                    try {
                        const result = originalGetMarketPrice(url, info, sessionID);
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        return result;
                    }
                    catch (error) {
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        throw error;
                    }
                };
            }
            // Override getFleaPrices method
            if (ragfairCallbacks.getFleaPrices) {
                const originalGetFleaPrices = ragfairCallbacks.getFleaPrices.bind(ragfairCallbacks);
                ragfairCallbacks.getFleaPrices = (url, info, sessionID) => {
                    const originalMinLevel = updateGlobalsForSession(sessionID);
                    const globals = this.db.getTables().globals;
                    try {
                        const result = originalGetFleaPrices(url, info, sessionID);
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        return result;
                    }
                    catch (error) {
                        if (globals) {
                            globals.config.RagFair.minUserLevel = originalMinLevel;
                        }
                        throw error;
                    }
                };
            }
        }, { frequency: 'Always' });
    }
    overrideControllers() {
        this.container.afterResolution('LocationController', (_t, result) => {
            const locationController = Array.isArray(result) ? result[0] : result;
            const originalGenerateAll = locationController.generateAll.bind(locationController);
            locationController.generateAll = this.createGenerateAll(originalGenerateAll);
        }, { frequency: 'Always' });
        this.container.afterResolution('DataCallbacks', (_t, result) => {
            const dataCallbacks = Array.isArray(result) ? result[0] : result;
            // override getTemplateItems
            const originalGetTemplateItems = dataCallbacks.getTemplateItems.bind(dataCallbacks);
            dataCallbacks.getTemplateItems = this.createGetTemplateItems(originalGetTemplateItems);
            // override getHideoutAreas
            const originalGetHideoutAreas = dataCallbacks.getHideoutAreas.bind(dataCallbacks);
            dataCallbacks.getHideoutAreas = this.createGetHideoutAreas(originalGetHideoutAreas);
            // override getGlobals
            const originalGetGlobals = dataCallbacks.getGlobals.bind(dataCallbacks);
            dataCallbacks.getGlobals = this.createGetGlobals(originalGetGlobals);
        }, { frequency: 'Always' });
    }
    removePlayerSpawnsForLocation(locationBase) {
        const newSpawnPoints = locationBase.SpawnPointParams.map(spawn => {
            const newSpawn = (0, helpers_1.rejectPlayerCategory)(spawn);
            if (newSpawn.Categories.length === 0) {
                return undefined;
            }
            return newSpawn;
        }).filter(utils_1.isNotUndefined);
        locationBase.SpawnPointParams = newSpawnPoints;
    }
    updateSpawnPoints(locationBase, sessionId) {
        if (!this.isLocationBaseAvailable(locationBase)) {
            return;
        }
        const mapName = (0, map_name_resolver_1.resolveMapNameFromLocation)(locationBase.Id);
        const infiltrations = this.getConfig(sessionId).infiltrations;
        const offraidPosition = this.getOffraidPosition(sessionId);
        this.logger.info(`[PTT Debug] updateSpawnPoints - map: ${mapName}, sessionId: ${sessionId}, offraidPosition: ${offraidPosition}`);
        if (!infiltrations[offraidPosition]) {
            this.debug(`[${sessionId}] no offraid position '${offraidPosition}' found in config.infiltrations`);
            return;
        }
        const spawnpoints = infiltrations[offraidPosition][mapName];
        this.logger.info(`[PTT Debug] Configured spawn points for ${mapName} at ${offraidPosition}: ${spawnpoints ? spawnpoints.join(', ') : 'none'}`);
        if (spawnpoints && spawnpoints.length > 0) {
            if (spawnpoints[0] === '*') {
                // don't update the spawnpoints if wildcard is used
                this.logger.info(`[PTT Debug] Using wildcard spawn points for ${mapName}`);
                return;
            }
            this.debug(`[${sessionId}] all player spawns cleaned up for location ${mapName}`);
            this.removePlayerSpawnsForLocation(locationBase);
            spawnpoints.forEach(spawnId => {
                const spawnData = this.spawnConfig[mapName] && this.spawnConfig[mapName][spawnId];
                if (spawnData) {
                    const spawnPoint = (0, helpers_1.createSpawnPoint)(spawnData.Position, spawnData.Rotation, spawnId);
                    if (!spawnPoint.Infiltration) {
                        this.logger.warning(`=> PathToTarkov: spawn '${spawnId}' has no Infiltration`);
                    }
                    locationBase.SpawnPointParams.push(spawnPoint);
                    this.debug(`[${sessionId}] player spawn '${spawnId}' added for location ${mapName}`);
                }
            });
        }
    }
    updateSpawnPointsForTransit(locationBase, sessionId, transitTargetMapName, transitTargetSpawnPointId) {
        if (!this.isLocationBaseAvailable(locationBase)) {
            return;
        }
        const mapName = (0, map_name_resolver_1.resolveMapNameFromLocation)(locationBase.Id);
        if (mapName !== transitTargetMapName) {
            return;
        }
        const spawnId = transitTargetSpawnPointId;
        const spawnData = this.spawnConfig[mapName] && this.spawnConfig[mapName][spawnId];
        if (spawnData) {
            const spawnPoint = (0, helpers_1.createSpawnPoint)(spawnData.Position, spawnData.Rotation, spawnId);
            if (!spawnPoint.Infiltration) {
                this.logger.warning(`=> PathToTarkov: spawn '${spawnId}' has no Infiltration (player in transit)`);
            }
            this.removePlayerSpawnsForLocation(locationBase);
            locationBase.SpawnPointParams.push(spawnPoint);
            this.debug(`[${sessionId}] player spawn '${spawnId}' added for location ${mapName} (player in transit)`);
        }
        this.debug(`Transit detected on map "${mapName}" via spawnpoint "${transitTargetSpawnPointId}"`);
    }
    /**
     * The purpose of this function is to set the PTT Infiltration field for all player spawnpoints
     * It will allow exfils to be available even when player took a vanilla transit
     */
    updateInfiltrationForPlayerSpawnPoints(locationBase) {
        if (!this.isLocationBaseAvailable(locationBase)) {
            return;
        }
        locationBase.SpawnPointParams.forEach(spawnPoint => {
            if ((0, helpers_1.isPlayerSpawnPoint)(spawnPoint)) {
                spawnPoint.Infiltration = helpers_1.PTT_INFILTRATION;
            }
        });
    }
    // this will ignore unavailable maps (like terminal)
    isLocationBaseAvailable(locationBase) {
        if (locationBase.Scene.path && locationBase.Scene.rcid) {
            return true;
        }
        return false;
    }
    /**
     * Disable transits if specified by the config
     */
    updateLocationBaseTransits(locationBase, sessionId) {
        if (!this.isLocationBaseAvailable(locationBase)) {
            return;
        }
        const config = this.getConfig(sessionId);
        const noVanillaTransits = !config.enable_all_vanilla_transits;
        if (noVanillaTransits) {
            this.updateLocationDisableAllTransits(locationBase);
        }
    }
    updateLocationDisableAllTransits(locationBase) {
        const transits = locationBase.transits ?? [];
        transits.forEach(transit => {
            transit.active = false;
        });
    }
    updateLocationBaseExits(locationBase, sessionId) {
        if (!this.isLocationBaseAvailable(locationBase)) {
            return;
        }
        const config = this.getConfig(sessionId);
        if (config.bypass_exfils_override) {
            return;
        }
        const mapName = (0, map_name_resolver_1.resolveMapNameFromLocation)(locationBase.Id);
        const extractPoints = Object.keys(config.exfiltrations[mapName] ?? {});
        if (extractPoints.length === 0) {
            this.logger.error(`Path To Tarkov: no exfils found for map '${mapName}'!`);
            return;
        }
        // TODO(refactor): implement an indexBy util
        const indexedExits = locationBase.exits.reduce((indexed, exit) => {
            return {
                ...indexed,
                [exit.Name]: exit,
            };
        }, {});
        // erase all exits and create custom exit points without requirements
        locationBase.exits = extractPoints.map(exitName => {
            const originalExit = indexedExits[exitName];
            return (0, helpers_1.createExitPoint)(exitName, originalExit);
        });
    }
}
exports.PathToTarkovController = PathToTarkovController;
