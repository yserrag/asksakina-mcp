/**
 * Single source of truth for the disclaimer string. Returned in
 * `_sakina_meta.disclaimer` on every tool response.
 */
export const SAKINA_DISCLAIMER =
  'AskSakina provides curated Islamic reference content for educational purposes. ' +
  'This is not a religious ruling (fatwa). ' +
  'Consult a qualified local scholar for personal religious questions.'

/**
 * Used when the requested record cannot be found. Returned alongside
 * the canonical `_sakina_meta` envelope so agents still receive a
 * structured answer with the standard handling rules.
 */
export const NOT_FOUND_DISCLAIMER =
  'AskSakina could not find a record matching the supplied input. ' +
  'Do not fabricate a substitute. ' +
  'Suggest the user rephrase or consult asksakina.com directly.'

/**
 * WO#385: disclaimer for a crisis-resource-only response (abuse disclosure).
 * Pending Gem 3 review alongside the abuse block.
 */
export const CRISIS_ONLY_DISCLAIMER =
  'AskSakina is not an emergency or counselling service. The crisis resource in this response lists services that are.'
