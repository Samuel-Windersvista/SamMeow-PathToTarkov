"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCurrentLocationDataRoute = void 0;
const exfils_targets_1 = require("../exfils-targets");
const map_name_resolver_1 = require("../map-name-resolver");
// Warning: Those should be aligned with the client
const ROUTE_NAME = 'CurrentLocationData';
const FULL_ROUTE_NAME = `/PathToTarkov/${ROUTE_NAME}`;
const registerCurrentLocationDataRoute = (staticRouter, pttController) => {
    staticRouter.registerStaticRouter(`Trap-PathToTarkov-${ROUTE_NAME}`, [
        {
            url: FULL_ROUTE_NAME,
            action: async (_url, info, sessionId) => {
                pttController.debug(`${FULL_ROUTE_NAME} called for location "${info.locationId}"`);
                const config = pttController.getConfig(sessionId);
                const mapName = (0, map_name_resolver_1.resolveMapNameFromLocation)(info.locationId);
                const locations = pttController.db.getTables().locations;
                if (!locations) {
                    throw new Error('Locations table not available');
                }
                const locationKey = info.locationId.toLowerCase();
                const location = locations[locationKey];
                if (!location || !('base' in location) || !location.base) {
                    throw new Error(`Location "${info.locationId}" not found or has no base data`);
                }
                const locationBase = location.base;
                const response = {
                    exfilsTargets: (0, exfils_targets_1.getExfilsTargets)(pttController, config, mapName, locationBase),
                };
                return JSON.stringify(response);
            },
        },
    ], '');
};
exports.registerCurrentLocationDataRoute = registerCurrentLocationDataRoute;
