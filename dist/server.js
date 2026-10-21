#!/usr/bin/env node
import http from 'node:http';
import { SERVER_INSTRUCTIONS } from './contracts/instructions.js';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GET_QURAN_VERSE_DESCRIPTION, GET_QURAN_VERSE_TITLE, getQuranVerseShape, getQuranVerseHandler, } from './tools/get-quran-verse.js';
import { GET_DUA_DESCRIPTION, GET_DUA_TITLE, getDuaShape, getDuaHandler, } from './tools/get-dua.js';
import { GET_NAME_DESCRIPTION, GET_NAME_TITLE, getNameOfAllahShape, getNameOfAllahHandler, } from './tools/get-name-of-allah.js';
import { FIND_VERSES_DESCRIPTION, FIND_VERSES_TITLE, findVersesShape, findVersesHandler, } from './tools/find-verses.js';
import { ABOUT_RESOURCE_BODY } from './contracts/educational.js';
import { AUDIENCE_JSON_SCHEMA } from './teach/audience.js';
import { RATE_LIMIT_BUDGET, RATE_LIMIT_WINDOW_MS, getRateLimiter, probeRateLimiter, } from './safety/rate-limiter.js';
import { serialiseResponse } from './meta/response-builder.js';
import { logRequest } from './logging/request-logger.js';
import { handleStatsRequest } from './logging/stats.js';
import { enableDailyStore } from './logging/daily-store.js';
import { extractClientIp } from './logging/geo.js';
const SERVER_NAME = 'sakina-islamic-knowledge';
const SERVER_VERSION = '2.2.0';
const SERVER_DESCRIPTION = "Curated Islamic knowledge from AskSakina (asksakina.com). Provides Quranic verses, a curated du'a corpus (supplications), and the 99 Names of Allah. New and changed content is reviewed through AskSakina's specialist-AI review chain for theological accuracy across mainstream Sunni schools; this structured AI review is not a substitute for a qualified scholar.";
const SERVER_CARD = {
    schemaVersion: '2025-07-09',
    name: 'com.asksakina/islamic-knowledge',
    displayName: 'AskSakina Islamic Knowledge',
    description: SERVER_DESCRIPTION,
    version: SERVER_VERSION,
    homepage: 'https://www.asksakina.com/en/mcp',
    repository: 'https://github.com/yserrag/asksakina-mcp',
    license: 'Sacred Use',
    publisher: {
        name: 'AskSakina',
        url: 'https://www.asksakina.com',
    },
    transport: {
        type: 'streamable-http',
        url: 'https://sakina-mcp.fly.dev/mcp',
    },
    packages: [
        {
            registryType: 'npm',
            identifier: '@asksakina/islamic-knowledge-mcp',
            transport: 'stdio',
            packageArguments: [{ type: 'positional', value: '--stdio' }],
        },
    ],
    tools: [
        {
            name: 'get_quran_verse',
            description: GET_QURAN_VERSE_DESCRIPTION,
            inputSchema: {
                type: 'object',
                properties: {
                    surah: { type: 'integer', minimum: 1, maximum: 114, description: 'Surah number, 1-114' },
                    ayah: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 286,
                        description: 'Ayah (verse) number within the surah',
                    },
                    locale: {
                        type: 'string',
                        enum: ['en', 'id', 'ur', 'ar'],
                        description: 'Translation locale; defaults to "en" (Pickthall).',
                    },
                    audience: AUDIENCE_JSON_SCHEMA,
                },
                required: ['surah', 'ayah'],
            },
        },
        {
            name: 'get_dua',
            description: GET_DUA_DESCRIPTION,
            inputSchema: {
                type: 'object',
                properties: {
                    context: { type: 'string', description: 'Free-form life context. Send this or id, not both.' },
                    id: {
                        type: 'string',
                        pattern: '^[A-Za-z0-9-]{3,40}$',
                        description: "A du'a id from a related reference in an earlier response. Send this or context, not both.",
                    },
                    locale: {
                        type: 'string',
                        enum: ['en', 'id', 'ur', 'ar'],
                        description: 'Translation locale; defaults to "en".',
                    },
                    audience: AUDIENCE_JSON_SCHEMA,
                },
            },
        },
        {
            name: 'get_name_of_allah',
            description: GET_NAME_DESCRIPTION,
            inputSchema: {
                type: 'object',
                properties: {
                    number: { type: 'integer', minimum: 1, maximum: 99, description: 'Name number, 1-99' },
                    name: {
                        type: 'string',
                        description: 'Transliteration, Arabic, or English meaning',
                    },
                    locale: {
                        type: 'string',
                        enum: ['en', 'id', 'ur', 'ar'],
                        description: 'Translation locale; defaults to "en".',
                    },
                    audience: AUDIENCE_JSON_SCHEMA,
                },
            },
        },
        {
            name: 'find_verses',
            description: FIND_VERSES_DESCRIPTION,
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: "Topic or keyword, e.g. 'patience', 'grief', 'gratitude'" },
                    limit: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 10,
                        description: 'Number of verses to return; default 5, max 10',
                    },
                    locale: {
                        type: 'string',
                        enum: ['en', 'id', 'ur', 'ar'],
                        description: 'Selects in-country crisis resources if needed; defaults to "en".',
                    },
                    audience: AUDIENCE_JSON_SCHEMA,
                },
                required: ['query'],
            },
        },
    ],
    resources: [
        {
            uri: 'sakina://about',
            description: "Read-once briefing on the server's seven core directives and three educational dawah texts (Quran preservation, hadith grading, madhab attribution). Agents should fetch this resource before using the tools.",
        },
    ],
    capabilities: {
        rateLimit: {
            requestsPerWindow: 60,
            windowSeconds: 60,
            perIp: true,
        },
        privacy: {
            tracking: 'none',
            analytics: 'aggregate-only',
            logging: 'aggregate counters only: per-tool call and status totals. No per-request records, no IPs, no client identifiers, no user-agents, no geolocation, no params, no response payloads. Since-start totals reset on restart; on the hosted server, per-tool daily totals are kept on disk for at most 90 days.',
        },
    },
};
function withLogging(tool, handler) {
    return async (args) => {
        const start = performance.now();
        let status = 'ok';
        try {
            const response = await handler(args);
            if (response._sakina_meta?.content_type === 'not_found') {
                status = 'not_found';
            }
            return { content: [{ type: 'text', text: serialiseResponse(response) }] };
        }
        catch (err) {
            status = 'error';
            throw err;
        }
        finally {
            logRequest({ tool, status, duration_ms: performance.now() - start });
        }
    };
}
export function createMcpServer() {
    const server = new McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        description: SERVER_DESCRIPTION,
    }, { instructions: SERVER_INSTRUCTIONS });
    server.registerTool(GET_QURAN_VERSE_TITLE, {
        title: GET_QURAN_VERSE_TITLE,
        description: GET_QURAN_VERSE_DESCRIPTION,
        inputSchema: getQuranVerseShape,
    }, withLogging('get_quran_verse', getQuranVerseHandler));
    server.registerTool(GET_DUA_TITLE, {
        title: GET_DUA_TITLE,
        description: GET_DUA_DESCRIPTION,
        inputSchema: getDuaShape,
    }, withLogging('get_dua', getDuaHandler));
    server.registerTool(GET_NAME_TITLE, {
        title: GET_NAME_TITLE,
        description: GET_NAME_DESCRIPTION,
        inputSchema: getNameOfAllahShape,
    }, withLogging('get_name_of_allah', getNameOfAllahHandler));
    server.registerTool(FIND_VERSES_TITLE, {
        title: FIND_VERSES_TITLE,
        description: FIND_VERSES_DESCRIPTION,
        inputSchema: findVersesShape,
    }, withLogging('find_verses', findVersesHandler));
    server.registerResource('about', 'sakina://about', {
        title: 'About the AskSakina Islamic Knowledge Server',
        description: 'Core directives + the three Gem-cleared educational texts (Quran preservation, hadith grading, madhab attribution). Read this resource before using the tools.',
        mimeType: 'text/markdown',
    }, async () => ({
        contents: [
            {
                uri: 'sakina://about',
                mimeType: 'text/markdown',
                text: ABOUT_RESOURCE_BODY,
            },
        ],
    }));
    return server;
}
async function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (!body)
                return resolve(undefined);
            try {
                resolve(JSON.parse(body));
            }
            catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}
