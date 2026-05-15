"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isModLoaded = void 0;
exports.getModLoader = getModLoader;
function getModLoader(container) {
    const modLoader = container.resolve('PreSptModLoader');
    if (!modLoader.imported || typeof modLoader.imported !== 'object') {
        throw new Error("Fatal getModLoader: 'modLoader.imported' object is required");
    }
    return modLoader;
}
const isModLoaded = (modLoader, modId) => {
    const loadedModName = Object.keys(modLoader.imported).find(modName => modLoader.imported[modName].name === modId);
    return Boolean(loadedModName);
};
exports.isModLoaded = isModLoaded;
