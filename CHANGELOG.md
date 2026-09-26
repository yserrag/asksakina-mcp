# Changelog

All notable changes to `@asksakina/islamic-knowledge-mcp` are documented here.

## 1.5.0

WO#386: find_verses, rewritten tool descriptions, bereaved route.

### Added

- **`find_verses`**: Quran verses by topic keyword from AskSakina's thematic
  verse index (27 verses, 11 themes). Index lookup only: no embedding, no AI.
  Arabic is the full ayah from the scripture module (Tanzil Uthmani, byte
  for byte), translation is full-ayah Pickthall. No match returns `verses: []`
  with `no_results: true`. Crisis handling as on `get_dua`.
- **`bereaved` context on `get_dua`**: a query naming the querier's own
  grief now resolves to `bereaved` instead of `deceased` (du'as for the
  person who has died). It returns 7 du'as from the `calamity` collection,
  in the reviewer's order, with a teaching note on the masculine forms in
  the Arabic. Always carries at least the soft support note. `calamity`
  and all du'a text are unchanged.

### Changed

- All four tool descriptions rewritten as agent instructions, each under
  200 characters. The server card now uses the same strings as the tools.
- mcp-deploy runs the live publish guards before the agent evals.

## 1.4.1

WO#385: hardening after the 1.4.0 publish.

### Fixed

- **Rate limiter no longer fails open.** Before, any Upstash failure
  allowed every request: HTTP 401 (bad or rotated token), 404 (database
  deleted), a per-command error, or Upstash unreachable. For HTTP errors it
  logged nothing. Now every failure is logged with its status or error
  (never the client IP), and the request is decided by the in-memory
  limiter, so the 60-per-minute budget holds. Upstash calls time out after
  2 seconds. The limiter returns to Upstash as soon as it answers again.
- **Startup reachability check.** The server PINGs Upstash at startup and
  logs the real result ("reachable" or "NOT reachable ... state:
  degraded") instead of "configured" because the secrets are set.
- **Urdu and Indonesian verses no longer serve a wrong or unlicensed
  translation.** `get_quran_verse` with `locale: "ur"` returned Arabic Quran
  text in `translation`, labelled "Jalandhri (Urdu)". `ur` and `id` now
  return Pickthall English with `translation_language: "en"`, a
  `translation_note` that a licensed translation in that language is not yet
  available, and a directive not to translate it.
- **Ayah 1 no longer carries the upstream's basmala** (Gem 2 ruling: the
  basmala is part of ayah 1 only at 1:1). alquran.cloud prefixes it to
  ayah 1 of every surah except 1 and 9. It is removed from ayah 1 of
  surahs 2-8 and 10-114 by an exact match against the two byte forms
  recorded from the upstream (110 surahs plain, 2 with shadda on the ba).
  Nothing is split by word count. An unrecognised start is served
  unchanged, logged with a generic line (no verse reference), and counted
  in `/stats` as `basmala_prefix_mismatch`. 1:1 keeps its basmala. A leading BOM (sent on 1:1)
  is removed.
- **Abuse gets its own crisis block.** An abuse input used to receive the
  self-harm block ("having thoughts of harming yourself"). It now gets an
  abuse block (`crisis_type: "abuse"`). The block has an abuse-specific
  directive (no confrontation advice, no "just leave", no couples
  counselling, no endurance or sabr framing). It lists only the
  Founder-verified domestic-abuse lines from the app's helplines data. Its
  opening sentence is Gem 3's final wording ("What you are experiencing is
  oppression (dhulm), and you are not to blame. ..."). **No du'as are returned on an abuse
  disclosure**: the new `content_type` `crisis_resource_only` carries the
  crisis resource alone (Gem 3 ruling: a du'a there risks spiritual
  bypassing). An allowlist (`ABUSE_SAFE_DUAS`, empty in 1.4.1) can later
  add du'as after the block, under an ordering directive; sabr/endurance
  du'as are dropped from it in code. The publish guards now fail on any
  pending-wording marker in a crisis block.
- **Crisis numbers.** Befrienders Cairo (762 2381, unverified) is removed;
  Egypt is served by the IASP directory. 988 (US/Canada) is held behind
  `US_988_FOUNDER_VERIFIED` until the Founder verifies it, and is not served
  meanwhile. Every block lists 24/7 lines first and states the hours of
  each limited-hours line.
- **Names by Arabic without harakat.** `get_name_of_allah` with "الحكم"
  returned not_found; Arabic input is now compared without diacritics.

### Added

