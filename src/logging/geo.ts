// Client-IP extraction for the MCP rate limiter.
//
// WO#360 — geolocation lookup (the `geoip-lite` MaxMind path that once
// derived country_code / region for the per-request log) was removed
// along with per-request logging. Only the IP extraction below remains,
// and it is used solely for the per-IP rate decision; the IP is not
// stored anywhere.
//
// Header priority (Fly.io conventions):
//   1. `Fly-Client-IP`         — set by Fly proxy, single canonical IP
//   2. `X-Forwarded-For`       — first hop before any proxies, comma list
//   3. socket.remoteAddress    — last resort, usually a private IP

import type http from 'node:http'

/**
 * Extract the client IP from the incoming request without retaining it.
 * Returns `undefined` for non-routable addresses (localhost,
 * link-local) so the caller can fall back cleanly in dev / tests.
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
