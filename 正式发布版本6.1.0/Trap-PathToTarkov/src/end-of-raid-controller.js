"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EndOfRaidController = void 0;
const map_name_resolver_1 = require("./map-name-resolver");
class EndOfRaidController {
    constructor(ptt) {
        this.ptt = ptt;
    }
    end(payload) {
        const { sessionId, locationName, exitName, newOffraidPosition, isPlayerScav, isTransit } = payload;
        const mapName = (0, map_name_resolver_1.resolveMapNameFromLocation)(locationName);
        if (!mapName) {
            this.ptt.logger.error(`Path To Tarkov Error: cannot resolve map name from location '${locationName}'`);
            return;
        }
        if (isPlayerScav && !this.ptt.pathToTarkovController.isScavMoveOffraidPosition()) {
            this.ptt.debug('end of raid: scav player detected, pmc offraid position not changed');
            return;
        }
        this.ptt.debug(`end of raid: exitName='${exitName}' and currentMapName='${mapName}'`);
        const playerIsDead = !exitName;
        if (playerIsDead) {
            this.ptt.debug('end of raid: player dies');
            this.ptt.pathToTarkovController.onPlayerDies(sessionId);
            return;
        }
        if (newOffraidPosition) {
            this.ptt.pathToTarkovController.onPlayerExtracts({
                sessionId,
                mapName,
                newOffraidPosition,
                isPlayerScav,
            });
            this.ptt.debug(`end of raid: new offraid position ${newOffraidPosition}`);
        }
        else if (isTransit) {
            this.ptt.debug(`end of raid: transit detected`);
        }
        else {
            this.ptt.logger.warning(`end of raid: no offraid position found`);
        }
    }
}
exports.EndOfRaidController = EndOfRaidController;
