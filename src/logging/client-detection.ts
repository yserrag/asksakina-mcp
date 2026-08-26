// MCP client identification from User-Agent strings (WO#140).
//
// Different MCP clients send different UA shapes. We classify each
// request into a stable bucket so `/stats` can show "Claude Desktop:
// 60%, Cursor: 25%, Cline: 10%, other: 5%" without exposing the raw
// UA noise. The raw UA is also persisted (truncated) so the Architect
// can spot a new client and extend the matcher list.
//
// Matchers are case-insensitive substring tests. The first matching
// bucket wins. Ordering reflects rough market share so the cheap path
// hits first; add new clients to the front rather than the back when
// they grow.

export type ClientName =
  | 'claude-desktop'
  | 'claude-code'
  | 'cursor'
  | 'cline'
  | 'continue'
  | 'zed'
  | 'windsurf'
  | 'mcp-inspector'
  | 'sdk-typescript'
  | 'sdk-python'
  | 'curl'
  | 'browser'
  | 'unknown'

const MATCHERS: Array<{ name: ClientName; needle: string }> = [
  { name: 'claude-desktop', needle: 'claude-desktop' },
  { name: 'claude-desktop', needle: 'claudedesktop' },
  { name: 'claude-code', needle: 'claude-code' },
  { name: 'claude-code', needle: 'claudecode' },
  { name: 'cursor', needle: 'cursor' },
  { name: 'cline', needle: 'cline' },
  { name: 'continue', needle: 'continue.dev' },
  { name: 'continue', needle: 'continuedev' },
  { name: 'zed', needle: 'zed' },
  { name: 'windsurf', needle: 'windsurf' },
  { name: 'mcp-inspector', needle: 'mcp-inspector' },
  { name: 'mcp-inspector', needle: 'inspector' },
  { name: 'sdk-typescript', needle: '@modelcontextprotocol/sdk' },
  { name: 'sdk-typescript', needle: 'node-fetch' },
  { name: 'sdk-python', needle: 'python-httpx' },
  { name: 'sdk-python', needle: 'python-requests' },
  { name: 'sdk-python', needle: 'mcp-python' },
  { name: 'curl', needle: 'curl/' },
  { name: 'browser', needle: 'mozilla/' },
]

const MAX_UA_CHARS = 200

export function classifyClient(userAgent: string | undefined): ClientName {
  if (!userAgent) return 'unknown'
  const lower = userAgent.toLowerCase()
  for (const { name, needle } of MATCHERS) {
    if (lower.includes(needle)) return name
  }
  return 'unknown'
}

/**
 * Truncate the raw UA before logging. The full string is occasionally
 * useful for spotting a new client to add to the matcher list, but
 * we cap it so a pathological UA can't blow up the log files.
 */
export function sanitiseUserAgent(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined
  const trimmed = userAgent.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, MAX_UA_CHARS)
}
