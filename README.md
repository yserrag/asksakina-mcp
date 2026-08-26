# AskSakina Islamic Knowledge MCP Server

[![npm version](https://img.shields.io/npm/v/@asksakina/islamic-knowledge-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@asksakina/islamic-knowledge-mcp)
[![License](https://img.shields.io/badge/license-Sacred%20Use-8B6A42.svg?style=flat-square)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP-com.asksakina%2Fislamic--knowledge-4A6B4A.svg?style=flat-square)](https://registry.modelcontextprotocol.io/v0/servers?search=com.asksakina)

> **Scholar-reviewed Islamic knowledge for AI agents.** Quranic verses, authenticated du'as, and the 99 Names of Allah — verified across the four mainstream Sunni schools (Hanafi, Maliki, Shafi'i, Hanbali). Every response is wrapped in a presentation contract so agents cannot silently misrepresent the content.

**Architectural posture:** *"AskSakina ships records, agents ship answers."* The server is a reference library, not an advisor. Each response includes a `_sakina_meta` envelope with disclaimer, LLM directives, presentation contract, and educational context. What the calling agent does with the record is its responsibility — but every response arms the agent with enough structural context to make mishandling difficult and trackable.

---

## What it provides

Three lookup tools and one canonical resource over the Model Context Protocol. Every record is sourced from AskSakina's main app (`asksakina.com`), so the MCP server can never drift from what the public app surfaces.

| Tool | What it does |
|---|---|
| `get_quran_verse` | Verbatim Quranic verse lookup by surah:ayah |
| `get_dua` | Authenticated du'a lookup by life context (anxiety, grief, morning, travel, ...) |
| `get_name_of_allah` | One of the 99 Names by number (1–99) or string |
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
| `locale` | `'en'` \| `'id'` \| `'ur'` | no, defaults `en` | Translation language |

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

Returns du'as matching a life context (anxiety, grief, morning, travel, etc.). Context is resolved against canonical category slugs, an alias map, and tag dimensions. **If the context contains a crisis keyword (matched against the main app's `detectCrisis` keyword list), the response includes a mandatory `crisis_resource` block** with the appropriate hotline and prosocial directive.

**Parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `context` | `string` | yes | Free-form life context |
| `locale` | `'en'` \| `'id'` \| `'ur'` \| `'ar'` | no, defaults `en` | Translation language |

**Example response (truncated)**

```jsonc
{
  "_sakina_meta": { "content_type": "dua_collection" /* … */ },
  "content": {
    "category": "anxiety",
    "duas": [
      {
        "arabic": "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ …",
        "transliteration": "Allahumma inni a'udhu bika minal-hammi wal-hazan …",
        "translation": "O Allah, I seek refuge in You from grief and sadness …",
        "source": "Sahih al-Bukhari 2893"
      }
      /* … */
    ]
  }
  // crisis_resource block added if context triggers the crisis keyword list
}
```

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
    "content_type": "quran_verse" | "dua_collection" | "name_of_allah" | "not_found",
    "disclaimer": "AskSakina provides verified Islamic reference content for educational purposes. …",
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
  "crisis_resource": { "directive": "…", "text": "…" }
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

The MCP server is designed for any agent or application that needs verified Islamic source material with a hard guarantee against silent misrepresentation.

- **Build an Islamic chatbot with verified sources.** Pipe `get_quran_verse` and `get_dua` into your conversation flow; the presentation contract keeps the agent honest about what is direct revelation, what is hadith with a grading, and what is editorial reflection.
- **Add prayer-time-aware spiritual content to your agent.** Combine the Quranic and du'a tools with a prayer-time API to surface Allah's words at the right moment of the day.
- **Recommend du'as based on user context.** The crisis-keyword filter in `get_dua` handles the dangerous edge cases (self-harm language, abuse) so your assistant never replies with a generic du'a to a safety-critical message.
- **Answer questions about the 99 Names.** `get_name_of_allah` returns the canonical Arabic, transliteration, meaning, and reflection — plus Quranic references — for both number-based and name-based lookups.
- **Stay theologically inclusive.** Every record is reviewed across Hanafi, Maliki, Shafi'i, and Hanbali positions. The server never positions a contested ruling as the universal answer.

---

## Content integrity

Every piece of content surfaced by this server has been reviewed by AskSakina's "Gem" specialist-AI review chain before shipping. The chain has nine reviewers; four of them gate every Islamic-knowledge release:

1. **Quran & Translation Verification.** Ayah accuracy, surah/ayah citation correctness, hadith grading, source authentication.
2. **Fiqh Diversity (Multi-Madhab).** Cross-school accuracy, no single-madhab framing on contested topics, inclusive language.
3. **Islamic Psychology & Pastoral Care.** Comfort window safety, crisis filter coverage, no guilt-based motivation.
4. **Explorer / New-to-Islam Accessibility.** Glossing of Arabic terms for non-Muslim audiences, plain-English fiqh, zero-assumed-belief reflections.

Architectural guarantees enforced in code:

- The Unicode prophet salutation (U+FDFA, ﷺ) is replaced with `(peace be upon him)` at every data-loader boundary. The response builder rejects any output containing the symbol.
- Hadith grading is paired with each du'a record; the `hadith` presentation contract asserts `require_grading: true`.
- Crisis keyword detection runs on every `get_dua` request — the same keyword list used by the main app's safety gate.

**Sacred Use License.** This server is distributed under a Sacred Use License (see [LICENSE](./LICENSE)). Permitted uses centre on dawah, education, personal worship, and respectful integration into Muslim-serving applications. The license forbids monetisation that frames Islamic knowledge as scarce or paywalled. A public summary of the license terms lives at `https://www.asksakina.com/en/mcp`.

**Privacy.** No tracking. No analytics. No request logging beyond rate-limit counters. The server records the IP for the rate-limit window only; nothing else is persisted.

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

## Analytics (1.2.0)

Every tool call is logged as a single JSONL line:

```jsonc
{
  "ts": "2026-05-17T11:00:00.000Z",
  "tool": "get_dua",
  "params": { "context": "anxiety", "locale": "en" },
  "status": "ok",
  "duration_ms": 42,
  "response_time_ms": 42,
  "error": false,
  "country_code": "GB",        // ISO 3166-1 alpha-2, from geoip-lite
  "region": "England",         // when MaxMind has it
  "client": "claude-desktop",  // classified bucket
  "user_agent": "Claude-Desktop/1.2.3"  // truncated, 200 char cap
}
```

**No raw IP addresses are ever persisted.** The client IP is resolved once per request to (a) key the rate-limiter and (b) look up country / region via the embedded MaxMind GeoLite2 database, then discarded. The full User-Agent is stored (truncated) so we can spot a new MCP client and extend the classifier; the `client` bucket is what `/stats` aggregates.

The `context` parameter on `get_dua` is a category keyword per tool contract ("anxiety", "morning", "grief") and is logged (200-char cap) so we can answer "which life situations do agents query most" without ever associating it with a person.

Logs land in `LOG_DIR` (default `/data/logs`, persisted on a Fly volume). One file per UTC day: `requests-YYYY-MM-DD.jsonl`. Writes are fire-and-forget — disk slowness never bleeds into tool response latency.

### Updating the GeoIP database

`geoip-lite` ships an embedded MaxMind GeoLite2 snapshot. Geography drifts, so refresh monthly:

```bash
cd mcp-server
MAXMIND_LICENSE_KEY=<key> npm run update-geoip
```

A free MaxMind license key is required (sign up at maxmind.com/en/geolite2/signup). After running, rebuild + redeploy so the new DB ships with the container. The bundled DB at install time is sufficient for an initial launch.

### `/stats` endpoint

Authenticated summary endpoint:

```bash
curl -H "Authorization: Bearer $MCP_STATS_TOKEN" https://sakina-mcp.fly.dev/stats
```

Requires the `MCP_STATS_TOKEN` env var to be set (otherwise the endpoint returns 503 — refuses to serve unauthenticated). Token comparison is constant-time.

Payload shape:

```json
{
  "generated_at": "2026-05-17T...",
  "log_dir": "/data/logs",
  "totals":   { "all_time": N, "last_7d": N, "last_24h": N },
  "by_tool":  { "get_quran_verse": {...}, "get_dua": {...}, "get_name_of_allah": {...} },
  "by_status": { "ok": N, "not_found": N, "error": N },
  "error_rate": { "all_time": 0.0, "last_7d": 0.0, "last_24h": 0.0 },
  "avg_response_time_ms": {
    "all_time": 42.1, "last_7d": 41.8, "last_24h": 39.5,
    "by_tool": { "get_quran_verse": {...}, "get_dua": {...}, "get_name_of_allah": {...} }
  },
  "top_contexts": [{ "context": "anxiety", "count": N }, ...],
  "top_verses":   [{ "ref": "2:255",      "count": N }, ...],
  "by_country": {
    "last_7d":  [{ "country_code": "GB", "count": N }, ...],
    "all_time": [{ "country_code": "GB", "count": N }, ...]
  },
  "by_client": {
    "last_7d":  { "claude-desktop": N, "cursor": N, ... },
    "all_time": { "claude-desktop": N, "cursor": N, ... }
  },
  "popular_topics": [
    { "kind": "dua_context", "key": "anxiety", "count": N },
    { "kind": "quran_verse", "key": "2:255", "count": N },
    ...
  ],
  "oldest_entry": "...",
  "newest_entry": "..."
}
```

### One-time setup on Fly

```bash
fly volumes create mcp_logs --region lhr --size 1
fly secrets set MCP_STATS_TOKEN=$(openssl rand -hex 32)
fly deploy
```

The volume auto-mounts at `/data` on every subsequent deploy (see `fly.toml [mounts]`).

## Data sources

| Tool | Source |
|---|---|
| `get_quran_verse` | `alquran.cloud` (Tanzil-derived Uthmani Arabic + Saheeh International / Jalandhri / Indonesian MoRA translations). Same upstream the main AskSakina app uses. Cached in process for 24 h per verse + edition. |
| `get_dua` | Direct import of AskSakina's 444-entry du'a corpus from `../src/data/duas`. |
| `get_name_of_allah` | Direct import of AskSakina's 99 Names from `../src/lib/data/99-names`. |

The two direct-imported sources mean the MCP server cannot drift from what the AskSakina app surfaces. Any update to the main repo's data files automatically lands here on the next `npm run bundle-data`.

---

## Out of scope for v1

Per the Phase 3 planning doc:

- Semantic search / `search_islamic_guidance` — needs a Gem-reviewed eval set.
- `explain_islamic_concept` — directly conflicts with CLAUDE.md's "AI never gives spiritual/fiqh advice" rule until an Architect-level ruling is made.
- `get_pastoral_guidance` — Gem 3's framing depends on AskSakina-controlled surface; cannot ship via MCP without a separate review.
- `check_halal_ingredient` — blocked on WO#61 restoration.
- HMAC signing enforcement — v1 accepts but ignores the `X-Sakina-App-Id` header.

---

## Deployment

Self-contained at publish time — `npm run bundle-data` snapshots the du'a corpus, the 99 Names, and the canonical safety modules from the main AskSakina monorepo into `data/` and `src/safety/_synced/`. The compiled `dist/` plus the bundled `data/` directory have no runtime dependency on the main app.

> **This public repo ships source only.** The bundled `data/*.json` are build artifacts generated at release time (`npm run bundle-data` on publish); they are not committed here.

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
2:255** → `npm publish` → confirm the registry shows the published version. The
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

Publishing flow:

```bash
mcp-publisher login http --domain asksakina.com --private-key <KEY>
mcp-publisher publish .mcp/server.json
curl "https://registry.modelcontextprotocol.io/v0/servers?search=com.asksakina"
```

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
- **Source:** [github.com/yserrag/asksakina-mcp](https://github.com/yserrag/asksakina-mcp)
- **Issues / questions:** [github.com/yserrag/asksakina-mcp/issues](https://github.com/yserrag/asksakina-mcp/issues)
