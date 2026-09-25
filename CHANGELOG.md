# Changelog

All notable changes to `@asksakina/islamic-knowledge-mcp` are documented here.

## 1.4.0

Supersedes 1.3.0 on npm and Fly (published 10 July 2026). 1.3.0 has no entry
of its own in this file; the list below is everything that changed in
`mcp-server/` since that publish, not only the WO#377 work.

### Fixed

- **P0: corrupted Quranic verse in `get_dua`.** The Dhun-Nun du'a (D00068,
  Quran 21:87) was served by 1.3.0 with the word عَلَيْهِ duplicated. The app
  fixed it in July (WO#305, PR #361, Arabic resolved from Tanzil) but the MCP
  was never rebundled. The 1.4.0 bundle carries the fix, and `test:tools` now
  fails if the verse holds more than one عليه (skeleton comparison) in the
  record, its `dua_block` or the bundle.
- **D00043 restored in the `fasting` category** (WO#305 Phase A-2), with both
  Sunan Abi Dawud wordings (2357 Hasan, 2358 Da'if). Du'a count 443 to 445;
  categories 29 to 30.

### Changed

- **Quranic du'as labelled (WO#377 addendum).** Du'as whose Quranic reference
  Gem 2 has verified (WO#305) take their Arabic from the scripture module at
  bundle time (Tanzil Uthmani, bytes unchanged) and carry `origin: "quran"`,
  `quran_citation` and an `Origin:` line in `dua_block`. 3 records in 1.4.0
  (D00068, D00060, D00271): those where Gem 2 ruled on the record's own ref.
  The source corpus is not edited.
- **Grading honesty.** Every du'a record carries `grading_status`
  (`quranic`, `graded`, `not_recorded`), and `content.grading_summary` counts
  them. The `hadith` presentation contract's `require_grading` is `true` only
  when every returned record is graded or Quranic, and `"per_record"`
  otherwise. It no longer claims a grading the data does not hold.
- **Aggregate-only analytics (WO#360).** Per-request JSONL logging (country,
  region, client, user-agent, params) is removed. The server keeps in-memory
  per-tool counters only, and `/stats` reports those. The server card declares
  `analytics: "aggregate-only"`.
- **Review claims (WO#360).** Descriptions and the LICENSE describe the Gem
  chain as structured specialist-AI review, not a substitute for a scholar.
- **Crisis keyword coverage (WO#308)** via the synced `crisis-detection.ts`.
- **Repository pointers (WO#377).** `package.json`, `server.json`, the server
  card, README and LICENSE point at `github.com/yserrag/asksakina-mcp`;
  `server.json` gains `websiteUrl`.
- **README.** AskSakina rebrand (WO#342). Data sources name Pickthall, not
  Saheeh International. Privacy and Analytics sections describe the
  aggregate-only counters. The `get_dua` example shows the real shape.
- `@modelcontextprotocol/sdk` ^1.29.0 to ^1.30.1.
- `tsconfig.build.json`: `removeComments: true` (WO#343 log); `dist/` is
  about 15% smaller.

### Notes

- No new tools. `get_dua` records gain fields; none are removed or renamed.

## 1.2.0

Version already staged in-repo prior to this release; npm/Fly remained on
1.1.0. This is the first publish of the 1.2.0 line.

### Changed (WO#245 — SI-free rebundle)

- **Quran translation flipped off Saheeh International.** `get_quran_verse`
  now requests the public-domain **Pickthall** edition (`en.pickthall`,
  alquran.cloud id 85) instead of `en.sahih`, matching the main app's live
  verse route (WO#186). Verse text is fetched at runtime, not bundled; the
  Arabic `ar` locale fallback also serves Pickthall alongside the original.
  This closes a live SI violation on the public MCP surface, where the app
  itself has been SI-free since migration.
- **Bundle regenerated from post-WO#246 main.** `data/duas.json` (443 du'as),
  `data/dua-categories.json` (29), and `data/names.json` (99 Names) rebuilt so
  any Quranic content embedded in du'as carries the WO#191 Pickthall migration,
  and the WO#246 salawat fixes are folded in: the bundle is now clean of
  `(SAW)`/`(PBUH)` abbreviations, and the truncated breaking-fast du'a D00043
  was deduped onto the canonical D00291 (now graded Sunan Abi Dawud 2358 /
  Da'if). Du'a count 444 → 443; `wealth-debt` 21 → 20. SI-residual scan on the
  new bundle: 0 hits (app assertion-(a) standard).
- **Gem 10 round-3: locale-conditional crisis tables.** The hard-crisis block
  now carries the verified in-country helpline table for the request locale, and
  every block declares its `locale`. `id` serves Halo Kemenkes (1500-567) +
  Sehat Jiwa (119 ext 8); `ur` serves Umang (0311-7786264) + Rozan (0800-22444);
  `ar` serves Saudi (920033360), UAE (800-HOPE), Lebanon Embrace (1564), Egypt
  Befrienders Cairo (762 2381); all plus the IASP international directory. The
  UK/US numbers (Samaritans, 988) now appear ONLY in `en`, so a non-English user
  is never handed a helpline for a country they are not in. Numbers re-verified
  by the Architect. (`get_dua` accepts `locale` en|id|ur|ar; `tr`/others are
  schema-rejected.)
- **Disclaimer / attribution name → AskSakina.** Served response strings
  (disclaimers, `_sakina_meta.source`, the `about` resource body + title,
  du'a fallback strings, rate-limit message) now read "AskSakina". Published
  registry identity metadata (`server.json`, `package.json`, the Smithery
  server-card name/displayName) is unchanged.
- **Em dashes removed from served strings.** Educational context texts,
  presentation directives, the crisis directive, and the bundle manifest
  notes no longer contain em dashes.

### Notes

- No schema or tool changes. No new tools.
- Crisis resource blocks were reviewed and contain no defunct numbers
  (Samaritans 116 123, 988 US/Canada, IASP directory only).
- Deploy runbook (README) now documents the post-deploy Pickthall byte-check and
  a rollback-first rule: on a live SI regression, redeploy the previous image
  before any forward fix.

## 1.1.0

- Prior published release (baseline on npm and Fly).
