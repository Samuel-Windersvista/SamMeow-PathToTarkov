"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPathToTarkovAPI = void 0;
const utils_1 = require("./utils");
const config_analysis_1 = require("./config-analysis");
const warnDeprecationMessage = (methodName) => `PathToTarkovAPI${methodName ? '.' + methodName : ''} is used and can cause several issues`;
// This is deprecated since PTT 5.2.0
const createPathToTarkovAPI = (controller, logger) => {
    let onStartCallbacks = [];
    const executeOnStartAPICallbacks = (sessionId) => {
        onStartCallbacks.forEach(cb => cb(sessionId));
        onStartCallbacks = [];
    };
    const api = {
        onStart: (cb) => {
            logger.warning(warnDeprecationMessage());
            if (!cb) {
                return;
            }
            onStartCallbacks.push(cb);
        },
        getConfig: (sessionId) => {
            logger.warning(warnDeprecationMessage('getConfig'));
            if (!sessionId) {
                throw new Error('PTT api -> no sessionId provided');
            }
            return (0, utils_1.deepClone)(controller.getConfig(sessionId));
        },
        getSpawnConfig: () => {
            logger.warning(warnDeprecationMessage('getSpawnConfig'));
            return (0, utils_1.deepClone)(controller.spawnConfig);
        },
        setConfig: (newConfig, sessionId) => {
            logger.warning(warnDeprecationMessage('setConfig'));
            if (!sessionId) {
                throw new Error('PTT api -> no sessionId provided');
            }
            const result = (0, config_analysis_1.analyzeConfig)(newConfig, controller.spawnConfig);
            if (result.errors.length === 0) {
                controller.setConfig(newConfig, sessionId);
            }
            return result;
        },
        setSpawnConfig: (newSpawnConfig) => {
            logger.warning(warnDeprecationMessage('setSpawnConfig'));
            controller.spawnConfig = newSpawnConfig;
        },
        refresh: (sessionId) => {
            logger.warning(warnDeprecationMessage('refresh'));
            if (!sessionId) {
                throw new Error('PTT api -> no sessionId provided');
            }
            const userConfig = controller.getUserConfig();
            if (userConfig.gameplay.tradersAccessRestriction) {
                controller.tradersController.initTraders(controller.getConfig(sessionId));
            }
            controller.initPlayer(sessionId, false);
        },
    };
    return [api, executeOnStartAPICallbacks];
};
exports.createPathToTarkovAPI = createPathToTarkovAPI;