function resolveClientIp(req) {
    return extractClientIp(req) ?? 'unknown';
}
export async function startHttpServer(port = Number(process.env.PORT ?? 3030)) {
    const limiter = getRateLimiter();
    if (process.env.MCP_USAGE_DIR)
        enableDailyStore(process.env.MCP_USAGE_DIR);
    await probeRateLimiter().catch((err) => console.error('[rate-limiter] startup check threw:', err instanceof Error ? err.message : String(err)));
    const server = http.createServer(async (req, res) => {
        if (!req.url) {
            res.writeHead(400).end();
            return;
        }
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', name: SERVER_NAME, version: SERVER_VERSION }));
            return;
        }
        if (req.method === 'GET' && req.url === '/.well-known/mcp/server-card.json') {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(SERVER_CARD));
            return;
        }
        if (await handleStatsRequest(req, res))
            return;
        if (req.url !== '/mcp') {
            res.writeHead(404).end();
            return;
        }
        const ip = resolveClientIp(req);
        let rate;
        try {
            rate = await limiter.check(ip);
        }
        catch (err) {
            console.error('[mcp] rate-limiter threw, failing open:', err instanceof Error ? err.message : String(err));
            rate = { allowed: true, remaining: RATE_LIMIT_BUDGET, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS };
        }
        res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_BUDGET));
        res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.floor(rate.resetAt / 1000)));
        if (!rate.allowed) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: {
                    code: -32029,
                    message: "Rate limit exceeded. AskSakina's knowledge is freely available; please pace your requests.",
                },
            }));
            return;
        }
        let body;
        if (req.method === 'POST') {
            try {
                body = await readJsonBody(req);
            }
            catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { code: -32700, message: 'Parse error: invalid JSON' } }));
                return;
            }
        }
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        const mcp = createMcpServer();
        res.on('close', () => {
            transport.close().catch(() => { });
        });
        try {
            await mcp.connect(transport);
            await transport.handleRequest(req, res, body);
        }
        catch (err) {
            console.error('[mcp] handler error:', err);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { code: -32603, message: 'Internal server error' } }));
            }
        }
    });
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`[sakina-mcp] listening on :${port} (rate-limit ${RATE_LIMIT_BUDGET}/${RATE_LIMIT_WINDOW_MS / 1000}s per IP)`);
            resolve(server);
        });
    });
}
export async function startStdioServer() {
    console.log = (...args) => console.error(...args);
    const server = createMcpServer();
    await server.connect(new StdioServerTransport());
    console.error('[sakina-mcp] serving MCP over stdio');
    return server;
}
export function isEntryPoint(entry = process.argv[1], moduleUrl = import.meta.url) {
    if (!entry)
        return false;
    if (entry.endsWith('server.ts'))
        return true;
    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
    }
    catch {
        return false;
    }
}
if (isEntryPoint()) {
    const start = process.argv.includes('--stdio') ? startStdioServer() : startHttpServer();
    start.catch((err) => {
        console.error('[sakina-mcp] failed to start:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map