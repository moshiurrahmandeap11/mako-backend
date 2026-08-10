"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    info: (...args) => console.log(`[INFO] [${new Date().toISOString()}]`, ...args),
    warn: (...args) => console.warn(`[WARN] [${new Date().toISOString()}]`, ...args),
    error: (...args) => console.error(`[ERROR] [${new Date().toISOString()}]`, ...args),
    debug: (...args) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEBUG] [${new Date().toISOString()}]`, ...args);
        }
    },
};
