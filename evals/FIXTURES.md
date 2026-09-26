# Test fixtures: recorded alquran.cloud responses

The files under `evals/fixtures/` are **raw HTTP response bodies from the
alquran.cloud API, recorded byte for byte**. They are used only to test this
server offline: the `test:tools` basmala and verse checks and
`npm run eval -- --fixture`. They are not served by the MCP server, and they
are not part of the npm package or the Docker image.

## Source

| Directory | Endpoint | Recorded |
|---|---|---|
| `alquran-ayah1/{1..114}.json` | `https://api.alquran.cloud/v1/ayah/{surah}:1/editions/quran-uthmani,en.pickthall` (ayah 1 of every surah) | 2026-09-25T20:18:29Z, GitHub Actions run 36184881437 |
| `alquran-verses/2_286.json` | `https://api.alquran.cloud/v1/ayah/2:286/editions/quran-uthmani,en.pickthall` | 2026-09-25T20:20:03Z, GitHub Actions run 36185119553 |

- This is the same verse endpoint the server calls at runtime: one ayah per request, Arabic plus one translation.
- Each directory has a `SHA256SUMS` file (`sha256sum -c SHA256SUMS`) and a `RECORDED` note.
- The bodies are unmodified, including what the upstream itself adds: the basmala prefixed to ayah 1 of surahs other than 1 and 9, and a byte-order mark on 1:1. The server strips both at runtime (see the CHANGELOG, 1.4.1). The fixtures keep them, so the tests can prove it.

## What the text is

- **Arabic** (`quran-uthmani` edition): the upstream's Uthmani text of the Quran, as alquran.cloud serves it. It is reproduced here only as test data and must not be edited. The byte order of the diacritics (shadda before the vowel mark) is the upstream's own, and the tests depend on it.
- **English** (`en.pickthall` edition): Mohammed Marmaduke Pickthall's translation of the meaning, as alquran.cloud serves it.

## Attribution

- **Quran text (Uthmani):** Quran text © Tanzil Project, https://tanzil.net, Creative Commons Attribution 3.0. alquran.cloud's Uthmani edition is Tanzil-derived. This notice is the one AskSakina already carries for the Tanzil text (`public/quran/manifest.json`, `docs/SOURCES.md`).
- **Translation:** Pickthall, *The Meaning of the Glorious Koran* (1930), served by alquran.cloud. AskSakina treats it as public domain (WO#245).
- **API:** responses from the AlQuran Cloud API, https://alquran.cloud.

**Not verified from the builder session:** alquran.cloud's own terms of use and Tanzil's current licence page could not be fetched (both hosts are outside the build sandbox's network policy). The notices above are carried forward from the repository's existing attribution, not re-checked. Anyone relying on them for redistribution should confirm them at https://alquran.cloud/terms-and-conditions and https://tanzil.net/docs/text_license.
