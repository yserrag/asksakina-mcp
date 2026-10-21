/**
 * The optional `audience` tool argument (WO#390; WO#478).
 *
 * WO#478 (Architect, 20 Oct 2026) superseded the WO#390 flag 1 ruling:
 * teaching context attaches whenever an entry exists, with or without
 * `audience`. A sent value is echoed as `teach.audience`; omitted, the
 * block says `unknown` and carries the base text. Nothing is generated.
 */

import { z } from 'zod'
import { AUDIENCES, type Audience } from './types.js'

export const audienceArg = z
  .enum(AUDIENCES as [Audience, ...Audience[]])
  .optional()
  .describe(
    'Optional: curious, revert or practising, from the user\'s own self-description only. Teaching context attaches whenever an entry exists; omit when the audience is unknown.',
  )

/** JSON-Schema form for the server card. */
export const AUDIENCE_JSON_SCHEMA = {
  type: 'string',
  enum: AUDIENCES,
  description:
    'Optional: curious, revert or practising, from the user\'s own self-description only. Teaching context attaches whenever an entry exists; omit when the audience is unknown.',
} as const
