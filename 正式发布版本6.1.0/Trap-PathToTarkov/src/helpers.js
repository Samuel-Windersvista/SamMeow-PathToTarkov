"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveMainStashIdFromItems = exports.setInventorySlotIds = exports.getMainStashId = exports.createStaticRoutePeeker = exports.isIgnoredArea = exports.disableRunThrough = exports.changeRestrictionsInRaid = exports.createExitPoint = exports.createSpawnPoint = exports.rejectPlayerCategory = exports.isPlayerSpawnPoint = exports.PTT_INFILTRATION = exports.isWildcardAccessVia = void 0;
exports.checkAccessVia = checkAccessVia;
exports.mutateLocales = mutateLocales;
const config_1 = require("./config");
const isWildcardAccessVia = (access_via) => access_via === '*' || access_via[0] === '*';
exports.isWildcardAccessVia = isWildcardAccessVia;
function checkAccessVia(access_via, value) {
    return (0, exports.isWildcardAccessVia)(access_via) || access_via.includes(value);
}
const getPosition = (pos) => {
    // work with Lua-CustomSpawnPointPointMaker format
    if (Array.isArray(pos)) {
        const [x, y, z] = pos;
        return { x, y, z };
    }
    return pos;
};
// Note: this value will be lower-cased by the client (especially in `EligibleEntryPoints` exfil client property)
exports.PTT_INFILTRATION = 'ptt_infiltration';
const isPlayerSpawnPoint = (spawnPoint) => {
    return Boolean(spawnPoint.Categories.find(cat => cat === 'Player'));
};
exports.isPlayerSpawnPoint = isPlayerSpawnPoint;
const rejectPlayerCategory = (spawn) => {
    return {
        ...spawn,
        Categories: spawn.Categories.filter(cat => cat !== 'Player'),
    };
};
exports.rejectPlayerCategory = rejectPlayerCategory;
const createSpawnPoint = (pos, rot, spawnId) => {
    return {
        Id: spawnId,
        Position: getPosition(pos),
        Rotation: rot || 0.0,
        Sides: ['All'],
        Categories: ['Player'],
        Infiltration: exports.PTT_INFILTRATION,
        DelayToCanSpawnSec: 3,
        ColliderParams: {
            _parent: 'SpawnSphereParams',
            _props: {
                Center: {
                    x: 0,
                    y: 0,
                    z: 0,
                },
                Radius: 0.0,
            },
        },
        CorePointId: 0,
        BotZoneName: '',
    };
};
exports.createSpawnPoint = createSpawnPoint;
// TODO: default_exfiltration_time_seconds field in config ?
const DEFAULT_EXFILTRATION_TIME_IN_SECONDS = 30;
const getDefaultExitProps = () => ({
    Id: '',
    PassageRequirement: 'None',
    ExfiltrationType: 'Individual',
    RequirementTip: '',
    Count: 0,
    MinTime: 0,
    MaxTime: 0,
    PlayersCount: 0,
    Chance: 100,
    ExfiltrationTime: DEFAULT_EXFILTRATION_TIME_IN_SECONDS,
});
const getExitProps = (originalExit) => {
    const newExitProps = getDefaultExitProps();
    if (!originalExit) {
        return newExitProps;
    }
    if (originalExit.PassageRequirement === 'WorldEvent') {
        newExitProps.PassageRequirement = originalExit.PassageRequirement;
        newExitProps.ExfiltrationType = originalExit.ExfiltrationType;
        newExitProps.RequirementTip = originalExit.RequirementTip;
    }
    else if (originalExit.PassageRequirement === 'Train') {
        newExitProps.PassageRequirement = originalExit.PassageRequirement;
        newExitProps.ExfiltrationType = originalExit.ExfiltrationType;
        newExitProps.RequirementTip = originalExit.RequirementTip;
        newExitProps.Id = originalExit.Id;
        newExitProps.Count = originalExit.Count;
        newExitProps.MinTime = originalExit.MinTime;
        newExitProps.MaxTime = originalExit.MaxTime;
    }
    return newExitProps;
};
const createExitPoint = (name, originalExit) => {
    const { Id, Count, MinTime, MaxTime, ExfiltrationType, PassageRequirement, RequirementTip, PlayersCount, Chance, ExfiltrationTime, } = getExitProps(originalExit);
    return {
        Id,
        Name: name,
        EntryPoints: exports.PTT_INFILTRATION,
        Chance,
        Count,
        MinTime,
        MaxTime,
        ExfiltrationTime,
        PlayersCount,
        ExfiltrationType,
        PassageRequirement,
        RequirementTip,
        EventAvailable: false,
        ChancePVE: Chance,
        CountPVE: Count,
        ExfiltrationTimePVE: ExfiltrationTime,
        MinTimePVE: MinTime,
        MaxTimePVE: MaxTime,
        PlayersCountPVE: PlayersCount,
    };
};
exports.createExitPoint = createExitPoint;
const changeRestrictionsInRaid = (config, db) => {
    const globals = db.getTables().globals;
    const restrictionsConfig = config.restrictions_in_raid || {};
    globals?.config.RestrictionsInRaid.forEach(payload => {
        if (restrictionsConfig[payload.TemplateId]) {
            payload.MaxInRaid = restrictionsConfig[payload.TemplateId].Value;
            payload.MaxInLobby = Math.max(payload.MaxInRaid, payload.MaxInLobby);
        }
    });
};
exports.changeRestrictionsInRaid = changeRestrictionsInRaid;
const disableRunThrough = (db) => {
    const database = db.getTables();
    if (!database.globals) {
        throw new Error('Unable to retrive globals settings in db');
    }
    const runThroughDB = database.globals.config.exp.match_end;
    runThroughDB.survived_exp_requirement = 0;
    runThroughDB.survived_seconds_requirement = 0;
};
exports.disableRunThrough = disableRunThrough;
// more infos on areas here: https://hub.sp-tarkov.com/doc/entry/4-resources-hideout-areas-ids/
const isIgnoredArea = (area) => {
    if (typeof area.type !== 'number') {
        // invalid area
        return true;
    }
    if (area.type === 4) {
        // generator (prevent a crash at start)
        return true;
    }
    else if (area.type === 6) {
        // water collector (prevent infinite loading menu at start)
        return true;
    }
    else if (area.type === 10) {
        // workbench
        return true;
    }
    else if (area.type === 16) {
        // place of fame
        return true;
    }
    else if (area.type === 17) {
        // air filtering unit (prevent a crash at start)
        return true;
    }
    else if (area.type === 21) {
        // christmas tree
        return true;
    }
    else if (area.type === 27) {
        // circle of cultist
        return true;
    }
    return false;
};
exports.isIgnoredArea = isIgnoredArea;
const createStaticRoutePeeker = (staticRouter) => {
    const routeActions = [];
    const watchRoute = (url, cb) => {
        routeActions.push({
            url,
            action: async (url, info, sessionId, output) => {
                cb(url, info, sessionId, output);
                return output;
            },
        });
    };
    const register = (name = 'Trap-PathToTarkov-StaticRoutePeeking') => {
        staticRouter.registerStaticRouter(name, routeActions, 'spt');
    };
    return {
        register,
        watchRoute,
    };
};
exports.createStaticRoutePeeker = createStaticRoutePeeker;
const getMainStashId = (profile) => {
    return profile.PathToTarkov?.mainStashId ?? profile.characters.pmc.Inventory.stash;
};
exports.getMainStashId = getMainStashId;
const getAllStashByIds = (profile, stashConfigs) => {
    const initialAcc = { [(0, exports.getMainStashId)(profile)]: true };
    return stashConfigs.reduce((acc, stashConfig) => {
        return {
            ...acc,
            [stashConfig.mongoId]: true,
        };
    }, initialAcc);
};
const setInventorySlotIds = (profile, stashId, stashConfigs) => {
    const inventory = profile.characters.pmc.Inventory;
    const secondaryStashes = [config_1.EMPTY_STASH, ...stashConfigs];
    const stashByIds = getAllStashByIds(profile, secondaryStashes);
    inventory.items.forEach(item => {
        if (item.slotId === config_1.SLOT_ID_HIDEOUT || item.slotId === config_1.SLOT_ID_LOCKED_STASH) {
            if (item.parentId === stashId) {
                item.slotId = config_1.SLOT_ID_HIDEOUT;
            }
            else if (stashByIds[item.parentId ?? '']) {
                item.slotId = config_1.SLOT_ID_LOCKED_STASH;
            }
        }
    });
};
exports.setInventorySlotIds = setInventorySlotIds;
const isStashLink = (item) => {
    return (Boolean(item._id) &&
        Boolean(item._tpl) &&
        Object.keys(item).length === 2 &&
        config_1.VANILLA_STASH_IDS.includes(item._tpl));
};
const isPTTMongoId = (id, stashes) => {
    const foundId = stashes.find(stash => {
        return id === stash.mongoId || id === stash.mongoTemplateId || id === stash.mongoGridId;
    });
    return Boolean(foundId);
};
const retrieveMainStashIdFromItems = (items, stashes) => {
    for (const item of items) {
        if (isStashLink(item) && !isPTTMongoId(item._id, stashes)) {
            return item._id;
        }
    }
    return null;
};
exports.retrieveMainStashIdFromItems = retrieveMainStashIdFromItems;
function mutateLocales(allLocales, partialLocales) {
    const report = {
        nbLocalesImpacted: 0,
        nbTotalValuesUpdated: 0,
    };
    void Object.keys(allLocales).forEach(localeName => {
        if (partialLocales[localeName]) {
            const values = allLocales[localeName];
            const newValues = partialLocales[localeName] ?? {};
            const nbNewValues = Object.keys(newValues).length;
            if (nbNewValues > 0) {
                void Object.assign(values, newValues); // mutation here
                report.nbLocalesImpacted += 1;
                report.nbTotalValuesUpdated += nbNewValues;
            }
        }
    });
    return report;
}
