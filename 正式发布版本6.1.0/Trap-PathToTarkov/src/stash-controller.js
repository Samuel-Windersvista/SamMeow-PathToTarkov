"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StashController = void 0;
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const utils_1 = require("./utils");
const { ROAMING_EMERGENCY_STASH } = config_1;
class StashController {
    constructor(getConfig, userConfig, db, saveServer, debug) {
        this.getConfig = getConfig;
        this.userConfig = userConfig;
        this.db = db;
        this.saveServer = saveServer;
        this.debug = debug;
    }
    initSecondaryStashTemplates(givenStashConfigs) {
        const stashConfigs = [config_1.EMPTY_STASH, config_1.ROAMING_EMERGENCY_STASH, ...givenStashConfigs];
        const standardTemplate = this.db.getTables()?.templates?.items[config_1.STANDARD_STASH_ID];
        if (!standardTemplate) {
            throw new Error('Path To Tarkov: standard stash template not found');
        }
        let nbAddedTemplates = 0;
        stashConfigs.forEach(({ name, mongoTemplateId, mongoGridId, size }) => {
            const newTemplate = (0, utils_1.deepClone)(standardTemplate);
            newTemplate._id = mongoTemplateId;
            newTemplate._name = `${name} of size ${size}`;
            const grid = newTemplate?._props?.Grids?.[0];
            const gridProps = grid?._props;
            if (gridProps) {
                grid._id = mongoGridId;
                grid._parent = mongoTemplateId;
                gridProps.cellsV = size;
            }
            else {
                throw new Error('Path To  Tarkov: cannot set size on custom stash template');
            }
            const items = this.db.getTables()?.templates?.items;
            if (items) {
                items[newTemplate._id] = newTemplate;
                nbAddedTemplates = nbAddedTemplates + 1;
            }
        });
        return nbAddedTemplates;
    }
    initProfile(sessionId) {
        const profile = this.saveServer.getProfile(sessionId);
        const pmc = profile.characters.pmc;
        if (!profile.PathToTarkov) {
            profile.PathToTarkov = {};
        }
        const initialMainStashId = profile.PathToTarkov.mainStashId;
        if (!initialMainStashId) {
            const allStashConfigs = [config_1.EMPTY_STASH, config_1.ROAMING_EMERGENCY_STASH, ...this.getConfig(sessionId).hideout_secondary_stashes];
            const mainStashId = (0, helpers_1.retrieveMainStashIdFromItems)(pmc.Inventory.items, allStashConfigs);
            profile.PathToTarkov.mainStashId = mainStashId ?? pmc.Inventory.stash;
        }
    }
    setMainStash(profile) {
        const mainStashId = (0, helpers_1.getMainStashId)(profile);
        const inventory = profile.characters.pmc.Inventory;
        inventory.stash = mainStashId;
    }
    setSecondaryStash(stash, profile) {
        const stashId = stash.mongoId;
        const templateId = stash.mongoTemplateId;
        const inventory = profile.characters.pmc.Inventory;
        inventory.stash = stashId;
        if (!inventory.items.find(item => item._id === stashId && item._tpl === templateId)) {
            inventory.items.push({ _id: stashId, _tpl: templateId });
        }
    }
    getMainStashAccessVia(sessionId) {
        const defaultMainStashAccessVia = this.getConfig(sessionId).hideout_main_stash_access_via;
        const profile = this.saveServer.getProfile(sessionId);
        const profileTemplateId = profile.info.edition;
        const overrideByProfiles = this.getConfig(sessionId).override_by_profiles?.[profileTemplateId];
        return overrideByProfiles?.hideout_main_stash_access_via ?? defaultMainStashAccessVia;
    }
    getMainStashAvailable(offraidPosition, sessionId) {
        const multiStashEnabled = this.userConfig.gameplay.multistash;
        if (!multiStashEnabled) {
            return true;
        }
        const mainStashAccessVia = this.getMainStashAccessVia(sessionId);
        return (0, helpers_1.checkAccessVia)(mainStashAccessVia, offraidPosition);
    }
    getSecondaryStash(offraidPosition, sessionId) {
        return (this.getConfig(sessionId).hideout_secondary_stashes.find(stash => (0, helpers_1.checkAccessVia)(stash.access_via, offraidPosition)) ?? config_1.ROAMING_EMERGENCY_STASH);
    }
    updateStash(offraidPosition, sessionId) {
        const mainStashAvailable = this.getMainStashAvailable(offraidPosition, sessionId);
        const secondaryStash = this.getSecondaryStash(offraidPosition, sessionId);
        const profile = this.saveServer.getProfile(sessionId);
        if (mainStashAvailable) {
            this.setMainStash(profile);
        }
        else {
            this.setSecondaryStash(secondaryStash, profile);
        }
        const inventory = profile.characters.pmc.Inventory;
        const stashId = inventory.stash;
        const secondaryStashes = [config_1.ROAMING_EMERGENCY_STASH, ...this.getConfig(sessionId).hideout_secondary_stashes];
        (0, helpers_1.setInventorySlotIds)(profile, stashId, secondaryStashes);
    }
    getStashSize(offraidPosition, sessionId) {
        const mainStashAvailable = this.getMainStashAvailable(offraidPosition, sessionId);
        const secondaryStash = this.getSecondaryStash(offraidPosition, sessionId);
        if (mainStashAvailable) {
            return null;
        }
        return secondaryStash.size;
    }
    getHideoutEnabled(offraidPosition, sessionId) {
        return this.getMainStashAvailable(offraidPosition, sessionId);
    }
    shouldUseRoamingEmergencyStash(offraidPosition, sessionId) {
        const mainStashAvailable = this.getMainStashAvailable(offraidPosition, sessionId);
        if (mainStashAvailable) {
            return false;
        }
        const secondaryStash = this.getSecondaryStash(offraidPosition, sessionId);
        return secondaryStash.mongoId === config_1.ROAMING_EMERGENCY_STASH.mongoId;
    }
    isRoamingEmergencyStashActive(sessionId) {
        const profile = this.saveServer.getProfile(sessionId);
        return profile.characters.pmc.Inventory.stash === config_1.ROAMING_EMERGENCY_STASH.mongoId;
    }
    clearRoamingEmergencyStashOnExit(nextOffraidPosition, sessionId) {
        if (!this.isRoamingEmergencyStashActive(sessionId)) {
            return 0;
        }
        if (this.shouldUseRoamingEmergencyStash(nextOffraidPosition, sessionId)) {
            return 0;
        }
        const profile = this.saveServer.getProfile(sessionId);
        const inventory = profile.characters.pmc.Inventory;
        const roamingMongoId = config_1.ROAMING_EMERGENCY_STASH.mongoId;
        const ancestorIds = new Set([roamingMongoId]);
        const idsToRemove = new Set();
        let changed = true;
        while (changed) {
            changed = false;
            for (const item of inventory.items) {
                const parentId = item.parentId;
                if (parentId && ancestorIds.has(parentId) && !ancestorIds.has(item._id)) {
                    ancestorIds.add(item._id);
                    idsToRemove.add(item._id);
                    changed = true;
                }
            }
        }
        let removedCount = 0;
        inventory.items = inventory.items.filter(item => {
            if (idsToRemove.has(item._id)) {
                removedCount = removedCount + 1;
                return false;
            }
            return true;
        });
        return removedCount;
    }
}
exports.StashController = StashController;
