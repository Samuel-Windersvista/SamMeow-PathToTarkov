"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPTTLogHeader = void 0;
const WIDTH = 120;
const getPTTLogHeader = (message) => {
    const fullMessage = `Path To Tarkov: ${message}`;
    return `\
${'='.repeat(WIDTH)}
==== ${fullMessage}
${'='.repeat(WIDTH)}`;
};
exports.getPTTLogHeader = getPTTLogHeader;
