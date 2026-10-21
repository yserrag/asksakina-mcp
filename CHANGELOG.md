# Changelog

All notable changes to `@asksakina/islamic-knowledge-mcp` are documented here.

## 2.2.2 (unreleased; built and tested only. Gem 3 and Gem 10 review the built text before release)

WO#482: the crisis block follows the language of the crisis keyword. On
2.2.1, `get_dua("kendimi öldüreceğim")` with no locale returned the en
block (Samaritans UK); agents often omit the locale.

- With the locale omitted or `en`, a hard crisis block (self-harm or abuse)
  is served in the language of the keyword the detector matched, when
  exactly one of the Indonesian, Urdu (Roman or Urdu script), Arabic or
  Turkish lists hit. That holds whether or not an English keyword also hit.
  Two or more of those languages, English alone, or a Persian, Bengali or
  Punjabi keyword (no MCP block) keep `en`.
- An explicit non-en locale always wins.
- Gem 3 ruling (21 Oct 2026): "umutsuzum" and "umutsuzluk" are hard
  self-harm keywords (the app detector too: they open the crisis modal).
  Turkish soft keywords: kaygı, endişe, bunal, korku, yas tut and çaresiz
  match at a Unicode word start with any ending; yalnızım, stresliyim,
  kederliyim, daraldım, panik atak, içim acıyor, canım yanıyor and derdim var
  match as whole words. Turkish case-folding first (İ to i, I to ı). "korku"
  does not fire inside "Allah'tan kork-". The soft block follows the detected
  language under the same rule as hard.
