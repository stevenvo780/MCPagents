"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthParamsSchema = void 0;
exports.health = health;
const zod_1 = require("zod");
exports.HealthParamsSchema = zod_1.z.object({
// No parameters for health check
});
async function health(params) {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
    };
}
