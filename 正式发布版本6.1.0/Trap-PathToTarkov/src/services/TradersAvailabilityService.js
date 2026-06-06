"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradersAvailabilityService = void 0;
const utils_1 = require("../utils");
const QUEST_STATUS_SUCCESS = 4;
class TradersAvailabilityService {
    constructor() {
        this.tradersLockedByQuests = null;
    }
    init(quests) {
        const tradersLockedByQuests = {};
        Object.keys(quests).forEach(questId => {
            tradersLockedByQuests[questId] = {};
            const rewards = quests[questId].rewards.Success ?? [];
            rewards.forEach(reward => {
                if (reward.type === 'TraderUnlock' && reward.target) {
                    if (!tradersLockedByQuests[reward.target]) {
                        tradersLockedByQuests[reward.target] = {};
                    }
                    tradersLockedByQuests[reward.target][questId] = true;
                }
            });
        });
        this.tradersLockedByQuests = tradersLockedByQuests;
        return this;
    }
    isAvailable(traderId, pmcQuests) {
        if (this.tradersLockedByQuests === null) {
            throw new Error('TraderAvailabilityService is not initialized');
        }
        const unlockQuests = this.tradersLockedByQuests[traderId];
        if (!unlockQuests || (0, utils_1.isEmpty)(unlockQuests)) {
            return true;
        }
        const completedQuest = pmcQuests.find(q => q.status === QUEST_STATUS_SUCCESS && unlockQuests[q.qid]);
        return Boolean(completedQuest);
    }
}
exports.TradersAvailabilityService = TradersAvailabilityService;