- Gem 3 ruling, round 2 (21 Oct 2026), in the app detector and the MCP:
  a Turkish relation word (eşimden, kocamdan, babamdan, annemden, ondan and
  14 others) followed by "kork" with up to three words between is ABUSE;
  "dövmesinden" and "dövecek diye" are ABUSE. Every Turkish list also
  matches ASCII typing ("kaygi", "caresizim", "esimden cok korkuyorum"):
  the detector already folded Latin input and keywords (WO#252-A), and the
  soft matcher now does too, for the Turkish keywords only. "korku" no
  longer matches korkunç, korkutucu or the korkut- stem; "Allah korkusu" is
  devotional, like "Allah'tan kork-".
- Applies wherever the crisis check runs: `get_dua` (context and id),
  `find_verses`, `get_name_of_allah`.
- The detector (`src/lib/utils/crisis-detection.ts`, synced) now exports
  its id, ur, ar and tr keywords as their own lists, moved unchanged, and
  `crisisKeywordLanguages(text, crisisType)`. `detectCrisis` is unchanged.
- The soft matcher splits words on anything that is not a Unicode letter or
  number (`/[^\p{L}\p{N}]+/u`, Architect ruling 21 Oct 2026). The old `/\W+/`
  split broke every non-ASCII letter, so no Turkish keyword with ı, ğ, ü,
  ş, ç or ö could match. Every English soft keyword matches as before.
- Not published, not deployed, registry unchanged apart from the version
  number.

## 2.2.1 (unreleased; built and tested only. Gem 10 reviews the built blocks before release)

WO#481: crisis text in the user's language, and the `tr` locale. Gem 3
approved the structure and the reuse of the app's `crisis.immediateDanger`,
Gem 1 the translations, Gem 2 the ar and ur code points and the bidi rules,
all on 21 Oct 2026 (`docs/wo481-architect.md`). Not published, not
deployed, registry unchanged apart from the version number.

### Changed

- **Crisis blocks in the request locale** (Gem 3 HIGH RISK ruling: id, ur
  and ar served English sentences until now). The self-harm, abuse and soft
  blocks for `ar`, `ur`, `id` and `tr` are written in that language, each
  helpline on its own line as "Name: number (hours)". The abuse block
  closes with the app's `crisis.immediateDanger` (ar, ur, tr) or the id
  sentence. `en` is byte-identical to 2.2.0. The directives stay English
  (agent-facing). Every string is generated from the ruling record by
  `scripts/wo481-extract-crisis-l10n.py` into
  `src/safety/crisis-l10n-strings.ts`, never retyped.
- **Bidi isolates (Gem 2), ar and ur only:** every URL, phone number and
  "24/7" sits in LRI U+2066 ... PDI U+2069, and Arabic-script hours inside a
  helpline line in RLI U+2067 ... PDI U+2069, all generated in one helper
  (`src/safety/bidi.ts`), which also isolates every Latin-script run in an
  ar or ur line (Architect ruling of 21 Oct 2026). en, id and tr carry no
  isolate marks.
- **Names in the lines:** ar uses the Arabic name from `src/data/helplines.ts`
  where one exists, else the Latin one; ur uses Umang Helpline, Rozan
  Counselling and Madadgaar National Helpline; id uses the `helplines.ts`
  names (SEJIWA, with its "119, lalu tekan 8"). A name that carries an em
  dash in `helplines.ts` is rendered whole with ", " in place of " — "
  (the Arabic comma U+060C and a space for an Arabic-script name in ar;
  Architect rulings of 21 Oct 2026; `helplines.ts` is unchanged), so Egypt
  keeps the National Council for Women and UAE its full name. In ar and ur,
  every Latin-script run in a line (service names included) is isolated
  too. The id office hours keep the dataset's en dash; only em dashes are
  banned.

### Added

- **`tr` locale** on all four tools and the server card. tr crisis blocks:
  self-harm names 112 (7/24) and the IASP directory; abuse names ALO 183
  Sosyal Destek Hattı (183, 7/24), its WhatsApp line 0501 183 0 183 for when
  calling is not safe, and 112. Turkish crisis phrases route to them.
  `PARKED_TRANSLATION_LOCALES.tr` ships in the same change, so a `tr` Quran
  request gets Pickthall English with the disclosed note, never silently.
  `tr` Names return the English meaning and reflection (the tool
  description says so); du'a records stay English for every locale.
- `scripts/test-wo481.ts` (`npm run test:wo481`, in `prepublishOnly`): the
  table against the record, `helplines.ts` and the app bundles; each block's
  structure; balanced isolates and every ar/ur phone number, URL and "24/7"
  isolated; every number in every block present in `helplines.ts`; the
  WhatsApp line equal to the `tr-alo-183` note; no em dash; 182 in no block;
  Turkish routing; the tr parked note; en unchanged. The publish guards scan
  the tr blocks and two Turkish crisis calls; 182 stays banned.

## 2.2.0 (unreleased; Gem 3, Gem 4, Gem 8 and Gem 10 passed the built text on 20 Oct 2026, delegated rulings by the Architect, with their conditions applied)

WO#478, "teach, don't hand off" (Architect rulings of 20 Oct 2026, under the
[GEM4-DAWAH] ruling recorded in `docs/mcp-teach-phase0/00-architect.md`). The
spec and evidence are WO#477, `docs/mcp-teach-phase0/`. Not published, not
deployed; the registry entry is unchanged apart from the version number.

### Added

- **Server `instructions`** (SDK `ServerOptions.instructions`, returned in the
  initialize result): the quoting and teaching rules in one place, the
  ruling's da'wah adab block (534 characters as ruled; 566 with Gem 4's
  condition ", without hiding difficult texts" after "(Sahih al-Bukhari
  69)"), and the open-door line (116 characters) verbatim with its
  conditions (interest in Islam, at most once, never in distress, never as a
  condition, never after a decline). 1,529 characters, under the 1,801 the
  Architect set. `src/contracts/instructions.ts`.
