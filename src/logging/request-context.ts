// Per-request context propagation for the MCP server analytics (WO#140).
//
// The MCP tool handlers don't see the underlying HTTP request — the
// SDK transport hides it. To attach country / client / user-agent
// metadata to each log entry we use AsyncLocalStorage: the HTTP
// dispatcher resolves the per-request context (from headers + geoip)
// once, then runs the transport's handler inside `requestContext.run`.
// The `withLogging` wrapper later reads the context via
// `getRequestContext()` and merges it into the log entry.
//
// Why AsyncLocalStorage and not a tool-arg pass-through:
//   - Tool handlers receive validated MCP args; we don't want to bolt
//     a `_context` field onto every tool's input schema.
//   - The SDK's request lifecycle is opaque to us; ALS is exactly the
//     mechanism Node provides for this case.
//   - Context is read-only inside the tool handler and never crosses
//     the wire.
//
// Privacy: the raw IP is INTENTIONALLY not part of the context. We
// resolve it in the HTTP dispatcher (for rate-limit + geoip lookup)
// and discard it. Only the derived country_code / region survive.

import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  country_code?: string
  region?: string
  client?: string
  user_agent?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}
