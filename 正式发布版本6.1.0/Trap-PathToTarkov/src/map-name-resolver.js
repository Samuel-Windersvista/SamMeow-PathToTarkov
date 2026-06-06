"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLocationIdFromMapName = exports.isSameMap = exports.resolveMapNameFromLocation = void 0;
// MapName indexed by lower-cased possible location ids
const LOCATIONS_MAPS = {
    customs: 'bigmap',
    factory: 'factory4_day',
    reservebase: 'rezervbase',
    interchange: 'interchange',
    woods: 'woods',
    lighthouse: 'lighthouse',
    shoreline: 'shoreline',
    laboratory: 'laboratory',
    lab: 'laboratory',
    ['streets of tarkov']: 'tarkovstreets',
    groundzero: 'sandbox',
};
const resolveMapNameFromLocation = (location) => {
    const locationName = location.toLowerCase();
    const mapName = LOCATIONS_MAPS[locationName];
    return mapName ?? locationName;
};
exports.resolveMapNameFromLocation = resolveMapNameFromLocation;
/**
 * Replace `factory4_night` by `factory_day`
 * Replace `sandbox_high` by `sandbox`
 */
const ensureNoSpecialMaps = (locationId) => {
    if (locationId === 'factory4_night') {
        return 'factory4_day';
    }
    if (locationId === 'sandbox_high') {
        return 'sandbox';
    }
    return locationId;
};
/**
 * Check that 2 locations are the same.
 *
 * Please note that `factory4_day` and `factory4_night` are considered as same map here.
 * There is also `sandbox` and `sandbox_high` (obviously)
 */
const isSameMap = (locationA, locationB) => {
    const resolvedLocationA = ensureNoSpecialMaps((0, exports.resolveMapNameFromLocation)(locationA));
    const resolvedLocationB = ensureNoSpecialMaps((0, exports.resolveMapNameFromLocation)(locationB));
    return resolvedLocationA === resolvedLocationB;
};
exports.isSameMap = isSameMap;
const LOCATION_IDS = {
    customs: 'bigmap',
    factory: 'factory4_day',
    factory4: 'factory4_day',
    reservebase: 'RezervBase',
    rezervbase: 'RezervBase',
    interchange: 'Interchange',
    woods: 'Woods',
    lighthouse: 'Lighthouse',
    shoreline: 'Shoreline',
    lab: 'laboratory',
    ['streets of tarkov']: 'TarkovStreets',
    tarkovstreets: 'TarkovStreets',
    streets: 'TarkovStreets',
    sandbox: 'Sandbox',
    sandbox_high: 'Sandbox_high',
    groundzero: 'Sandbox',
    terminal: 'Terminal',
};
const resolveLocationIdFromMapName = (givenMapName) => {
    const mapName = givenMapName.toLowerCase();
    const locationId = LOCATION_IDS[mapName];
    return locationId ?? mapName;
};
exports.resolveLocationIdFromMapName = resolveLocationIdFromMapName;