- **`get_dua` `limit` and `offset`** (`limit` 1 to 10, default 3; `offset`
  0 or more, default 0): a context lookup returns one page of the route's
  existing order, so every record stays reachable by paging. The bereaved
  set (Gem 4's fixed order) and the abuse allowlist are always returned
  whole, offset ignored. When more follow the page,
  `content.total_available`, `content.truncated` and `content.more` say so,
  and CRITICAL_RULES carries the same note: "N more du'as for this context;
  call get_dua with offset and limit to see them." `content.offset` is
  present when it is not 0.
- `scripts/test-wo478.ts` (`npm run test:wo478`, in `prepublishOnly`).

### Changed

- **Teach attaches whenever an entry exists**, with or without `audience`.
  The WO#390 flag 1 ruling ("audience omitted = 1.5.0 output byte for byte")
  is superseded. `teach.audience` is the sent value or `"unknown"`; unknown
  serves the base text. Withhold (support block, grief route, crisis), the
  en-only rule and the entry lookup are unchanged; the by_audience variants
  are still not applied. Three checks in `scripts/test-teach.ts` that
  asserted the old promise are inverted (the reasons are in
  `docs/wo478-sg-report.md`).
- **The four hand-off directives are retired** (WO#477 inventory A18, A20,
  A33, A37): "You MUST output the 'dua_block' field exactly as provided...",
  the anti-summarisation line's "summarise", "Prefer the 'name_block' field
  for display..." and the WO#407 teach contract. In their place, the teaching
  order (P1, P1c, both tools' P2 and P4, and new P5 and P6 on
  `get_quran_verse` and `find_verses`): quote the record first, exactly;
  then explain only from the teach block as context from AskSakina's notes,
  not tafsir or a ruling; where the notes end, say so and point to a
  recognised tafsir or a qualified scholar; the reflection question
  verbatim, unanswered; at most one related next step; nothing under a
  crisis block or after a disclosure of distress. Where no teach block is
  supplied, explanation only from the record's own supplied fields,
  attributed, then the same hand-over. Every scripture-integrity rule (exact
  Arabic, exact translation, citation, grading never separated, softened or
  inflated) and every safety directive is unchanged.
- **Phrase fixes:** "loss of faith" no longer routes to the grief theme or
  the soft support block, and "fear of Allah" no longer routes to anxiety or
  the soft support block (`PHRASE_EXCLUSIONS`, `SOFT_PHRASE_EXCLUSIONS`). No
  synonym map in this release.
- `audience` argument description: from the user's own self-description
  only; omit when unknown.
- **No no-teach clause under a support block** (Gem 3): under the same
  condition that withholds teach (a support block in the response, a grief
  route, the abuse allowlist path), the "Where no teach block is supplied,
  you may explain only from..." clause is cut from every directive that
  carries it, so a response under a support block invites no explanation.
- **not_found** (Gem 4): the directive and the disclaimer end "Suggest the
  user rephrase or try a related topic."; the site link stays in the
  server instructions only.
- **Server card privacy line** (Gem 8): "aggregate counters only: per-tool
  call and status totals. No per-request records, no IPs, no client
  identifiers, no user-agents, no geolocation, no params, no response
  payloads. Since-start totals reset on restart; on the hosted server,
  per-tool daily totals are kept on disk for at most 90 days." (It had
  described in-memory counters only since WO#456 added the daily totals.)

### Release (Gem 10 condition 6)

1. Merge to `main`.
2. `mcp-deploy` (npm via the mirror, and Fly).
3. **Before the MCP Registry Publish**, the Architect verifies live on Fly:
   `get_quran_verse` 39:53 carries its teach block (`verse:39:53`,
   `audience: "unknown"` when omitted), and 2:255 is clean (no teach, no
   block). The sandbox could not reach alquran.cloud and no fixture exists
   for either verse, so these two are verified live, not from a replay.
4. MCP Registry Publish.

Deploy run 16 (2.2.0) failed at the live Dhun-Nun check, exit 2: it called
`get_dua({ context: 'anxiety' })` and D00068 is the 9th record, beyond the
default page of 3. Not a content failure (the Architect verified D00068,
39:53 and 2:255 live). The check now looks the record up by id first and
pages the context as a fallback; the live publish guards page their context
scans the same way. No version change.

## 2.1.2 (unreleased; Gem 10 reviewing the two ur lines, 20 Oct)

### Changed

- **Rozan Counselling (Pakistan) number** in the `ur` self-harm and abuse
  crisis lines is `0304-111-1741` (was `0800-22444`), the number on
  rozan.org's site header, verified by the Architect on 20 Oct 2026. Hours
  unchanged (business hours). The app's `src/data/helplines.ts` carries the
  same number, which `test:tools` cross-checks.

## 2.1.1 (unreleased; Gem 8 and Gem 10 passed, 12 Oct)

WO#456: daily usage totals that survive a restart (hosted server only). A
version of its own so the README's privacy wording ships to npm and the mirror
together with the Fly deploy that starts writing the totals.

### Added

- **Daily per-tool totals on disk** where `MCP_USAGE_DIR` is set (the Fly
  volume): per tool and UTC day, `ok`, `not_found`, `error` and summed handler
  time; nothing else. Written every 5 minutes and on SIGINT/SIGTERM; at most 90
  days kept. `/stats` gains `daily`. Local `npx` and `--stdio` runs write
  nothing.

### Changed

- **README "Privacy & Analytics"**: the since-start counters stay in memory;
  the daily totals, their fields and the 90-day retention are now stated.
- **Mirror publish workflow** also runs on `workflow_dispatch`, so a missed tag
  trigger can be re-run on the tag from the Actions tab. A run on a branch
  fails the release checks before anything is published.

## 2.1.0 (unreleased: waiting on Gem 10)

WO#444: the Pickthall English is AskSakina's corrected text; the package runs.

### Changed

- **Qur'an English is bundled** (`data/pickthall.json`, 6,236 verses): AskSakina's
  Pickthall, corrected against the 1930 text in WO#442 (83 verses, mostly
  "God" restored where digital editions print "Allah"). `get_quran_verse` and
  `find_verses` serve it in place of alquran.cloud's `en.pickthall`. Verses
  carry no final punctuation, as the app's reader shows them. Arabic and surah
  names still come from alquran.cloud.
