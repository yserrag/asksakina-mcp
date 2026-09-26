# AskSakina Islamic Knowledge MCP Server

[![npm version](https://img.shields.io/npm/v/@asksakina/islamic-knowledge-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@asksakina/islamic-knowledge-mcp)
[![License](https://img.shields.io/badge/license-Sacred%20Use-8B6A42.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-com.asksakina%2Fislamic--knowledge-4A6B4A.svg?style=flat-square)](https://registry.modelcontextprotocol.io/v0/servers?search=com.asksakina)

> **Specialist-AI-reviewed Islamic knowledge for AI agents.** Quranic verses, a curated du'a collection, and the 99 Names of Allah — reviewed across the four mainstream Sunni schools (Hanafi, Maliki, Shafi'i, Hanbali) through AskSakina's structured specialist-AI review chain, which is not a substitute for a qualified scholar. Every response is wrapped in a presentation contract so agents cannot silently misrepresent the content.

**Architectural posture:** *"AskSakina ships records, agents ship answers."* The server is a reference library, not an advisor. Each response includes a `_sakina_meta` envelope with disclaimer, LLM directives, presentation contract, and educational context. What the calling agent does with the record is its responsibility — but every response arms the agent with enough structural context to make mishandling difficult and trackable.

---

## What it provides

Four lookup tools and one canonical resource over the Model Context Protocol. Every record is sourced from AskSakina's main app (`asksakina.com`), so each MCP release matches what the public app surfaced when it was built.

| Tool | What it does |
|---|---|
| `get_quran_verse` | Verbatim Quranic verse lookup by surah:ayah |
| `get_dua` | Curated du'a collection lookup by life context (anxiety, morning, travel, ...) |
| `get_name_of_allah` | One of the 99 Names by number (1–99) or string |
| `find_verses` | Quran verses by topic keyword, from AskSakina's thematic verse index |
| `sakina://about` (resource) | Read-once briefing — seven core directives plus three Gem-cleared dawah texts (Quran preservation, hadith grading, madhab attribution) |

---

## Tools

### `get_quran_verse`

Verbatim Quranic verse lookup by surah:ayah. Returns the canonical AskSakina envelope with Arabic text, translation, surah name (Arabic + English), and the `quran` presentation contract — no paraphrasing, surah:ayah citation required, "Translation of the Meaning" labelling.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `surah` | `1`..`114` | yes | Surah number |
| `ayah` | `1`..`286` | yes | Ayah within the surah |
| `locale` | `'en'` \| `'id'` \| `'ur'` \| `'ar'` | no, defaults `en` | Translation language. `ar` returns the Arabic original with the Pickthall English alongside. Urdu and Indonesian translations are not yet available (pending licences): `ur` and `id` return Pickthall English, `translation_language: "en"` and a `translation_note` saying so |

**Example response (truncated)**

```jsonc
{
  "_sakina_meta": {
    "version": "1.0",
    "content_type": "quran_verse",
    "presentation_contract": {
      "quran": {
        "no_paraphrase": true,
        "require_citation": "surah:ayah",
        "translation_label": "Translation of the Meaning"
      }
    }
    /* … */
  },
  "content": {
    "surah": { "number": 2, "name_arabic": "البقرة", "name_english": "Al-Baqarah" },
    "ayah": 186,
    "arabic": "وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ ۖ …",
    "translation": "And when My servants ask you concerning Me — indeed I am near. …"
  }
}
```

### `get_dua`

Returns du'as matching a life context (anxiety, grief, morning, travel, etc.). Context is resolved against canonical category slugs, an alias map, and tag dimensions. A natural phrase ("grief after losing my mother") also resolves: the server normalises it and matches known category, alias, tag and synonym words and a few multi-word phrases inside it, deterministically and without AI. `content.matched_by` says how it resolved. **Grief (WO#386):** a query that names the querier's own grief ("I lost my mother", "grief after losing my mother", "my father passed away", "bereaved") resolves to context `bereaved`; a funeral rite or the person who has died ("funeral", "dua for the deceased", "grave") stays `deceased`. `bereaved` returns seven du'as ruled by the fiqh reviewer (Gem 4), in its order, with a `teaching_note` on the masculine forms in the Arabic, and always carries at least the soft support note. Crisis detection runs first, on the full raw input. Self-harm and abuse get separate blocks (`crisis_type`): the abuse block carries domestic-abuse lines and an abuse-specific directive. **On an abuse disclosure no du'as are returned**: `content_type` is `crisis_resource_only` and the crisis resource is the whole response. Each block lists 24/7 lines first and states the hours of any limited-hours line. **If the context contains a crisis keyword (matched against the main app's `detectCrisis` keyword list), the response includes a mandatory `crisis_resource` block** with the appropriate hotline and prosocial directive.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `context` | `string` | yes | Free-form life context |
| `locale` | `'en'` \| `'id'` \| `'ur'` \| `'ar'` | no, defaults `en` | Translation language |

**Example response (truncated)**

```jsonc
{
  "_sakina_meta": {
    "content_type": "dua_collection",
    "presentation_contract": {
      "hadith": { "require_grading": "per_record" /* true when every record is graded */ }
    }
    /* … */
  },
  "content": {
    "context": "stress-anxiety",
    "duas": [
      {
        "dua_block": "Arabic: …\nTransliteration: …\nTranslation: …\nOrigin: Quran 21:87\nSource: Quran 21:87\nGrading: Quranic",
        "title": "Dua to Deal with Distress & Depression",
        "arabic": "وَذَا ٱلنُّونِ إِذ ذَّهَبَ …",
        "source": "Quran 21:87",
        "grading": "Quranic",
        "grading_status": "quranic",
        "origin": "quran",
        "quran_citation": "Quran 21:87"
      },
      {
        "title": "Dua to Remove Sorrow & Grief:",
        "source": "Source not recorded in AskSakina corpus",
        "grading": "Not graded in AskSakina corpus",
        "grading_status": "not_recorded"
        /* … */
      }
      /* … */
    ],
    "total_results": 12,
    "grading_summary": { "quranic": 2, "graded": 0, "not_recorded": 10 }
  }
  // crisis_resource block added if context triggers the crisis keyword list
}
```

**Grading status.** Every du'a record carries `grading_status`: `quranic` (the text is a Quranic verse or clause), `graded` (a hadith grading is recorded), or `not_recorded` (the AskSakina corpus holds no grading for it). Most of the corpus is `not_recorded` today; the `Source` and `Grading` lines say so rather than implying a grading exists. Du'as whose Quranic reference has been verified carry `origin: "quran"` and a `quran_citation`, and their Arabic is the Tanzil Uthmani text resolved from AskSakina's scripture module at bundle time.

### `get_name_of_allah`

Look up by number (1–99) or string (transliteration, Arabic, or English meaning). Returns Arabic, transliteration, locale-aware meaning, reflection, and Quranic references.

**Parameters** — one of:

| Name | Type | Notes |
|---|---|---|
| `number` | `1`..`99` | Primary lookup |
| `name` | `string` | Transliteration, Arabic, or English meaning |

Plus optional `locale`.

**Example response (truncated)**

```jsonc
{
  "_sakina_meta": { "content_type": "name_of_allah" /* … */ },
  "content": {
    "number": 29,
    "arabic": "الحَكَم",
    "transliteration": "Al-Hakam",
    "meaning": "The Judge",
    "reflection": "Allah is the absolute Judge…",
    "quran_references": ["6:114", "13:41"]
  }
}
```

### `find_verses`

Topic lookup beside `get_quran_verse`'s reference lookup (WO#386). The query is normalised and each word is matched to a theme of AskSakina's thematic verse index (anxiety, gratitude, patience, trust, grief, hope, forgiveness, morning, friday, ramadan, encouragement), by theme name or a fixed synonym list. Deterministic: no embedding, no AI call.

Each verse carries `reference` (surah:ayah), `arabic` (the full ayah from the scripture module, Tanzil Uthmani, byte for byte), `translation` (full-ayah Pickthall, fetched as `get_quran_verse` fetches it), the surah names, and a `relevance_note` saying which theme lists it. The note is not commentary. If the upstream is unreachable, the Arabic is still served and `translation` is `null` with a note.

No match returns `content_type: "not_found"` with `verses: []`, `no_results: true` and the list of available themes, not an error. Crisis detection runs first, as on `get_dua`: an abuse disclosure returns `crisis_resource_only` with no verses, and any other crisis keyword returns its block with no verses inferred from the message.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `query` | `string` | yes | Topic or keyword, e.g. `patience`, `grief`, `gratitude` |
| `limit` | `1`..`10` | no, defaults `5` | Number of verses |
| `locale` | `'en'` \| `'id'` \| `'ur'` \| `'ar'` | no, defaults `en` | Selects the in-country crisis resources. Translations are Pickthall English; `ur` and `id` carry the parked-translation note |

### Resource: `sakina://about`

Read this resource **before** using the tools. It contains the seven core directives plus three Gem-cleared educational dawah texts. Most MCP clients fetch it automatically the first time they connect.

---

## Response envelope

Every tool returns the same shape:

```jsonc
{
  "_sakina_meta": {
    "version": "1.0",
    "source": "AskSakina Islamic Knowledge Server (asksakina.com)",
    "content_type": "quran_verse" | "dua_collection" | "name_of_allah" | "not_found" | "crisis_resource_only",
    "disclaimer": "AskSakina provides curated Islamic reference content for educational purposes. …",
    "llm_directives": { "CRITICAL_RULES": ["…"] },
    "presentation_contract": {
      "quran":         { "no_paraphrase": true, "require_citation": "surah:ayah" /* … */ },
      "hadith":        { "require_grading": true, "require_source": true /* … */ },
      "name_of_allah": { "no_paraphrase_arabic": true /* … */ }
    },
    "educational_context": "…"
  },
  "content": { /* tool-specific record */ },
  // get_dua only, when crisis keywords detected:
  "crisis_resource": { "level": "hard" | "soft", "crisis_type": "self-harm" | "abuse", "locale": "…", "directive": "…", "text": "…" }
}
```

The envelope is the contract: `_sakina_meta.presentation_contract` tells the agent how to render the record, `disclaimer` tells the agent what claims it cannot make on its own authority, and `crisis_resource` overrides everything when a user's distress crosses a safety threshold.

---

## Quick start

### Run via npx (no install)

```bash
npx -y @asksakina/islamic-knowledge-mcp
```

The package speaks MCP over stdio out of the box — wire it into any MCP client.

### Connect via remote streamable HTTP

```
https://sakina-mcp.fly.dev/mcp
```

For agents that prefer a hosted endpoint over a local subprocess. Same tools, same envelope, same rate limits.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "sakina": {
      "command": "npx",
      "args": ["-y", "@asksakina/islamic-knowledge-mcp"]
    }
  }
}
```

Restart Claude Desktop. The three tools and the `sakina://about` resource appear in the tool picker.

### Cursor

Add to `~/.cursor/mcp.json` (or workspace `.cursor/mcp.json`):

```jsonc
{
  "mcpServers": {
    "sakina": {
      "command": "npx",
      "args": ["-y", "@asksakina/islamic-knowledge-mcp"]
    }
  }
}
```

### VS Code (with an MCP-aware extension)

Add to `.vscode/mcp.json` in your workspace:

```jsonc
{
  "servers": {
    "sakina-islamic-knowledge": {
      "command": "npx",
      "args": ["-y", "@asksakina/islamic-knowledge-mcp"]
    }
  }
}
```

### Generic MCP client over remote HTTP

```jsonc
{
  "mcpServers": {
    "sakina": {
      "type": "streamable-http",
      "url": "https://sakina-mcp.fly.dev/mcp"
    }
  }
}
```

---

## Use cases

The MCP server is designed for any agent or application that needs curated Islamic source material, returned with explicit instructions to quote it exactly rather than paraphrase it.

- **Build an Islamic chatbot with cited references where recorded.** Pipe `get_quran_verse` and `get_dua` into your conversation flow; the presentation contract instructs the agent to quote exactly and keep gradings attached, and each response states its content type and, for du'as, each record's grading status.
- **Add prayer-time-aware spiritual content to your agent.** Combine the Quranic and du'a tools with a prayer-time API to surface Allah's words at the right moment of the day.
- **Recommend du'as based on user context.** The crisis-keyword filter in `get_dua` handles the dangerous edge cases (self-harm language, abuse) so your assistant is directed not to reply with a generic du'a to a safety-critical message.
- **Answer questions about the 99 Names.** `get_name_of_allah` returns the canonical Arabic, transliteration, meaning, and reflection — plus Quranic references — for both number-based and name-based lookups.
- **Stay theologically inclusive.** The server is designed not to present a contested ruling as the universal answer.

---

## Content integrity

New and changed content is reviewed by AskSakina's "Gem" specialist-AI review chain before shipping. Four of its reviewers gate every Islamic-knowledge release:

1. **Quran & Translation Verification.** Ayah accuracy, surah/ayah citation correctness, hadith grading, source review.
2. **Fiqh Diversity (Multi-Madhab).** Cross-school accuracy, no single-madhab framing on contested topics, inclusive language.
3. **Islamic Psychology & Pastoral Care.** Comfort window safety, crisis filter coverage, no guilt-based motivation.
4. **Explorer / New-to-Islam Accessibility.** Glossing of Arabic terms for non-Muslim audiences, plain-English fiqh, zero-assumed-belief reflections.

Architectural behaviours implemented in code:

- The Unicode prophet salutation (U+FDFA, ﷺ) is replaced with `(peace be upon him)` at every data-loader boundary. The response builder rejects any output containing the symbol.
- Each du'a record carries a `grading_status` (`quranic`, `graded`, `not_recorded`). The `hadith` presentation contract sets `require_grading: true` only when every returned record is graded or Quranic, and `"per_record"` otherwise, so the envelope never claims a grading the data does not hold.
- Crisis keyword detection runs on every `get_dua` request — the same keyword list used by the main app's safety gate.

**Sacred Use License.** This server is distributed under a Sacred Use License (see [LICENSE](./LICENSE)). Permitted uses centre on dawah, education, personal worship, and respectful integration into Muslim-serving applications. The license forbids monetisation that frames Islamic knowledge as scarce or paywalled. A public summary of the license terms lives at `https://www.asksakina.com/en/mcp`.

**Privacy.** See [Privacy & Analytics](#privacy--analytics).

---

## Running locally for development

```bash
cd mcp-server
npm install
npm run bundle-data     # snapshot data from main repo into data/
npm run typecheck       # tsc --noEmit
npm run start           # HTTP server on :3030 via tsx
npm run test:tools      # exercise each tool, prints sample JSON

# Or build + run from compiled output:
npm run build           # tsc -> dist/, postbuild adds shebang + dist/package.json
npm run start:dist      # node dist/server.js
```

`POST /mcp` accepts standard MCP JSON-RPC 2.0. `GET /health` returns `{ "status": "ok", "name", "version" }`.

## Rate limiting

Default: **60 requests per minute per IP**.

- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set → distributed Upstash Redis fixed window.
- Otherwise → in-memory token bucket, per process.

Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. A 429 with code `-32029` is returned on exceed.

## Authentication

v1 ships unauthenticated. An optional `X-Sakina-App-Id` header is accepted but not enforced or logged in v1. This becomes required in v2.

## Privacy & Analytics

This service operates with an aggregate-only, memory-bound data model (implemented in WO#360). For each tool, the server maintains a running count of calls by outcome (`ok`, `not_found`, `error`) and the summed handler time to report operational averages via the `/stats` endpoint.

- **No persistent tracking:** No per-request logs or client identifiers are written to disk or any database by the application.
- **Ephemeral IP handling:** Client IP addresses are used only to enforce the rate limit. Each is held as a rate-limit key in Upstash Redis for the rate-limit window (60 seconds), then expired. If Upstash is unavailable, the in-memory fallback holds it in process memory for the same window, then discards it. Raw IP addresses are never persisted by the application, and never written to logs.
- **No payload logging:** Request parameters (such as `context` values or verse references) and response payloads are never captured or logged.
- **Memory-only retention:** All aggregate counters exist only in RAM and are reset when the server process restarts.

*Regulatory Note (UK GDPR): Because nothing identifiable is held beyond the rate-limit window, there are no records that could be accessed or erased. Note that while the application itself does not persist personal data, our infrastructure provider (Fly.io) transiently processes IP addresses at the edge layer for standard network routing and platform security.*

### `/stats` endpoint

Authenticated summary endpoint:

```bash
curl -H "Authorization: Bearer $MCP_STATS_TOKEN" https://sakina-mcp.fly.dev/stats
```

Requires the `MCP_STATS_TOKEN` env var to be set (otherwise the endpoint returns 503 and refuses to serve unauthenticated). Token comparison is constant-time.

Payload shape:

```json
{
  "privacy": "aggregate-only in-memory counters; no per-request records, no IPs, no user-agents, no client identifiers, no geolocation, no params, no payloads; resets on restart",
  "since": "2026-09-25T…",
  "total_requests": N,
  "by_tool": {
    "get_quran_verse":   { "total": N, "ok": N, "not_found": N, "error": N, "avg_response_ms": N },
    "get_dua":           { "total": N, "ok": N, "not_found": N, "error": N, "avg_response_ms": N },
    "get_name_of_allah": { "total": N, "ok": N, "not_found": N, "error": N, "avg_response_ms": N }
  },
  "rate_limiter": {
    "state": "upstash",
    "upstash_configured": true,
    "upstash_failures": 0,
    "last_failure": null,
    "last_failure_at": null,
    "last_success_at": "2026-09-25T…",
    "startup_check": "Upstash reachable (PING ok, 12 ms); state: upstash"
  },
  "basmala_prefix_mismatch": 0
}
```

`rate_limiter.state` is `upstash` (Upstash answering), `degraded` (Upstash configured but failing: requests are limited by the in-memory fallback, never allowed through) or `memory` (Upstash not configured). Failure reasons carry the HTTP status or error, never a client IP. `basmala_prefix_mismatch` counts ayah-1 texts from the upstream that started with neither recorded basmala form and were served unchanged. It is an aggregate count only; the log line for it carries no verse reference.

### One-time setup on Fly

```bash
fly secrets set MCP_STATS_TOKEN=$(openssl rand -hex 32)
fly deploy
```

The server no longer writes to the `/data` volume that `fly.toml` mounts; it was the log volume before WO#360.

## Data sources

| Tool | Source |
|---|---|
| `get_quran_verse` | `alquran.cloud`, fetched at runtime: Tanzil-derived Uthmani Arabic plus the translation for the locale: `en` and `ar` Pickthall (`en.pickthall`), `ur` and `id` also Pickthall, with a note (their translations are parked pending licences; 1.4.1). A leading byte-order mark is removed. The upstream also prefixes the basmala to ayah 1 of each surah except 1 and 9. Per Gem 2 (the basmala is part of ayah 1 only at 1:1), that exact prefix is removed from ayah 1 of surahs 2–8 and 10–114, matched against the two byte forms the upstream sends. The rest of the ayah is served byte for byte. An unrecognised start is served unchanged and counted in `/stats` (`basmala_prefix_mismatch`). Everything is fetched verse by verse (`/ayah/{surah}:{ayah}`). Saheeh International is not served (removed in 1.2.0, WO#245). Cached in process for 24 h per verse + edition. |
| `get_dua` | AskSakina's du'a corpus (445 entries at 1.4.0), snapshotted from `../src/data/duas` into `data/duas.json` by `npm run bundle-data`. Du'as with a verified Quranic reference take their Arabic from the scripture module (`../src/lib/scripture`, Tanzil Uthmani) at the same step. |
| `get_name_of_allah` | AskSakina's 99 Names, snapshotted from `../src/lib/data/99-names` by `npm run bundle-data`. |
| `find_verses` | AskSakina's thematic verse index (`../src/lib/data/thematic-verses`), snapshotted into `data/thematic-verses.json` by `npm run bundle-data`. Only each verse's reference and themes are taken from the index; the Arabic comes from the scripture module at the same step, and the Pickthall translation from `alquran.cloud` at runtime (same cache as `get_quran_verse`). |

The du'a and Names data are snapshots of the main app's data files, so any update to them lands here on the next `npm run bundle-data` (the deploy workflow runs it). A published package carries the snapshot taken when it was built.

---

## Out of scope for v1

Per the Phase 3 planning doc:

- Semantic search / `search_islamic_guidance` — needs a Gem-reviewed eval set. (`find_verses` is an index lookup, not semantic search.)
- `explain_islamic_concept` — directly conflicts with CLAUDE.md's "AI never gives spiritual/fiqh advice" rule until an Architect-level ruling is made.
- `get_pastoral_guidance` — Gem 3's framing depends on AskSakina-controlled surface; cannot ship via MCP without a separate review.
- `check_halal_ingredient` — blocked on WO#61 restoration.
- HMAC signing enforcement — v1 accepts but ignores the `X-Sakina-App-Id` header.

---

## Deployment

Self-contained at publish time — `npm run bundle-data` snapshots the du'a corpus, the 99 Names, and the canonical safety modules from the main AskSakina monorepo into `data/` and `src/safety/_synced/`. The compiled `dist/` plus the bundled `data/` directory have no runtime dependency on the main app.

`bundle-data` runs automatically via a `prebuild` script (WO#138), so `npm run build` is self-contained on a fresh checkout — no manual bundling step required. The `src/safety/_synced/` directory IS committed to git so any drift from the main-app safety modules shows up in `git diff` between commits.

`docker build` does NOT run `prebuild` (it only copies the `mcp-server/` directory, not the monorepo). Run `npm run bundle-data` on the host before `docker build` so `data/` is populated. The same applies if you build from a fresh clone — `npm install && npm run bundle-data` before `docker build`.

### CI deploy (canonical — WO#249)

All MCP releases go through the **`MCP Server Deploy`** GitHub Actions workflow
(`.github/workflows/mcp-deploy.yml`) — no developer machine holds `flyctl` or npm
auth. The Architect triggers it from the repo **Actions** tab
(`workflow_dispatch`) with two boolean inputs:

- **`deploy_fly`** (default `true`) — build + `flyctl deploy` to `sakina-mcp.fly.dev`.
- **`publish_npm`** (default `true`) — `npm publish` `@asksakina/islamic-knowledge-mcp`.

The job runs the full Gem 10 runbook on `main`: `npm ci` → `npm run bundle-data`
(load-bearing) → `flyctl deploy` → poll `/health` → **live Pickthall byte-check on
2:255** → live Dhun-Nun check → rate-limiter probe (warn only) → **live publish guards** → agent evals (warn only; after the guards since WO#386, so the blocking guards get the rate-limit budget first) → `npm publish` → confirm the registry shows the published version. The
byte-check runs the MCP `initialize` handshake + `tools/call get_quran_verse`
against the live endpoint: `"save Him"` (Pickthall) passes; `"except Him"` (Saheeh
International) or an unreachable `/mcp` **fails the job before `npm publish`**,
dumps `flyctl status` + logs, and prints the manual rollback commands. Secrets
`FLY_API_TOKEN` and `NPM_TOKEN` live in repo settings and are never echoed.

> Automated rollback-to-previous-image is the Gem 10 end-state but is a deferred
> follow-up: the current live image is itself broken, so there is no known-good
> image to auto-restore yet. The first runs are fail-loud + manual rollback only.

### Fly.io (manual / break-glass)

Prefer the CI workflow above. These commands are the underlying mechanics, for a
machine that already has `flyctl` auth:

```bash
cd mcp-server
fly launch              # first time only — picks up fly.toml
fly secrets set \
  UPSTASH_REDIS_REST_URL=... \
  UPSTASH_REDIS_REST_TOKEN=...
npm run bundle-data     # load-bearing: docker build copies host data/
fly deploy
fly status
curl https://<app>.fly.dev/health
```

Production app: `sakina-mcp.fly.dev`. App `sakina-mcp`, region `lhr`, internal port 3030, force HTTPS, healthcheck on `/health` every 30 s, auto-stop on idle, 1 shared CPU, 256 MB RAM.

### Post-deploy verification and rollback

After every `fly deploy`, byte-check one Quran verse from the live endpoint against the locked Pickthall table (`docs/wo-cert/si-pickthall-LOCKED-final.json`) to confirm the translation edition is Pickthall, not Saheeh International:

```bash
curl -s https://sakina-mcp.fly.dev/mcp ... # call get_quran_verse for a known ref
# compare the returned translation to the locked Pickthall text for that ref
```

If the byte-check fails (SI text served, or the translation does not match Pickthall), **roll back first, diagnose second**. Immediately redeploy the previous image before any further investigation or fix:

```bash
fly releases --app sakina-mcp                 # find the last-good release / image
fly deploy --app sakina-mcp --image <previous-image-ref>
```

Do not attempt a forward fix on a live SI regression — restore the known-good image, confirm the byte-check passes on it, then diagnose the bad build offline.

### Local container test

```bash
docker compose up --build
curl http://localhost:3030/health
```

### Other targets

The package is just a Node.js HTTP server, so it runs on any platform that takes a Dockerfile or a Node process: Railway, Render, a small VPS, Cloudflare Workers (with the streamable-http transport), Vercel Functions (with a small adapter). The in-memory rate limiter falls back gracefully when Upstash isn't configured.

---

## npm publishing

Publishing goes through the **`MCP Server Deploy`** workflow (see [CI deploy](#ci-deploy-canonical--wo249)) with `publish_npm: true` — the Architect triggers it from the Actions tab; `NPM_TOKEN` lives in repo settings. The manual equivalent (break-glass, needs local npm auth):

```bash
cd mcp-server
npm login                                    # to the @asksakina org
npm publish --access public
```

`prepublishOnly` runs `bundle-data` → `build` → `test:tools` so the published tarball always contains fresh data and a clean build. The `files` field whitelists `dist/`, `data/`, `README.md`, `LICENSE`, and `.mcp/server.json`.

Verify the published tarball with `npm pack --dry-run` first to see what would ship.

## MCP Registry submission

`mcp-server/.mcp/server.json` declares AskSakina's identity for the official MCP Registry:

- Server name: `com.asksakina/islamic-knowledge`
- Package: `@asksakina/islamic-knowledge-mcp` (npm, stdio transport)
- Remote: `https://sakina-mcp.fly.dev/mcp` (Streamable HTTP)

Publishing flow: the **MCP Registry Publish** GitHub Actions workflow (`.github/workflows/mcp-registry-publish.yml` in the main repository, manual dispatch). It checks that `server.json`, `package.json` and npm agree, then runs:

```bash
mcp-publisher login dns --domain asksakina.com --private-key <KEY>   # or: login http
mcp-publisher publish .mcp/server.json
curl "https://registry.modelcontextprotocol.io/v0/servers?search=com.asksakina"
```

Domain proof for `com.asksakina` is an Ed25519 key: the public half in a DNS TXT record on `asksakina.com` (`v=MCPv1; k=ed25519; p=<base64>`, since May 2026) or at `https://asksakina.com/.well-known/mcp-registry-auth`; the private half in the repository secret `MCP_REGISTRY_PRIVATE_KEY`.

### Smithery re-publish (after a version bump)

Three places carry the version — all bumped together:

1. `package.json` (`"version"`)
2. `mcp-server/.mcp/server.json` (top-level `version` **and** `packages[0].version`)
3. `mcp-server/src/server.ts` (`SERVER_VERSION` constant — surfaces in `/health` and `/.well-known/mcp/server-card.json`)

Re-publish checklist when bumping:

```bash
cd mcp-server
npm run typecheck && npm run test:tools && npm run test:analytics
npm run bundle-data
npm publish                                       # npm registry
mcp-publisher publish .mcp/server.json            # MCP Registry
fly deploy                                        # Smithery scanner picks up the new card via /.well-known/mcp/server-card.json
```

Smithery auto-scans `/.well-known/mcp/server-card.json` and re-indexes within a few minutes — no manual Smithery API call needed.

---

## Links

- **Web:** [asksakina.com](https://www.asksakina.com)
- **MCP showcase:** [asksakina.com/en/mcp](https://www.asksakina.com/en/mcp)
- **MCP registry:** [registry.modelcontextprotocol.io — com.asksakina/islamic-knowledge](https://registry.modelcontextprotocol.io/v0/servers?search=com.asksakina)
- **npm:** [npmjs.com/@asksakina/islamic-knowledge-mcp](https://www.npmjs.com/package/@asksakina/islamic-knowledge-mcp)
- **Source:** [github.com/yserrag/asksakina-mcp](https://github.com/yserrag/asksakina-mcp) (mirror of `mcp-server/` in the main repository)
- **Issues / questions:** [github.com/yserrag/asksakina-mcp/issues](https://github.com/yserrag/asksakina-mcp/issues)
