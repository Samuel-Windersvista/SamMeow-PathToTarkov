"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPTTMongoId = exports.MONGO_ID_PTT_PREFIX = exports.isValidMongoId = exports.isNotUndefined = exports.ensureArray = exports.isHexaChar = exports.isDigitChar = exports.isLowerLetterChar = exports.isLetterChar = exports.isEmptyArray = exports.isEmpty = exports.getModDisplayName = exports.writeJsonFile = exports.readJsonFile = exports.fileExists = void 0;
exports.deepClone = deepClone;
exports.shuffle = shuffle;
exports.noop = noop;
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const fileExists = (path) => {
    return (0, fs_1.existsSync)(path);
};
exports.fileExists = fileExists;
const readJsonFile = (path, jsonUtil) => {
    if (!(0, fs_1.existsSync)(path)) {
        throw new Error(`Path To Tarkov cannot read json file "${path}"`);
    }
    const parsedResult = jsonUtil.deserializeJson5((0, fs_1.readFileSync)(path, 'utf-8'));
    if (!parsedResult) {
        throw new Error(`Path To Tarkov cannot parse json5 file "${path}"`);
    }
    return parsedResult;
};
exports.readJsonFile = readJsonFile;
const writeJsonFile = (path, jsonUtil, x) => {
    const str = jsonUtil.serialize(x, true);
    return (0, fs_1.writeFileSync)(path, str, 'utf-8');
};
exports.writeJsonFile = writeJsonFile;
const getModDisplayName = (packageJson, withVersion = false) => {
    if (withVersion) {
        return `${packageJson.displayName} v${packageJson.version}`;
    }
    return `${packageJson.displayName}`;
};
exports.getModDisplayName = getModDisplayName;
// stackoverflow deep clone
function deepClone(item) {
    if (!item) {
        return item;
    } // null, undefined values check
    const types = [Number, String, Boolean];
    let result;
    // normalizing primitives if someone did new String('aaa'), or new Number('444');
    types.forEach(function (type) {
        if (item instanceof type) {
            result = type(item);
        }
    });
    if (typeof result == 'undefined') {
        if (Object.prototype.toString.call(item) === '[object Array]') {
            result = [];
            item.forEach(function (child, index) {
                result[index] = deepClone(child);
            });
        }
        else if (typeof item == 'object') {
            if (item && !item.prototype) {
                // check that this is a literal
                if (item instanceof Date) {
                    result = new Date(item);
                }
                else {
                    // it is an object literal
                    result = {};
                    for (const i in item) {
                        result[i] = deepClone(item[i]);
                    }
                }
            }
            else {
                // just keep the reference
                result = item;
                // depending what you would like here,
            }
        }
        else {
            result = item;
        }
    }
    return result;
}
function shuffle(givenArray) {
    const array = [...givenArray];
    let currentIndex = array.length, randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}
// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() { }
const isEmpty = (obj) => {
    return Object.keys(obj).length === 0;
};
exports.isEmpty = isEmpty;
const isEmptyArray = (arr) => {
    return Boolean(arr && arr.length === 0);
};
exports.isEmptyArray = isEmptyArray;
const isLetterChar = (char) => {
    return char.length === 1 && char.toUpperCase() !== char.toLowerCase();
};
exports.isLetterChar = isLetterChar;
const isLowerLetterChar = (char) => {
    return (0, exports.isLetterChar)(char) && char.toLowerCase() === char;
};
exports.isLowerLetterChar = isLowerLetterChar;
const isDigitChar = (char) => {
    return char.length === 1 && char >= '0' && char <= '9';
};
exports.isDigitChar = isDigitChar;
const isHexaChar = (char) => {
    return (0, exports.isDigitChar)(char) || (char.length === 1 && char >= 'a' && char <= 'f');
};
exports.isHexaChar = isHexaChar;
const ensureArray = (x) => {
    if (Array.isArray(x)) {
        return x;
    }
    return [x];
};
exports.ensureArray = ensureArray;
const isNotUndefined = (x) => {
    return x !== undefined;
};
exports.isNotUndefined = isNotUndefined;
/**
 * Mongo Ids
 */
const MONGO_ID_LENGTH = 24;
const isValidMongoId = (id) => {
    if (id.length !== MONGO_ID_LENGTH) {
        return false;
    }
    for (const char of id) {
        const isValidChar = (0, exports.isHexaChar)(char);
        if (!isValidChar) {
            return false;
        }
    }
    return true;
};
exports.isValidMongoId = isValidMongoId;
const sha1 = (data) => {
    const hash = (0, crypto_1.createHash)('sha1');
    hash.update(data);
    return hash.digest('hex');
};
exports.MONGO_ID_PTT_PREFIX = 'deadbeef';
/**
 * This function is used to generate predictable mongo ids
 * a "deadbeef" prefix is added to help debugging profiles
 */
const getPTTMongoId = (data) => {
    const stripLength = MONGO_ID_LENGTH - exports.MONGO_ID_PTT_PREFIX.length;
    const strippedHash = sha1(data).substring(0, stripLength);
    return exports.MONGO_ID_PTT_PREFIX + strippedHash;
};
exports.getPTTMongoId = getPTTMongoId;
