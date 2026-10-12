import * as React from "react"
import { toast } from "sonner"

import { apiUrl, get, type Params } from "@/lib/api"
import { useDashboard } from "@/lib/dashboard"
import { useVisibleInterval } from "@/lib/hooks"

// A small stale-while-revalidate cache for staff GET requests. It lives only in this tab's
// memory: nothing is written to disk, and a reload or closed tab starts empty. Every view still
// refetches when it appears, and any change made from the dashboard clears the whole cache, so
// cached data only ever bridges the moment until the fresh response lands.

type Entry = { data: unknown; fetchedAt: number }

const entries = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()
let generation = 0

/** Drops every cached response and ignores any request already in flight. */
export function clearCache() {
  entries.clear()
  inflight.clear()
  generation += 1
}

export function peekCached<T>(route: string, params: Params = {}): T | undefined {
  return entries.get(apiUrl(route, params))?.data as T | undefined
}

/** Fetches fresh data, sharing one request between callers that ask for the same thing at once. */
export function fetchCached<T>(route: string, params: Params = {}): Promise<T> {
  const key = apiUrl(route, params)
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const startedIn = generation
  const request = get<T>(route, params)
    .then((data) => {
      // A response that started before a clear could predate the change that caused it.
      if (startedIn === generation) entries.set(key, { data, fetchedAt: Date.now() })
      return data
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key)
    })
  inflight.set(key, request)
  return request
}

/**
 * Shows the cached response for `route` straight away (or keeps the previous one while new
 * params load), then replaces it with a fresh one. Pass `null` params to skip fetching.
 */
export function useCachedGet<T>(route: string, params: Params | null, options: { refreshMs?: number } = {}) {
  const { dataVersion } = useDashboard()
  const key = params ? apiUrl(route, params) : null
  const paramsRef = React.useRef(params)
  paramsRef.current = params
  const [data, setData] = React.useState<T | undefined>(() => (params ? peekCached<T>(route, params) : undefined))
  const [loading, setLoading] = React.useState(Boolean(params))
  const [error, setError] = React.useState<unknown>(null)
  const activeKey = React.useRef(key)
  activeKey.current = key

  const revalidate = React.useCallback(async () => {
    const requested = activeKey.current
    const requestParams = paramsRef.current
    if (!requested || !requestParams) return
    setLoading(true)
    try {
      const fresh = await fetchCached<T>(route, requestParams)
      if (activeKey.current === requested) {
        setData(fresh)
        setError(null)
      }
    } catch (caught) {
      if (activeKey.current === requested) {
        setError(caught)
        toast.error(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      if (activeKey.current === requested) setLoading(false)
    }
  }, [route])

  React.useEffect(() => {
    if (!key) {
      setLoading(false)
      return
    }
    const cached = entries.get(key)
    if (cached) setData(cached.data as T)
    void revalidate()
  }, [key, dataVersion, revalidate])

  useVisibleInterval(() => {
    if (options.refreshMs) void revalidate()
  }, options.refreshMs ?? 60_000)

  return { data, loading, error, refresh: revalidate }
}