- **Six more du'as labelled Quranic** (WO#377 fast-track; Gem 2 ruling,
  25 Sep 2026). All six are clauses running to the end of the ayah: D00003
  and D00504 (3:173), D00330 (7:23), D00154 and D00179 (9:129), and D00308
  (25:74). As with the three 1.4.0 labels, their Arabic is resolved from the
  scripture module at bundle time (`origin: "quran"`, `quran_citation`), and
  the corpus is not edited. The bundle step now also checks that each
  resolved clause starts and ends at Gem 2's ruled words. D00091, also ruled
  25:74, is held unlabelled until its title is corrected.
- **A Quranic label no longer hides a hadith reference.** A labelled record
  that carries a hadith reference keeps it: `hadith_source`, with
  `hadith_grading_status: "not_recorded"`, and a `Source:` line in
  `dua_block` beside `Origin:`. The Grading line says the hadith's grading
  is not recorded. This applies to D00154 and D00179 (Sunan Abi Dawud 5081).
- **Natural-language contexts for `get_dua`.** Deterministic, no AI: after
  the existing single-term match, the input is normalised and any known
  category, alias, tag or synonym word (or one of a few phrases) inside it
  resolves the category; `content.matched_by` reports how. Crisis detection
  still runs first on the full raw input.
- **Agent evals.** `evals/agent-queries.json` (33 cases) and `npm run eval`
  (in-process, `--fixture`, or `--live <url>`); mcp-deploy runs it against
  the live server after deploy as a warn-only summary.

### Changed

- **`/stats` reports the limiter:** `rate_limiter.state`
  (`upstash` | `degraded` | `memory`), failure count, last failure,
  last success, and the startup check result.
- **Grading directive, Gem 4 wording.** Records whose source and hadith
  grading are both unrecorded (389) carry Gem 4's directive, in
  `grading_directive` and in CRITICAL_RULES. Records with a recorded
  source but no grading (49 adhkar with a recitation-count hadith) keep
  the 1.4.0 interim wording until Gem 4 rules their variant.
- **"authenticated du'as" is now "curated du'a collection"** (Gem 4) in the
  server description, the server card's `get_dua` description, the
  `get_dua` tool description, the README (2) and `package.json`.
- **Disclaimer** reads "AskSakina provides curated Islamic reference
  content" (was "verified"; Gem 4).
- **Server card publisher name** is "AskSakina". The functional `name`,
  `SERVER_NAME` and `X-Sakina-App-Id` are unchanged.
- **CI:** workflows moved from Node 20 actions to `actions/checkout@v7` and
  `actions/setup-node@v7`. Dependency caching is off in the two jobs that
  hold secrets (npm publish, registry publish). New `test:ratelimit` runs
  in `prepublishOnly` and `mcp-deploy`.

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
- **Interim grading directive, on (Gem 10 condition).** Every response with
  an ungraded record carries, in CRITICAL_RULES and as `grading_directive`
  on each `not_recorded` record: "CRITICAL: No grading is provided for this
  record. You MUST NOT invent, guess, or append a grading. Present the
  source exactly as provided without implying authentication." Gem 4's
  final wording replaces it in 1.4.1.
- **Server card says AskSakina (Gem 10 condition).** `displayName` is
  "AskSakina Islamic Knowledge" and the description reads "from AskSakina".
  The functional `name`, `SERVER_NAME` and `X-Sakina-App-Id` are unchanged.
- **Rate limiter discards IPs after the window (Gem 8).** The in-memory
  limiter now sweeps expired buckets on each request and every second, so a
  client IP is dropped within about a second of its 60-second window ending.
  Before, it stayed in memory until the process restarted.
  Production uses the Upstash limiter (keys expire after 60 seconds); the
  in-memory limiter is the fallback when Upstash is not configured.
- **Publish guards (Gem 10 condition).** `npm run guards` (in
  `prepublishOnly` and in `mcp-deploy`, before publish) fails on
  "Saheeh International" in `data/` or `dist/`; U+FDFA in `data/` or in
  live `get_dua` / `get_name_of_allah` responses; whole-word `PBUH` or
  `SAW` in `data/`; or 182 (Turkey's MHRS appointment line, not a crisis
  line, per Gem 3 WO#141) as a phone number in any `crisis_resource` block
  or the `_synced` safety modules.
- **D00348 (Laylat al-Qadr):** "PBUH" in the English translation now reads
  "(peace be upon him)", corrected in the source corpus (Founder ruling).
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
  Saheeh International. One "Privacy & Analytics" section (Gem 8 structure)
  describes the aggregate-only counters and the 60-second IP window. The
  `get_dua` example shows the real shape.
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
