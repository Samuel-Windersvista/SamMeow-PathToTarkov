"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeProfiles = void 0;
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const TradersAvailabilityService_1 = require("./services/TradersAvailabilityService");
const restoreMainStash = (profile, logger) => {
    const pmcInventory = profile.characters.pmc.Inventory;
    const mainStashId = (0, helpers_1.getMainStashId)(profile);
    if (mainStashId !== pmcInventory.stash) {
        logger.success(`=> PathToTarkov: restore the selected stash to main stash for profile '${profile.info.username}'`);
        pmcInventory.stash = mainStashId;
    }
};
const restoreTraders = (config, tradersAvailabilityService, profile, logger) => {
    let nbTradersLocked = 0;
    let nbTradersUnlocked = 0;
    Object.keys(config.traders_config).forEach(traderId => {
        const pmc = profile.characters.pmc;
        const trader = pmc.TradersInfo?.[traderId];
        if (!trader) {
            return;
        }
        const unlocked = tradersAvailabilityService.isAvailable(traderId, pmc.Quests);
        if (trader.unlocked && !unlocked) {
            nbTradersLocked += 1;
        }
        else if (!trader.unlocked && unlocked) {
            nbTradersUnlocked += 1;
        }
        trader.unlocked = unlocked;
    });
    if (nbTradersLocked > 0) {
        logger.success(`=> PathToTarkov: ${nbTradersLocked} trader${nbTradersLocked === 1 ? '' : 's'} locked for profile '${profile.info.username}'`);
    }
    if (nbTradersUnlocked > 0) {
        logger.success(`=> PathToTarkov: ${nbTradersUnlocked} trader${nbTradersUnlocked === 1 ? '' : 's'} unlocked for profile '${profile.info.username}'`);
    }
};
// Used for uninstall process
const purgeProfiles = (config, quests, saveServer, logger) => {
    // because we want to be sure to be able to read `SaveServer.profiles`
    saveServer.load();
    const tradersAvailabilityService = new TradersAvailabilityService_1.TradersAvailabilityService().init(quests);
    Object.keys(saveServer.getProfiles()).forEach(sessionId => {
        const profile = saveServer.getProfile(sessionId);
        const mainStashId = (0, helpers_1.getMainStashId)(profile);
        restoreMainStash(profile, logger);
        restoreTraders(config, tradersAvailabilityService, profile, logger);
        (0, helpers_1.setInventorySlotIds)(profile, mainStashId, [config_1.ROAMING_EMERGENCY_STASH, ...config.hideout_secondary_stashes]);
    });
    saveServer.save();
};
exports.purgeProfiles = purgeProfiles;
