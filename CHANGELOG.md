# Changelog

All notable changes to `@asksakina/islamic-knowledge-mcp` are documented here.

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
