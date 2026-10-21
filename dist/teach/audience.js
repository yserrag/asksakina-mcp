import { z } from 'zod';
import { AUDIENCES } from './types.js';
export const audienceArg = z
    .enum(AUDIENCES)
    .optional()
    .describe('Optional: curious, revert or practising, from the user\'s own self-description only. Teaching context attaches whenever an entry exists; omit when the audience is unknown.');
export const AUDIENCE_JSON_SCHEMA = {
    type: 'string',
    enum: AUDIENCES,
    description: 'Optional: curious, revert or practising, from the user\'s own self-description only. Teaching context attaches whenever an entry exists; omit when the audience is unknown.',
};
//# sourceMappingURL=audience.js.map