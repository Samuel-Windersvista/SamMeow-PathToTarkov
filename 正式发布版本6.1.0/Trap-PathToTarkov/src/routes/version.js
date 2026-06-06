"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVersionRoute = void 0;
// Warning: This should be aligned with the client
const ROUTE_NAME = 'Version';
const FULL_ROUTE_NAME = `/PathToTarkov/${ROUTE_NAME}`;
const registerVersionRoute = (staticRouter, { uninstalled, fullVersion }) => {
    staticRouter.registerStaticRouter(`Trap-PathToTarkov-${ROUTE_NAME}`, [
        {
            url: FULL_ROUTE_NAME,
            action: async (_url, _info, _sessionId) => {
                const response = {
                    fullVersion,
                    uninstalled,
                };
                return JSON.stringify(response);
            },
        },
    ], '');
};
exports.registerVersionRoute = registerVersionRoute;
