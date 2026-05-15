"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocaleResolver = void 0;
class LocaleResolver {
    constructor(allLocales) {
        this.localeKeysMapping = {};
        void Object.keys(allLocales).forEach(localeName => {
            const localeValues = {};
            this.localeKeysMapping[localeName] = localeValues;
            void Object.keys(allLocales[localeName]).forEach(localeKey => {
                localeValues[localeKey.toLowerCase()] = localeKey;
            });
        });
    }
    retrieveKey(exfilName, locale) {
        return this.localeKeysMapping?.[locale]?.[exfilName.toLowerCase()] ?? exfilName;
    }
}
exports.LocaleResolver = LocaleResolver;
