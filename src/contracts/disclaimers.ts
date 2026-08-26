/**
 * Single source of truth for the disclaimer string. Returned in
 * `_sakina_meta.disclaimer` on every tool response.
 */
export const SAKINA_DISCLAIMER =
  'AskSakina provides verified Islamic reference content for educational purposes. ' +
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
