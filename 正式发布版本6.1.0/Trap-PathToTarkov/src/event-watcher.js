"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventWatcher = void 0;
const utils_1 = require("./utils");
const exfils_targets_1 = require("./exfils-targets");
const map_name_resolver_1 = require("./map-name-resolver");
const createInitialRaidCache = (sessionId) => ({
    sessionId: sessionId,
    currentLocationName: null,
    exitName: undefined,
    targetOffraidPosition: null,
    transitTargetMapName: null,
    transitTargetSpawnPointId: null,
    isPlayerScav: null,
    exitStatus: null,
});
class EventWatcher {
    constructor(ptt, saveServer) {
        this.ptt = ptt;
        this.saveServer = saveServer;
        this.endOfRaidCallback = null;
        this.raidCaches = {};
    }
    initRaidCache(sessionId) {
        const existingRaidCache = this.raidCaches[sessionId];
        // raid cache is not resetted when player is in a map transit
        if (existingRaidCache && existingRaidCache.exitStatus === 'Transit') {
            return;
        }
        this.raidCaches[sessionId] = createInitialRaidCache(sessionId);
    }
    getRaidCache(sessionId) {
        const raidCache = this.raidCaches[sessionId];
        if (!raidCache) {
            this.ptt.logger.error(`Path To Tarkov: cannot get raidCache for '${sessionId}'`);
            return null;
        }
        return raidCache;
    }
    watchOnGameStart(staticRoutePeeker) {
        staticRoutePeeker.watchRoute('/client/game/start', (url, data, sessionId) => {
            this.initRaidCache(sessionId);
            const profile = this.saveServer.getProfile(sessionId);
            const inventory = profile.characters.pmc.Inventory;
            if (!inventory) {
                this.ptt.debug(`/client/game/start: no pmc data found, init will be handled on profile creation`);
                // no pmc data found, init will be handled by `watchOnProfileCreated`
                return;
            }
            this.ptt.pathToTarkovController.initPlayer(sessionId, false);
            this.ptt.executeOnStartAPICallbacks(sessionId);
            this.ptt.logger.info(`=> PathToTarkov: game started!`);
        });
    }
    watchOnProfileCreated(staticRoutePeeker) {
        staticRoutePeeker.watchRoute('/client/game/profile/create', (url, data, sessionId) => {
            this.initRaidCache(sessionId);
            this.ptt.pathToTarkovController.initPlayer(sessionId, true);
            this.ptt.executeOnStartAPICallbacks(sessionId);
            this.ptt.logger.info(`=> PathToTarkov: pmc created!`);
        });
    }
    watchStartOfRaid(container) {
        container.afterResolution('MatchController', (_t, givenMatchControllers) => {
            const matchController = Array.isArray(givenMatchControllers)
                ? givenMatchControllers[0]
                : givenMatchControllers;
            const originalStartLocalRaid = matchController.startLocalRaid.bind(matchController);
            matchController.startLocalRaid = (sessionId, data) => {
                const result = (0, utils_1.deepClone)(originalStartLocalRaid(sessionId, data));
                const locationBase = result.locationLoot;
                // Debug logging for headless client investigation
                this.ptt.logger.info(`[PTT Debug] startLocalRaid called with sessionId: ${sessionId}, location: ${data.location}, playerSide: ${data.playerSide}`);
                this.ptt.logger.info(`[PTT Debug] Initial spawn points count: ${locationBase.SpawnPointParams?.length || 0}`);
                this.ptt.pathToTarkovController.syncLocationBase(locationBase, sessionId);
                // Log spawn points after sync
                this.ptt.logger.info(`[PTT Debug] After sync spawn points count: ${locationBase.SpawnPointParams?.length || 0}`);
                const playerSpawns = locationBase.SpawnPointParams?.filter(sp => sp.Categories?.includes('Player')) || [];
                this.ptt.logger.info(`[PTT Debug] Player spawn points: ${playerSpawns.map(sp => `${sp.Id} (Infiltration: ${sp.Infiltration})`).join(', ')}`);
                // Additional debug for headless client detection
                const profile = this.saveServer.getProfile(sessionId);
                const profileName = profile?.info?.username || 'unknown';
                const isHeadless = profileName.toLowerCase().includes('headless');
                this.ptt.logger.info(`[PTT Debug] Profile name: ${profileName}, Is headless: ${isHeadless}`);
                this.initRaidCache(sessionId);
                const raidCache = this.getRaidCache(sessionId);
                if (!raidCache) {
                    this.ptt.logger.error(`no PTT raid cache found when starting the raid`);
                    return result;
                }
                // void data.mode; // => "PVE_OFFLINE"
                // void data.playerSide; // => "Pmc" | "Savage"
                raidCache.isPlayerScav = data.playerSide === 'Savage';
                raidCache.currentLocationName = data.location;
                this.ptt.debug(`offline raid started on location '${data.location}' with sessionId '${sessionId}'`);
                return result;
            };
        }, { frequency: 'Always' });
    }
    watchEndOfRaid(container) {
        container.afterResolution('MatchCallbacks', (_t, givenMatchCallbacks) => {
            const matchCallbacks = Array.isArray(givenMatchCallbacks)
                ? givenMatchCallbacks[0]
                : givenMatchCallbacks;
            const originalEndLocalRaid = matchCallbacks.endLocalRaid.bind(matchCallbacks);
            matchCallbacks.endLocalRaid = (url, data, sessionId) => {
                const raidCache = this.getRaidCache(sessionId);
                if (!raidCache) {
                    this.ptt.logger.error(`no PTT raid cache found`);
                    return originalEndLocalRaid(url, data, sessionId);
                }
                raidCache.sessionId = sessionId;
                raidCache.exitStatus = data.results.result;
                const parsedExfilTarget = (0, exfils_targets_1.parseExfilTargetFromExitName)(data.results.exitName ?? '');
                raidCache.exitName = parsedExfilTarget.exitName;
                raidCache.targetOffraidPosition = parsedExfilTarget.targetOffraidPosition;
                raidCache.transitTargetMapName = parsedExfilTarget.transitTargetMapName;
                raidCache.transitTargetSpawnPointId = parsedExfilTarget.transitTargetSpawnPointId;
                this.ptt.debug(`end of raid detected for exit '${raidCache.exitName}' with status '${raidCache.exitStatus}'`);
                // restore original exitName (because passed exitName is supposed to be a custom ptt exit)
                const originalExitName = parsedExfilTarget.exitName ?? data.results.exitName;
                const originalData = {
                    ...data,
                    results: {
                        ...data.results,
                        exitName: originalExitName,
                    },
                };
                const result = originalEndLocalRaid(url, originalData, sessionId);
                this.runEndOfRaidCallback(sessionId);
                return result;
            };
        }, { frequency: 'Always' });
    }
    // This part is here to handle regular extracts (e.g. when Interactable Exfils API is not installed)
    handleRegularExtracts(payload) {
        const mapName = (0, map_name_resolver_1.resolveMapNameFromLocation)(payload.locationName);
        const config = this.ptt.pathToTarkovController.getConfig(payload.sessionId);
        const exitName = payload.exitName ?? '';
        const exfilTargets = config.exfiltrations[mapName]?.[exitName] ?? [];
        const foundOffraidPosition = exfilTargets.find(exfilTarget => Boolean((0, exfils_targets_1.parseExilTargetFromPTTConfig)(exfilTarget).targetOffraidPosition));
        if (!foundOffraidPosition) {
            throw new Error(`cannot determine offraid position from config for map "${mapName}" using extract "${exitName}"`);
        }
        this.ptt.logger.warning(`Path To Tarkov: new offraid position automatically determined from config for map "${mapName}" using extract "${exitName}"`);
        return {
            ...payload,
            isTransit: false,
            newOffraidPosition: foundOffraidPosition,
        };
    }
    getEndOfRaidPayload(sessionId) {
        const { currentLocationName, isPlayerScav, exitName, targetOffraidPosition, transitTargetMapName, transitTargetSpawnPointId, } = this.raidCaches[sessionId];
        if (sessionId === null) {
            throw new Error('raidCache.sessionId is null');
        }
        if (currentLocationName === null) {
            throw new Error('raidCache.currentLocationName is null');
        }
        if (isPlayerScav === null) {
            throw new Error('raidCache.isPlayerScav is null');
        }
        if (exitName === undefined) {
            throw new Error('raidCache.exitName is undefined');
        }
        if (targetOffraidPosition && transitTargetMapName && transitTargetSpawnPointId) {
            throw new Error('raidCache cannot determine if we are in transit or extract');
        }
        if (transitTargetMapName && !transitTargetSpawnPointId) {
            throw new Error('raidCache.transitTargetSpawnPointId is null');
        }
        if (!transitTargetMapName && transitTargetSpawnPointId) {
            throw new Error('raidCache.transitTargetMapName is null');
        }
        const endOfRaidPayload = {
            sessionId,
            locationName: currentLocationName,
            isPlayerScav,
            exitName,
            newOffraidPosition: targetOffraidPosition,
            isTransit: !targetOffraidPosition,
        };
        if (exitName && !targetOffraidPosition && !transitTargetMapName && !transitTargetSpawnPointId) {
            return this.handleRegularExtracts(endOfRaidPayload);
        }
        return endOfRaidPayload;
    }
    runEndOfRaidCallback(sessionId) {
        if (this.endOfRaidCallback) {
            try {
                const endOfRaidPayload = this.getEndOfRaidPayload(sessionId);
                this.endOfRaidCallback(endOfRaidPayload);
            }
            catch (error) {
                this.ptt.logger.error(`Path To Tarkov Error: ${error.message}`);
            }
        }
        else {
            this.ptt.logger.error('Path To Tarkov Error: no endOfRaidCallback on EventWatcher!');
        }
    }
    onEndOfRaid(cb) {
        if (this.endOfRaidCallback) {
            throw new Error('Path To Tarkov EventWatcher: endOfRaidCallback already setted!');
        }
        this.endOfRaidCallback = cb;
    }
    register(staticRoutePeeker, container) {
        this.watchOnGameStart(staticRoutePeeker);
        this.watchOnProfileCreated(staticRoutePeeker);
        this.watchStartOfRaid(container);
        this.watchEndOfRaid(container);
        staticRoutePeeker.register();
    }
}
exports.EventWatcher = EventWatcher;
