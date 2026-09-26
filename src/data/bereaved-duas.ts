/**
 * Du'as for a bereaved person to say for their own grief (WO#386 item D).
 *
 * Gem 4 ruling (26 Sep 2026): 7 of the 8 candidates from the `calamity`
 * context, in Gem 4's order. The ruling named the du'as by their Arabic;
 * each id below was resolved by matching that Arabic to the bundled record
 * (consonantal skeleton, spaces ignored), and test:tools re-checks every id
 * against the ruled text. The records stay in `calamity` too; nothing there
 * changes, and no du'a record text is changed (WO#86 rule).
 *
 * EXCLUDED by Gem 4: D00499 ("Feeling distressed & Overwhelmed"). Its
 * translation ("I have oppressed my soul by sinning") risks implying grief
 * is punishment for sin during acute bereavement. It stays in `calamity` only.
 */
export const BEREAVED_DUAS: readonly string[] = [
  'D00498', // After Calamity/ Stressful situation occurs
  'D00506', // At the Time of Difficulty
  'D00503', // Feeling Overwhelming Sorrow
  'D00502', // Sorrow Greif (corpus title, as stored)
  'D00504', // Feeling no one is able to Help (Quran 3:173)
  'D00518', // Feeling Anxious During Difficult Times
  'D00505', // When needing Strength in Difficult Times
]

/** Gem 4 excluded this record from `bereaved` (see above). */
export const BEREAVED_EXCLUDED: readonly string[] = ['D00499']

/**
 * Teaching note on the masculine forms in the Arabic. Gem 4 approved
 * wording, verbatim; change it only on a Gem ruling. get_dua returns it as
 * `teaching_note` on the bereaved context response.
 */
export const BEREAVED_GENDER_NOTE: string | null =
  "These du'as use the masculine form in the Arabic; the meaning and reward apply equally regardless of the gender of the person making the supplication."
