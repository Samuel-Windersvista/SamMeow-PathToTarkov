"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCustomRoutes = void 0;
const current_location_data_1 = require("./current-location-data");
const version_1 = require("./version");
const registerCustomRoutes = (staticRouter, pttController) => {
    (0, current_location_data_1.registerCurrentLocationDataRoute)(staticRouter, pttController);
    (0, version_1.registerVersionRoute)(staticRouter, {
        uninstalled: false,
        fullVersion: pttController.getFullVersion(),
    });
};
exports.registerCustomRoutes = registerCustomRoutes;
