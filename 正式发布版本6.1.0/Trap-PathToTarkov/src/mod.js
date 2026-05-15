"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const api_1 = require("./api");
const config_1 = require("./config");
const event_watcher_1 = require("./event-watcher");
const helpers_1 = require("./helpers");
const path_to_tarkov_controller_1 = require("./path-to-tarkov-controller");
const uninstall_1 = require("./uninstall");
const utils_1 = require("./utils");
const end_of_raid_controller_1 = require("./end-of-raid-controller");
const fix_repeatable_quests_1 = require("./fix-repeatable-quests");
const config_analysis_1 = require("./config-analysis");
const TradersAvailabilityService_1 = require("./services/TradersAvailabilityService");
const routes_1 = require("./routes");
const installation_analysis_1 = require("./installation-analysis");
const ptt_log_header_1 = require("./ptt-log-header");
const version_1 = require("./routes/version");
class PathToTarkov {
    constructor() {
        this.executeOnStartAPICallbacks = utils_1.noop;
    }
    runStaticAnalysis() {
        const analysisResult = (0, config_analysis_1.analyzeConfig)(this.config, this.spawnConfig);
        if (analysisResult.warnings.length > 0) {
            this.logger.info((0, ptt_log_header_1.getPTTLogHeader)(`Warnings found in "${this.userConfig.selectedConfig}" config`));
            analysisResult.warnings.forEach(warn => {
                this.logger.warning(`[Path To Tarkov Config] ${warn}`);
            });
        }
        if (analysisResult.errors.length > 0) {
            this.logger.info((0, ptt_log_header_1.getPTTLogHeader)(`Errors found in "${this.userConfig.selectedConfig}" config`));
            analysisResult.errors.forEach(err => {
                this.logger.error(`[Path To Tarkov Config] ${err}`);
            });
            this.logger.info((0, ptt_log_header_1.getPTTLogHeader)('The following stacktrace is not a bug, please fix your config'));
            throw new Error(`Fatal Error when loading the selected Path To Tarkov config "${this.userConfig.selectedConfig}"`);
        }
    }
    preSptLoad(container) {
        this.container = container;
        this.logger = container.resolve('WinstonLogger');
        const jsonUtil = container.resolve('JsonUtil');
        this.packageJson = (0, utils_1.readJsonFile)(config_1.PACKAGE_JSON_PATH, jsonUtil);
        (0, installation_analysis_1.performPathToTarkovInstallationAnalysis)();
        this.userConfig = (0, config_1.getUserConfig)(jsonUtil);
        this.config = (0, config_1.processConfig)((0, utils_1.readJsonFile)(path_1.default.join(config_1.CONFIGS_DIR, this.userConfig.selectedConfig, config_1.CONFIG_FILENAME), jsonUtil));
        const spawnConfig = (0, config_1.processSpawnConfig)((0, utils_1.readJsonFile)(path_1.default.join(config_1.DO_NOT_DISTRIBUTE_DIR, config_1.SPAWN_CONFIG_FILENAME), jsonUtil), this.config);
        const additionalSpawnConfig = (0, config_1.loadAdditionalPlayerSpawnpoints)(path_1.default.join(config_1.CONFIGS_DIR, this.userConfig.selectedConfig, config_1.ADDITIONAL_PLAYER_SPAWNPOINTS_FILENAME), jsonUtil);
        this.spawnConfig = (0, config_1.mergeAdditionalSpawnpoints)(spawnConfig, additionalSpawnConfig);
        this.debug = (data) => this.logger.debug(`Path To Tarkov: ${data}`, true);
        this.logger.info(`===> Loading ${(0, utils_1.getModDisplayName)(this.packageJson, true)}`);
        this.debug(`UserConfig is ${JSON.stringify(this.userConfig, undefined, 2)}`);
        const configServer = container.resolve('ConfigServer');
        const db = container.resolve('DatabaseServer');
        const saveServer = container.resolve('SaveServer');
        const staticRouter = container.resolve('StaticRouterModService');
        const eventWatcher = new event_watcher_1.EventWatcher(this, saveServer);
        const endOfRaidController = new end_of_raid_controller_1.EndOfRaidController(this);
        const getRaidCache = eventWatcher.getRaidCache.bind(eventWatcher);
        this.pathToTarkovController = new path_to_tarkov_controller_1.PathToTarkovController(this.config, this.spawnConfig, this.userConfig, this.packageJson, new TradersAvailabilityService_1.TradersAvailabilityService(), container, db, saveServer, configServer, getRaidCache, this.logger, this.debug);
        if (this.userConfig.runUninstallProcedure) {
            // We register the version route here to let the client know when ptt is uninstalled
            (0, version_1.registerVersionRoute)(staticRouter, {
                uninstalled: true,
                fullVersion: this.packageJson.version,
            });
            return;
        }
        this.pathToTarkovController.init();
        this.runStaticAnalysis();
        eventWatcher.onEndOfRaid(payload => endOfRaidController.end(payload));
        eventWatcher.register((0, helpers_1.createStaticRoutePeeker)(staticRouter), container);
        (0, routes_1.registerCustomRoutes)(staticRouter, this.pathToTarkovController);
        if (this.userConfig.gameplay.tradersAccessRestriction) {
            (0, fix_repeatable_quests_1.fixRepeatableQuests)(container);
            this.debug('Apply fix for unavailable repeatable quests (due to locked traders)');
        }
    }
    postDBLoad(container) {
        if (this.userConfig.runUninstallProcedure) {
            return;
        }
        // Early modification of RagFair settings to ensure they take effect
        this.pathToTarkovController.setEarlyRagFairConfig();
        this.pathToTarkovController.debugExfiltrationsTooltips(this.config);
    }
    postSptLoad(container) {
        this.container = container;
        const db = container.resolve('DatabaseServer');
        const saveServer = container.resolve('SaveServer');
        const quests = db.getTables()?.templates?.quests;
        if (!quests) {
            throw new Error('cannot retrieve quests templates from db');
        }
        if (this.userConfig.runUninstallProcedure) {
            this.logger.warning('=> Path To Tarkov is disabled!');
            (0, uninstall_1.purgeProfiles)(this.config, quests, saveServer, this.logger);
            this.logger.success((0, ptt_log_header_1.getPTTLogHeader)('Uninstall done'));
            return;
        }
        const [api, executeOnStartAPICallbacks] = (0, api_1.createPathToTarkovAPI)(this.pathToTarkovController, this.logger);
        if (this.config.enable_legacy_ptt_api) {
            globalThis.PathToTarkovAPI = api;
            this.debug('API enabled');
        }
        else {
            this.debug('API disabled');
        }
        this.executeOnStartAPICallbacks = executeOnStartAPICallbacks;
        this.pathToTarkovController.loaded(this.config);
        this.pathToTarkovController.debugExfiltrationsTooltips(this.config);
        this.logger.success((0, ptt_log_header_1.getPTTLogHeader)(`Successfully loaded ${(0, utils_1.getModDisplayName)(this.packageJson, true)}`));
    }
}
module.exports = { mod: new PathToTarkov() };
