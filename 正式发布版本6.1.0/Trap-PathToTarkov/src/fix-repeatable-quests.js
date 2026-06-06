"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixRepeatableQuestsForPmc = exports.fixRepeatableQuests = void 0;
const utils_1 = require("./utils");
const fixRepeatableQuests = (container) => {
    container.afterResolution('RepeatableQuestGenerator', (_t, result) => {
        const repeatableQuestGenerator = Array.isArray(result) ? result[0] : result;
        const originalGenerateRepeatableQuest = repeatableQuestGenerator.generateRepeatableQuest.bind(repeatableQuestGenerator);
        repeatableQuestGenerator.generateRepeatableQuest = (sessionId, pmcLevel, pmcTradersInfo, questTypePool, repeatableConfig) => {
            const clonedPmcTradersInfo = (0, utils_1.deepClone)(pmcTradersInfo);
            // unlock all traders
            // this will avoid crashes with repeatable quests assigned to unknown traders (because locked)
            Object.keys(clonedPmcTradersInfo).forEach(traderId => {
                const traderInfo = clonedPmcTradersInfo[traderId];
                traderInfo.unlocked = true;
            });
            return originalGenerateRepeatableQuest(sessionId, pmcLevel, clonedPmcTradersInfo, questTypePool, repeatableConfig);
        };
    });
};
exports.fixRepeatableQuests = fixRepeatableQuests;
// Repeatable quests without traderId will break the client
const isBrokenRepeatableQuest = (quest) => {
    return !quest.traderId;
};
// this will fix corrupted profiles from previous version (< 5.3.3)
const fixRepeatableQuestsForPmc = (pmc) => {
    let nbQuestsRemoved = 0;
    const questFilterFn = (q) => {
        const isBroken = isBrokenRepeatableQuest(q);
        if (isBroken) {
            nbQuestsRemoved += 1;
            return false;
        }
        return true;
    };
    pmc.RepeatableQuests.forEach(repeatableQuest => {
        repeatableQuest.activeQuests = repeatableQuest.activeQuests.filter(questFilterFn);
        repeatableQuest.inactiveQuests = repeatableQuest.inactiveQuests.filter(questFilterFn);
    });
    return nbQuestsRemoved;
};
exports.fixRepeatableQuestsForPmc = fixRepeatableQuestsForPmc;
