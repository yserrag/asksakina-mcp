# Changelog

All notable changes to `@asksakina/islamic-knowledge-mcp` are documented here.

## 2.0.0 (29 Sep 2026)

WO#390 Phase 0: MCP 2.0 schema and plumbing. WO#405: teach content batch 1.
WO#407: Gem 10 publish sign-off, teach directives, grief-route drop.
WO#408: final TEACH_DIRECTIVE (payload-verifiable), four reflection rewrites, Gem 10 APPROVED.

### Added (WO#407 + WO#408, Gem 10, 29 Sep 2026)

- **Publish sign-off.** Gem 10 approved all six batch 1 entries. The release gate passes.
- **Teach directives.** TEACH_DIRECTIVE and TEACH_CONTRACT in `presentation.ts`, hash-pinned. Grief clause replaced with payload-verifiable condition (WO#408).
- **Grief and support drop.** On grief routes and whenever a support block is in the response, no teach/related attached.

### Added (WO#405, batch 1 teach content)

- **Six teach entries** (LOCKED v1): du'as D00068 and D00060, verses 21:87 and 39:53, Names Ar-Rahman (1) and Al-Ghafur (34).
- **Runtime attachment** when `audience` is sent (en locale). Crisis/grief/support routes: never attached.
- **`get_dua` id allowlist**: D00060 and D00068.

### Changed (`tools/list`)

- **`audience` parameter** on all four tools. Optional; omitted = byte-identical to 1.5.1.
- **`id` parameter on `get_dua`**: optional, send `context` or `id`.

## 1.5.0WO#386: find_verses, rewritten tool descriptions, bereaved route.### Added- **`find_verses`**: Quran verses by topic keyword from AskSakina's thematic  verse index (27 verses, 11 themes). Index lookup only: no embedding, no AI.  Arabic is the full ayah from the scripture module (Tanzil Uthmani, byte  for byte), translation is full-ayah Pickthall. No match returns `verses: []`  with `no_results: true`. Crisis handling as on `get_dua`.- **`bereaved` context on `get_dua`**: a query naming the querier's own  grief now resolves to `bereaved` instead of `deceased` (du'as for the  person who has died). It returns 7 du'as from the `calamity` collection,  in the reviewer's order, with a teaching note on the masculine forms in  the Arabic. Always carries at least the soft support note. `calamity`
