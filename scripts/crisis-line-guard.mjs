/**
 * #564, Gem 10 armour (22 Oct 2026): the bn and fa crisis blocks must carry
 * their Founder-verified lines exactly. Used by publish-guards.mjs (check h)
 * and by test-wo488 (with a negative control).
 *
 * Scoped strictly to a block's `text` node, never the whole payload: 1480
 * can also be a Hijri year elsewhere in a response. Within the text, the
 * numbers checked are the helpline lines' own, the run after "): " and before
 * " (" in "Name (Country): number (hours)", so hours such as "24/7" or
 * "8:00 to 24:00" are not mistaken for numbers. The set must equal the
 * expected set exactly: a typo, a missing number or an extra one fails.
 */

/** The numbers each bn and fa block must carry (WO#488 A6, Founder-verified). */
export const REQUIRED_LINES = {
  'bn/self-harm': ['999', '09612119911'],
  'bn/abuse': ['109', '999'],
  'fa/self-harm': ['123', '1480'],
  'fa/abuse': ['123'],
}

/** The helpline numbers in a block text, as written (digits, spaces, hyphens, +). */
export function lineNumbersIn(text) {
  return [...String(text).matchAll(/\): (\+?[0-9][0-9 -]*[0-9]|[0-9]) \(/g)].map((m) => m[1])
}

/**
 * Problems with one block's text against the expected numbers; [] when it
 * carries exactly those numbers, each as written (contiguous digits).
 */
export function requiredLineProblems(text, expected) {
  if (typeof text !== 'string') return ['no text node']
  const found = lineNumbersIn(text)
  const problems = []
  for (const n of expected) if (!found.includes(n)) problems.push(`missing ${n}`)
  for (const n of found) if (!expected.includes(n)) problems.push(`unexpected ${n}`)
  if (found.length !== new Set(found).size) problems.push(`a number repeated (${found.join(', ')})`)
  return problems
}
