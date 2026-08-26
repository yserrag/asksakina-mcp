// IP → country/region resolution for MCP analytics (WO#140).
//
// Uses `geoip-lite` (embedded MaxMind GeoLite2 database, ~2 MB, no
// outbound network calls). The IP is resolved once per request and
// only the derived country_code + region are persisted — the raw IP
// is NEVER stored in logs or in memory beyond the function call.
//
// Header priority (Fly.io conventions):
//   1. `Fly-Client-IP`         — set by Fly proxy, single canonical IP
//   2. `X-Forwarded-For`       — first hop before any proxies, comma list
//   3. socket.remoteAddress    — last resort, usually a private IP
//
// Database refresh: GeoIP geography drifts. Run `npm run update-geoip`
// monthly to pull the latest MaxMind snapshot (handled by the
// geoip-lite-update binary the package ships).

import type http from 'node:http'
import geoip from 'geoip-lite'

export interface GeoInfo {
  country_code?: string
  region?: string
}

/**
 * Extract the client IP from the incoming request without retaining it.
 * Returns `undefined` for non-routable addresses (localhost,
 * link-local) so geo lookup short-circuits cleanly in dev / tests.
 */
export function extractClientIp(req: http.IncomingMessage): string | undefined {
  const flyHeader = req.headers['fly-client-ip']
  if (typeof flyHeader === 'string' && flyHeader.trim()) {
    return flyHeader.trim()
  }
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const socket = req.socket?.remoteAddress
  if (socket) return socket
  return undefined
}

/**
 * Resolve an IP to a country code + region label. Returns an empty
 * object for unresolvable IPs (local, private, malformed) so callers
 * can spread the result unconditionally.
 *
 * Never throws — geoip-lite returns `null` for unknown IPs, which we
 * map to the empty result. The IP itself is not retained anywhere.
 */
export function lookupGeo(ip: string | undefined): GeoInfo {
  if (!ip) return {}
  // Strip IPv6-mapped IPv4 prefix ("::ffff:1.2.3.4" → "1.2.3.4")
  // because geoip-lite expects the bare IPv4 form.
  const cleaned = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  try {
    const record = geoip.lookup(cleaned)
    if (!record) return {}
    const country = record.country?.toUpperCase()
    const region = record.region || undefined
    const out: GeoInfo = {}
    if (country && country.length === 2) out.country_code = country
    if (region) out.region = region
    return out
  } catch {
    // geoip-lite throws on invalid IP shapes; treat as unresolvable.
    return {}
  }
}
