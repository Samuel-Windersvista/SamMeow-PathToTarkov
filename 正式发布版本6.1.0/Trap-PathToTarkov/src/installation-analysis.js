"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performPathToTarkovInstallationAnalysis = void 0;
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const utils_1 = require("./utils");
const performPathToTarkovInstallationAnalysis = () => {
    if ((0, utils_1.fileExists)(path_1.default.join(config_1.CONFIGS_DIR, config_1.SPAWN_CONFIG_FILENAME))) {
        throw new Error(`Path To Tarkov Error: the file configs/${config_1.SPAWN_CONFIG_FILENAME} is not supposed to be there, please remove this file or re-install PTT`);
    }
};
exports.performPathToTarkovInstallationAnalysis = performPathToTarkovInstallationAnalysis;
