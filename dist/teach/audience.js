import { z } from 'zod';
import { AUDIENCES } from './types.js';
export const audienceArg = z
    .enum(AUDIENCES)
    .optional()
    .describe('Optional: curious, revert or practising. Returns pre-authored teaching context where available; omit for the standard record.');
export const AUDIENCE_JSON_SCHEMA = {
    type: 'string',
    enum: AUDIENCES,
    description: 'Optional: curious, revert or practising. Returns pre-authored teaching context where available; omit for the standard record.',
};
//# sourceMappingURL=audience.js.map