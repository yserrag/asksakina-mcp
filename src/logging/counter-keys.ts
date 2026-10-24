// The fixed keys of the WO#488 Part B counters, shared by the in-memory
// counters (request-logger.ts) and the daily store (daily-store.ts).
/** WO#488 Part B: the five fixed audience buckets; anything else counts as absent. */
export const AUDIENCE_BUCKETS = ['curious', 'revert', 'practising', 'unknown', 'absent'] as const
export type AudienceBucket = (typeof AUDIENCE_BUCKETS)[number]
export function audienceBucket(value: unknown): AudienceBucket {
  return typeof value === 'string' && value !== 'absent' && (AUDIENCE_BUCKETS as readonly string[]).includes(value) ? (value as AudienceBucket) : 'absent'
}

/** WO#488 Part B: the registered prompts (WO#489), fixed at build time. */
export const PROMPT_NAMES = ['understand_a_verse', 'explore_names_of_allah', 'what_muslims_believe', 'first_steps_new_muslim'] as const
export type PromptName = (typeof PROMPT_NAMES)[number]