- **Pickthall labels follow the WO#421 rule**, the same code as the app's
  prebuild check, in place of a letters-only comparison. No label changes on
  today's data (123 of 123).
- **Du'a corpus: 440 entries** (was 445 at 1.4.0): the du'a audit, WO#413 to WO#452.
- **Published from the public mirror** with npm trusted publishing and
  provenance; no npm token.

### Added

- **`--stdio`**: `npx -y @asksakina/islamic-knowledge-mcp --stdio` serves MCP
  over stdio, the transport the registry entry declares (`packageArguments`).
- **Mixed du'as** (a Qur'anic passage inside a longer supplication, 7 records)
  carry `quran_spans`: each passage's reference and its Pickthall English, a
  `Contains:` line in `dua_block`, and the quran presentation contract.

- **General supplications** (grading "Not a narration", 92 records) have their
  own `grading_status`, `not_a_narration`, and their own `grading_summary`
  count. Each carries Gem 10's directive as `grading_directive`, and
  CRITICAL_RULES states it once, scoped to their titles. The `hadith` contract
  is `require_grading: "per_record"` when any are present. Never on a Qur'anic
  record (WO#454).
- **CRITICAL_RULES (WO#454):** on a du'a response with more than one record, a
  line against merging or summarising the du'as; whenever the Qur'an contract
  applies, a line requiring the surah:ayah citation and the "Translation of the
  Meaning" prefix.

### Changed (WO#454, Gem 10 wording)

- The `dua_block` rule now reads: "You MUST output the 'dua_block' field
  exactly as provided. Do not reassemble the record from individual keys."
- The soft `crisis_resource` directive now reads: "Output this crisis resource
  block exactly as written. Do not counsel beyond it." Its text, the hard and
  abuse blocks and the abuse ordering directive are unchanged.
- The no-emoji rule reads "Do NOT use emojis or em dashes in your response."

### Fixed

- **The `sakina-mcp` command started nothing.** It compared the unresolved
  symlink path with the module path and exited with code 0. It now resolves
  both, so `npx` starts the server (HTTP by default, stdio with `--stdio`).

## 2.0.0 (29 Sep 2026)

Teaching layer (batch 1): six records, Gem 10 cleared WO#407.

WO#390 Phase 0: MCP 2.0 schema and plumbing. WO#405: teach content batch 1.
WO#407: Gem 10 publish sign-off, teach directives, grief-route drop.

### Changed (WO#408, Gem 10 pre-publish review, 29 Sep 2026)

- **Teach directive and contract** no longer ask the caller's model to judge
  whether the user is grieving or bereaved. Both now condition only on a
  crisis resource block in the payload. The server already withholds teach on
  grief and support routes. New hashes are pinned in `test:teach`.
- **Four reflection questions rewritten** (D00068, 21:87, 39:53, Ar-Rahman),
  approved by Gem 3 and Gem 1, so that each is safe for a caller who reaches
  the record directly by id.

### Added (WO#407, Gem 10, 29 Sep 2026)

- **Publish sign-off.** Gem 10 approved all six batch 1 entries ("Gem 10,
  WO#405 publish review"). The release gate now passes. That cleared the gate
  only; the release itself is WO#408.
- **Teach directives.** When, and only when, a response carries a teach
  block, `CRITICAL_RULES` gains Gem 10's teach directive and
  `presentation_contract` gains `teach`, both verbatim and hash-pinned in
  `test:teach`. A response without teach is unchanged (178-call check).
- **Grief and support drop.** On grief routes (the bereaved and deceased
  contexts, the grief theme) and whenever a support block is in the
  response, no `teach` and no `related` are attached at all, the same as
  crisis. This replaces the WO#405 rule that removed only Field 4 there.

### Added (WO#405, batch 1 teach content; response egress when `audience` is sent)

- **Six teach entries** (LOCKED v1): du'as D00068 and D00060, verses 21:87
  and 39:53, Names Ar-Rahman (1) and Al-Ghafur (34). Field 1 (Gem 2),
  Field 2 with citations (Gem 4), Field 4 (Gem 3), related lists (Gem 2),
  all signed 28 Sep 2026. No Field 3, no audience variants.
- **Runtime attachment.** When a caller sends `audience` (and the locale is
  `en`), the matching record gains `teach` and `related`, appended after its
  existing keys. With `audience` omitted every response is byte-identical to
  1.5.1 (178-call check, `npm run byte-identity`). Crisis responses never
  carry teach. `reflection_question` (Field 4) is withheld whenever a support
  block is in the response and on grief routes (Gem 3). Superseded by WO#407:
  nothing is attached there.
- **`get_dua` id allowlist** is now D00060 and D00068: du'a teach records
  plus du'a ids named in signed related lists.
- **Release gate** (`npm run release-gate`, run by mcp-deploy before any
  deploy or publish): refuses until Gem 10 has signed every teach entry.
  `bundle-data` checks the per-field sign-offs only. Passes since WO#407.

### Changed (internal)

- Field 1 holds a list of words (`key_word.words`), so one root can quote
  two words (D00068). Each word is checked against the record's Arabic byte
  for byte at bundle time; two encoding differences from Tanzil are
  acknowledged by name (39:53 and D00060, sukun as U+0652), per WO#405.

### Changed (`tools/list`)

- **`audience` parameter on all four tools** (`get_quran_verse`,
  `get_dua`, `get_name_of_allah`, `find_verses`). Optional. Omitted,
  responses are byte-identical to 1.5.1 (178-call check). Any value,
  `'curious'` included, attaches teach where an entry exists (WO#405).
- **`id` parameter on `get_dua`.** Optional; send `context` or `id`, not
  both. `context` is no longer `required` in the schema. An id resolves only
  if it is on the allowlist built from the Gem-2-signed `related` lists
  (D00060 and D00068 in 2.0.0); every other id gets the same refusal, with no
  record content. Crisis detection runs on the id first, as on `context`.

### Added (internal, no egress)

- Teach types, the sign-off validator and `test:teach`, run in
  `prepublishOnly`.

## 1.5.1

WO#391 (P0, Gem 3 ruled CRITICAL, 27 Sep 2026): crisis-input normalisation.

### Fixed

- **Obfuscated crisis and abuse input now reaches the crisis gate.** 1.5.0
  matched keywords as plain substrings, so "kill-myself", "sui\u200Bcide",
  "k1ll myself", "k i l l myself", "killmyself" and "my-husband-hits-me"
  missed it. "my-husband-hits-me" returned 7 marriage du'as through the
  phrase matcher. The detector now normalises its input for matching only:
  zero-width characters stripped; hyphens, underscores, dots, Unicode dashes
  and spaces, and repeated punctuation become one space; letter-spaced runs
  collapse; English terms also match through leetspeak and collapsed
  repeated letters; Latin-script phrases also match with their spaces
  removed, on word boundaries. Arabic-script and Bengali input gets the
  separator and zero-width steps only. Leetspeak includes "!" as i and reads
  "1" as both i and l ("k!ll myself", "ki11 myself"). The text returned in `requested` is
  the caller's, unchanged. Fixed at the source in the app
  (`src/lib/utils/crisis-normalise.ts`) and synced, so the app's own crisis
  gate gets the same fix.

- **English keywords match from a word boundary.** Every English keyword
  must start at a word boundary (a glued pronoun such as "iraped" or
  "#ikillmyself" still counts), so the pre-1.5.1 false positives
  "skill myself" and "draped" no longer hit. Only "self harm" and the
  "hits me" family (Gem 3, 27 Sep 2026) must also END at a boundary, an
  inflection (-ing, -ed, -s, -er) or a repeated final letter:
  "self-harming" and "self-harmed" still hit, "self-harmony" and "the hits
  media" do not. Every other English keyword stays open at the end, as
  before, so "kill myselfnow" and "suicidal" still hit. Other languages keep
  substring matching. "#" is treated as a separator.
- **"kms" before a distance word is not a hit** (Gem 3, Option 2): "5 kms
  walk" and "10 kms away" no longer fire; "kms", "i want to kms" and
  "day 3 kms" still do. "ran 5 kms today" still fires (accepted by Gem 3).
- There is still no bare "abuse" keyword (Gem 3, Bare-Noun Suppression
  rule), so "substance abuse" and "abuse of power" do not hit.

### Changed

- **`get_name_of_allah` checks `name` for crisis keywords**, as `get_dua`
  and `find_verses` do. A hard crisis returns the crisis resource alone; a
  soft match attaches the support block. `number` is not text and is not
  checked.
- **npm package description** (Gem 10 gate, Gem 4 term): "a curated du'a
  collection" is now "a curated du'a corpus", the server/AI-facing term from
  WO#388 item C. The README tagline and tools table follow. The published
  1.5.0 description begins "Verified Islamic knowledge MCP server"; 1.5.1
  begins "Curated". Descriptions of already-published versions cannot change
  on npm: 1.0.0 still says "authenticated du'as".
- The AskSakina `llms.txt` MCP entry says "a curated du'a corpus" (was
  "authenticated du'as"); the repository README says "traditional du'as".
- mcp-deploy: `test:crisis` runs before deploy, and the live publish guards
  fail the job if any live-confirmed crisis variant does not return the
  crisis resource alone.

### Also in this release: WO#388 and the claims wording

npm 1.5.0 was published on 26 Sep 2026 at 13:44Z from gitHead b1e5f82,
before WO#388 merged. 1.5.1 is the first release to carry these changes.
Production served the pre-WO#388 ungraded directive until this release.

- WO#388 item A: `find_verses` returns the crisis block alone on any hard crisis.
- WO#388-B: `get_dua` returns the crisis block alone on any hard crisis
  (self-harm as well as abuse).
- WO#388 item B: one locked directive (Gem 4) on every ungraded hadith du'a,
  replacing the earlier directives.
- WO#388 item C and the claims-wording commits: "curated du'a corpus" and
  the reviewed wording in server-facing copy.

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
