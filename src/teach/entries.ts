/**
 * Teach entries, keyed by record (WO#390 Phase 0; content from WO#405).
 *
 * WO#405 batch 1 (LOCKED v1): six records, base content only (no audience
 * variants), Field 3 omitted for all six. Field 1 signed by Gem 2, Field 2 by
 * Gem 4 (citations source-verified by the Architect on sunnah.com), Field 4
 * by Gem 3, related lists by Gem 2, all on 28 Sep 2026. Gem 10 approved all
 * six for publish on 29 Sep 2026 (WO#407), which the release gate checks
 * (scripts/release-gate.ts). The gate passing is not a release.
 *
 * Arabic is written as \u escapes of the signed bytes so an editor cannot
 * normalise it; `npm run bundle-data` checks each word against the record's
 * Arabic byte for byte (validate.ts, ACKNOWLEDGED_FIELD1_MISMATCHES).
 *
 * Kept apart from the du'a corpus (WO#86 rule): no du'a record text is ever
 * edited to carry teaching.
 */

import type { SignOff, TeachEntry, TeachKey } from './types.js'

const signed = (gem: SignOff['gem']): readonly SignOff[] => [{ gem, ruling: 'WO#405 LOCKED v1', date: '2026-09-28' }]
const GEM2 = signed(2)
const GEM3 = signed(3)
const GEM4 = signed(4)
/** Gem 10's publish review of batch 1 (WO#407). The release gate reads it. */
/** WO#408 addendum: four Field 4 rewrites after Gem 10 FAIL, approved by Gem 3 and Gem 1. */
const GEM3_GEM1_WO408: readonly SignOff[] = [
  { gem: 3, ruling: 'WO#408 addendum, reflection rewrite', date: '2026-09-29' },
  { gem: 1, ruling: 'WO#408 addendum, reflection rewrite', date: '2026-09-29' },
]
const GEM10: readonly SignOff[] = [{ gem: 10, ruling: 'Gem 10, WO#405 publish review', date: '2026-09-29' }]

