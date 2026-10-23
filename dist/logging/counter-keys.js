export const AUDIENCE_BUCKETS = ['curious', 'revert', 'practising', 'unknown', 'absent'];
export function audienceBucket(value) {
    return typeof value === 'string' && value !== 'absent' && AUDIENCE_BUCKETS.includes(value) ? value : 'absent';
}
export const PROMPT_NAMES = ['understand_a_verse', 'explore_names_of_allah'];
//# sourceMappingURL=counter-keys.js.map