import { useEffect, useRef, useState } from 'react'
import { useLiveState } from './useLiveState'
import type { LiveState } from '../api/types'

interface BufferEntry {
  at: number
  data: LiveState
}

// Comfortably more than any realistic stream delay ("a minute or so" per
// the ask this exists for) — trims the buffer, not a hard cap on the delay
// setting itself (see useLiveDelay's own MAX_DELAY_SECONDS for that).
const MAX_BUFFER_MS = 10 * 60 * 1000

export interface DelayedLiveState {
  status: 'loading' | 'success' | 'error'
  data: LiveState | null
  error: string | null
  // Real (undelayed) time of the last successful poll — for the connection
  // status indicator, which needs to answer "is OUR poller healthy right
  // now", a question the artificially-delayed data can't answer on its own.
  lastFetchAt: number | null
}

// Wraps useLiveState with a rolling buffer so the displayed data can lag
// behind the real poll by `delaySeconds` — lets a viewer sync the on-screen
// standings to a web stream that's running behind actual live timing.
export function useDelayedLiveState(griiipSessionId: number | null, delaySeconds: number): DelayedLiveState {
  const live = useLiveState(griiipSessionId)
  const bufferRef = useRef<BufferEntry[]>([])
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)
  const [delayedData, setDelayedData] = useState<LiveState | null>(null)

  useEffect(() => {
    if (!live.data) return
    const now = Date.now()
    setLastFetchAt(now)
    bufferRef.current.push({ at: now, data: live.data })
    const cutoff = now - MAX_BUFFER_MS
    while (bufferRef.current.length > 1 && bufferRef.current[0].at < cutoff) bufferRef.current.shift()
  }, [live.data])

  useEffect(() => {
    function pick() {
      const buffer = bufferRef.current
      if (buffer.length === 0) return
      if (delaySeconds === 0) {
        setDelayedData(buffer[buffer.length - 1].data)
        return
      }
      const target = Date.now() - delaySeconds * 1000
      let chosen = buffer[0]
      for (const entry of buffer) {
        if (entry.at > target) break
        chosen = entry
      }
      setDelayedData(chosen.data)
    }
    pick()
    // Real-time tick independent of the 2s poll cadence, so the displayed
    // data advances smoothly through the buffer rather than jumping only
    // when a new poll happens to land.
    const timer = setInterval(pick, 1000)
    return () => clearInterval(timer)
  }, [delaySeconds, live.data])

  return {
    status: live.status,
    data: delaySeconds > 0 ? delayedData : live.data,
    error: live.error,
    lastFetchAt,
  }
}