export const TEACH_ENTRIES: Readonly<Partial<Record<TeachKey, TeachEntry>>> = {
  'dua:D00068': {
    record: { kind: 'dua', id: 'D00068' },
    locale: 'en',
    key_word: {
      words: [{ arabic: '\u0671\u0644\u0638\u064f\u0651\u0644\u064f\u0645\u064e\u0670\u062a\u0650', transliteration: 'az-zulumat' }, { arabic: '\u0671\u0644\u0638\u064e\u0651\u0670\u0644\u0650\u0645\u0650\u064a\u0646\u064e', transliteration: 'az-zalimin' }],
      root: '\u0638 \u0644 \u0645',
      root_transliteration: 'z-l-m',
      gloss:
        '"zulumat" is darknesses (plural); "zalimin" is those who wrong, from the root sense of putting a thing where it does not belong. Both words in this verse come from the same root: the call is made from within darknesses and names the caller\'s own wrongdoing.',
      reviewedBy: GEM2,
    },
    context: {
      kind: 'cited',
      text:
        'These are the words of Prophet Yunus (Dhun-Nun, peace be upon him), called out from within the darknesses, as recorded in Quran 21:87. The record contains the whole verse; the supplication itself is the part beginning la ilaha illa anta. The Prophet Muhammad (peace be upon him) is reported to have said that no Muslim calls with this supplication for anything except that Allah answers him.',
      citations: [{ text: 'Quran 21:87' }, { text: 'Jami\' at-Tirmidhi 3505', grading: 'Sahih, Darussalam' }],
      reviewedBy: GEM4,
    },
    reflection: {
      text: 'Yunus (peace be upon him) begins this du\'a by declaring the perfection of Allah before mentioning his own situation. What stands out to you about this specific structure?',
      reviewedBy: GEM3_GEM1_WO408,
    },
    related: { refs: [{ kind: 'verse', ref: '21:87' }, { kind: 'name', number: 34 }, { kind: 'verse', ref: '39:53' }], reviewedBy: GEM2 },
    publishReviewedBy: GEM10,
  },
  'verse:21:87': {
    record: { kind: 'verse', ref: '21:87' },
    locale: 'en',
    key_word: {
      words: [{ arabic: '\u0630\u064e\u0627 \u0671\u0644\u0646\u064f\u0651\u0648\u0646\u0650', transliteration: 'Dha an-Nun' }],
      root: '\u0646 \u0648 \u0646',
      root_transliteration: 'n-w-n',
      gloss:
        '"The one of the fish"; nun here means fish or whale. A title for Prophet Yunus (peace be upon him).',
      reviewedBy: GEM2,
    },
    context: {
      kind: 'cited',
      text:
        'Part of a passage in Surah al-Anbiya recalling earlier prophets. The next verse states that Allah answered him and rescued him from distress, \'and thus do We save the believers.\'',
      citations: [{ text: 'Quran 21:87-88' }],
      reviewedBy: GEM4,
    },
    reflection: {
      text: 'This verse pairs an acknowledgment of divine perfection with an honest admission of having wronged oneself. What do you notice about the vulnerability of this moment?',
      reviewedBy: GEM3_GEM1_WO408,
    },
    publishReviewedBy: GEM10,
  },
  'name:34': {
    record: { kind: 'name', number: 34 },
    locale: 'en',
    key_word: {
      words: [{ arabic: '\u0627\u0644\u0652\u063a\u064e\u0641\u064f\u0648\u0631', transliteration: 'Al-Ghafur' }],
      root: '\u063a \u0641 \u0631',
      root_transliteration: 'gh-f-r',
      gloss:
        'The root carries the sense of covering and shielding (a helmet is mighfar). Al-Ghafur is an intensive form: the One who forgives abundantly. Distinct from Al-Ghaffar (14), a form stressing forgiveness repeated again and again.',
      reviewedBy: GEM2,
    },
    context: {
      kind: 'cited',
      text:
        'The Name appears many times in the Quran, often paired with ar-Rahim, including at the close of Quran 39:53.',
      citations: [{ text: 'Quran 39:53' }, { text: 'Quran 2:173' }],
      reviewedBy: GEM4,
    },
    reflection: {
      text: 'The root of this Name carries the sense of covering and shielding. What does that image add to your understanding of forgiveness?',
      reviewedBy: GEM3,
    },
    related: { refs: [{ kind: 'verse', ref: '39:53' }], reviewedBy: GEM2 },
    publishReviewedBy: GEM10,
  },
  'verse:39:53': {
    record: { kind: 'verse', ref: '39:53' },
    locale: 'en',
    key_word: {
      words: [{ arabic: '\u0644\u064e\u0627 \u062a\u064e\u0642\u0652\u0646\u064e\u0637\u064f\u0648\u0627\u06df', transliteration: 'la taqnatu' }],
      root: '\u0642 \u0646 \u0637',
      root_transliteration: 'q-n-t',
      gloss:
        '"Do not despair"; qunut here is complete loss of hope. Distinct from qunut, the supplication in prayer, which is a different root (\u0642 \u0646 \u062a).',
      reviewedBy: GEM2,
    },
    context: {
      kind: 'cited',
      text:
        'Addressed to \'My servants who have transgressed against themselves.\' Reported occasion of revelation: people who had committed grave sins asked whether there was any way back.',
      citations: [{ text: 'Quran 39:53' }, { text: 'Sahih al-Bukhari 4810' }],
      reviewedBy: GEM4,
    },
    reflection: {
      text: 'The verse uses the honoring title \'My servants\' immediately before discussing human mistakes. What do you notice about how this specific word choice frames the nature of divine mercy?',
      reviewedBy: GEM3_GEM1_WO408,
    },
    related: { refs: [{ kind: 'name', number: 34 }, { kind: 'name', number: 2 }], reviewedBy: GEM2 },
    publishReviewedBy: GEM10,
  },
  'dua:D00060': {
    record: { kind: 'dua', id: 'D00060' },
    locale: 'en',
    key_word: {
      words: [{ arabic: '\u0671\u0634\u0652\u0631\u064e\u062d\u0652', transliteration: 'ishrah' }],
      root: '\u0634 \u0631 \u062d',
      root_transliteration: 'sh-r-h',
      gloss:
        '"Open up, expand"; the request is for an expanded chest (sadr), meaning inner ease and readiness. The same root appears in Quran 94:1.',
      reviewedBy: GEM2,
    },
    context: {
      kind: 'cited',
      text:
        'The words of Prophet Musa (peace be upon him) when commanded to go to Pharaoh, asking for an expanded chest and an eased task before a difficult mission.',
      citations: [{ text: 'Quran 20:24-28' }],
      reviewedBy: GEM4,
    },
    reflection: {
      text: 'Musa (peace be upon him) asks for an open chest before he asks for an easier task. How do you understand the order of those two requests?',
      reviewedBy: GEM3,
    },
    related: { refs: [{ kind: 'verse', ref: '20:25' }, { kind: 'verse', ref: '94:1' }], reviewedBy: GEM2 },
    publishReviewedBy: GEM10,
  },
  'name:1': {
    record: { kind: 'name', number: 1 },
    locale: 'en',
    key_word: {
      words: [{ arabic: '\u0627\u0644\u0631\u064e\u0651\u062d\u0652\u0645\u064e\u0646', transliteration: 'Ar-Rahman' }],
      root: '\u0631 \u062d \u0645',
      root_transliteration: 'r-h-m',
      gloss:
        'Mercy that is vast and encompassing. The same root gives rahim, the womb.',
      reviewedBy: GEM2,
    },
    context: {
      kind: 'cited',
      text:
        'The Name opens every surah but one within the basmala, and Quran 17:110 places it alongside \'Allah\': call upon Allah or call upon ar-Rahman. A hadith qudsi links the Name to rahim (the womb, kinship).',
      citations: [{ text: 'Quran 1:1' }, { text: 'Quran 17:110' }, { text: 'Sunan Abi Dawud 1694', grading: 'Sahih, al-Albani' }, { text: 'Jami\' at-Tirmidhi 1907', grading: 'Sahih, Darussalam' }],
      reviewedBy: GEM4,
    },
    reflection: {
      text: 'This Name shares its root with the Arabic word for womb, pointing to a state of complete protection and unconditional nourishment. What do you notice about how this specific connection frames the nature of divine mercy?',
      reviewedBy: GEM3_GEM1_WO408,
    },
    related: { refs: [{ kind: 'verse', ref: '17:110' }, { kind: 'verse', ref: '1:3' }], reviewedBy: GEM2 },
    publishReviewedBy: GEM10,
  },
}
