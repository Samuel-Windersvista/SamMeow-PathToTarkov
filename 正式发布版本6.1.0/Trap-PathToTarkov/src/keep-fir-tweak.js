"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeepFoundInRaidTweak = void 0;
class KeepFoundInRaidTweak {
    constructor(saveServer) {
        this.saveServer = saveServer;
    }
    setFoundInRaidOnEquipment(sessionId, isPlayerScav) {
        const profile = this.saveServer.getProfile(sessionId);
        const characterData = profile.characters[isPlayerScav ? 'scav' : 'pmc'];
        const inventory = characterData.Inventory;
        const allEquipmentItems = KeepFoundInRaidTweak.getItemsContainedIn(inventory.items, inventory.equipment);
        const nbImpactedItems = KeepFoundInRaidTweak.setSpawnedInSessionOnItems(allEquipmentItems);
        this.saveServer.saveProfile(sessionId);
        return nbImpactedItems;
    }
    static getItemsContainedIn(items, parentId) {
        const resultItems = [];
        items.forEach(item => {
            if (!item._id || !item.parentId) {
                return;
            }
            if (item.parentId === parentId) {
                resultItems.push(item);
                const deeperItems = this.getItemsContainedIn(items, item._id);
                resultItems.push(...deeperItems);
            }
        });
        return resultItems;
    }
    static setSpawnedInSessionOnItems(items) {
        let counter = 0;
        items.forEach(item => {
            if (item.upd) {
                if (!item.upd.SpawnedInSession) {
                    item.upd.SpawnedInSession = true;
                    counter = counter + 1;
                }
            }
            else {
                item.upd = { SpawnedInSession: true };
                counter = counter + 1;
            }
        });
        return counter;
    }
}
exports.KeepFoundInRaidTweak = KeepFoundInRaidTweak;
