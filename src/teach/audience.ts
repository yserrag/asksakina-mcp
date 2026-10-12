/**
 * The optional `audience` tool argument (WO#390, Architect ruling on flag 1).
 *
 * Omitted: 1.5.0 output, byte for byte. Sent: selects pre-authored teaching
 * context where an entry exists; nothing is generated. No entries exist yet,
 * so today a sent audience changes nothing either.
 */

import { z } from 'zod'
import { AUDIENCES, type Audience } from './types.js'

export const audienceArg = z
  .enum(AUDIENCES as [Audience, ...Audience[]])
  .optional()
  .describe(
    'Optional: curious, revert or practising. Returns pre-authored teaching context where available; omit for the standard record.',
  )

/** JSON-Schema form for the server card. */
export const AUDIENCE_JSON_SCHEMA = {
  type: 'string',
  enum: AUDIENCES,
  description:
    'Optional: curious, revert or practising. Returns pre-authored teaching context where available; omit for the standard record.',
} as const
