"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExfilsTooltipsTemplater = void 0;
const exfils_targets_1 = require("../exfils-targets");
const config_1 = require("../config");
const utils_1 = require("../utils");
const LocaleResolver_1 = require("./LocaleResolver");
const helpers_1 = require("../helpers");
const EXFIL_DISPLAY_NAME_VARIABLE = '$exfilDisplayName';
const OFFRAID_POSITION_DISPLAY_NAME_VARIABLE = '$offraidPositionDisplayName';
class ExfilsTooltipsTemplater {
    constructor(allLocales) {
        this.snapshotLocales = (0, utils_1.deepClone)(allLocales);
        this.localeResolver = new LocaleResolver_1.LocaleResolver(allLocales);
    }
    computeLocales(config) {
        const result = {};
        Object.keys(this.snapshotLocales).forEach(locale => {
            const localeValues = {};
            result[locale] = localeValues;
            Object.keys(config.exfiltrations).forEach(mapName => {
                const exfils = config.exfiltrations[mapName];
                Object.keys(exfils).forEach(exfilName => {
                    const exfilTargets = exfils[exfilName] ?? [];
                    const foundTargetOffraidPosition = exfilTargets
                        .map(exfilTarget => {
                        // here we need to parse in order to make sure we get an offraidPosition and not a transit notation
                        const parsed = (0, exfils_targets_1.parseExilTargetFromPTTConfig)(exfilTarget);
                        return parsed.targetOffraidPosition;
                    })
                        .find(Boolean) ?? ''; // offraid position is empty when only transits are used
                    const localeName = locale;
                    const localeKey = this.localeResolver.retrieveKey(exfilName, localeName);
                    const computeParams = {
                        locale: localeName,
                        localeKey,
                        exfilName,
                        mapName: mapName,
                        offraidPosition: foundTargetOffraidPosition,
                    };
                    const computedLocaleValue = this.computeLocaleValue(config, computeParams);
                    // Warning: there is some duplicated locales because BSG ("EXFIL_Train" and "RUAF Roadblock")
                    // override vanilla locales (still used for Dynamic Maps integration)
                    localeValues[localeKey] = computedLocaleValue;
                    // unique exfil locales by map (re-used by the client)
                    const customLocaleKey = `PTT_EXTRACT_${mapName}.${exfilName}`;
                    localeValues[customLocaleKey] = computedLocaleValue;
                });
            });
        });
        return result;
    }
    debugTooltipsForLocale(locale, config) {
        const partialLocales = this.computeLocales(config);
        const mergedLocales = config_1.AVAILABLE_LOCALES.reduce((locales, locale) => {
            locales[locale] = {};
            return locales;
        }, {});
        void (0, helpers_1.mutateLocales)(mergedLocales, partialLocales);
        const localeValues = mergedLocales[locale] ?? {};
        const result = {};
        Object.keys(mergedLocales[locale] ?? {}).forEach(localeKey => {
            if (localeKey.startsWith('PTT_')) {
                result[localeKey] = localeValues[localeKey];
            }
        });
        return result;
    }
    computeLocaleValue(config, params) {
        const exfilVanillaDisplayName = this.snapshotLocales[params.locale]?.[params.localeKey];
        const exfilDisplayName = ExfilsTooltipsTemplater.resolveExfilDisplayName(config, params) ??
            exfilVanillaDisplayName ??
            ExfilsTooltipsTemplater.ERROR_NO_EXFIL;
        const offraidPositionDisplayName = ExfilsTooltipsTemplater.resolveOffraidPositionDisplayName(config, params);
        const tooltipsTemplate = ExfilsTooltipsTemplater.resolveTooltipsTemplate(config, params);
        const templatedValue = tooltipsTemplate
            .replace(EXFIL_DISPLAY_NAME_VARIABLE, exfilDisplayName)
            .replace(OFFRAID_POSITION_DISPLAY_NAME_VARIABLE, offraidPositionDisplayName);
        return templatedValue;
    }
    static resolveExfilDisplayName(config, { exfilName, mapName, locale }) {
        const exfilConfig = config.exfiltrations_config?.[mapName]?.[exfilName];
        const resolvedDisplayName = ExfilsTooltipsTemplater.resolveDisplayName(locale, exfilConfig?.displayName);
        return resolvedDisplayName;
    }
    static resolveOffraidPositionDisplayName(config, { offraidPosition, locale }) {
        const offraidPositionDefinition = config.offraid_positions?.[offraidPosition];
        const resolvedDisplayName = ExfilsTooltipsTemplater.resolveDisplayName(locale, offraidPositionDefinition?.displayName);
        if (resolvedDisplayName) {
            return resolvedDisplayName;
        }
        return offraidPosition;
    }
    static resolveTooltipsTemplate(config, { exfilName, mapName }) {
        const exfilConfig = config.exfiltrations_config?.[mapName]?.[exfilName];
        if (exfilConfig?.override_tooltips_template?.trim()) {
            return exfilConfig.override_tooltips_template;
        }
        if (config.exfiltrations_tooltips_template?.trim()) {
            return config.exfiltrations_tooltips_template;
        }
        // by default, the tooltips template is the name of the exfil itself
        return EXFIL_DISPLAY_NAME_VARIABLE;
    }
}
exports.ExfilsTooltipsTemplater = ExfilsTooltipsTemplater;
ExfilsTooltipsTemplater.ERROR_NO_EXFIL = 'PTT_ERROR_EXFIL_LOCALE_NOT_FOUND';
ExfilsTooltipsTemplater.resolveDisplayName = (locale, displayName) => {
    if (!displayName) {
        return undefined;
    }
    return displayName[locale] ?? displayName[config_1.DEFAULT_FALLBACK_LANGUAGE];
};
