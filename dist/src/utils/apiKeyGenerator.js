"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApiKey = generateApiKey;
exports.hashApiKey = hashApiKey;
const crypto_1 = __importDefault(require("crypto"));
function generateApiKey() {
    const randomBytes = crypto_1.default.randomBytes(24).toString('hex');
    const fullKey = `aiw_live_${randomBytes}`;
    const keyPrefix = fullKey.substring(0, 16);
    const hashedKey = hashApiKey(fullKey);
    return { fullKey, keyPrefix, hashedKey };
}
function hashApiKey(key) {
    return crypto_1.default.createHash('sha256').update(key).digest('hex');
}
