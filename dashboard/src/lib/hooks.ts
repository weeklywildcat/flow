import * as React from "react"

/** Runs a callback on an interval while the tab is visible, and once when it becomes visible again. */
export function useVisibleInterval(callback: () => void, delay: number) {
  const saved = React.useRef(callback)
  React.useEffect(() => {
    saved.current = callback
  }, [callback])

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") saved.current()
    }
    const id = window.setInterval(tick, delay)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [delay])
}

/** Current time, refreshed on an interval so elapsed durations stay live. */
export function useNow(delay = 30000): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), delay)
    return () => window.clearInterval(id)
  }, [delay])
  return now
}

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}
