import { useEffect, useState } from 'react'
import type { SessionClock } from '../api/types'

// The feed has no live "remaining time" push (confirmed against a real
// session-clock channel message — it only carries elapsedTimeMillis), so
// this ticks locally off the browser's own clock against the session's
// known start time + limit from the bootstrap.
export function useSessionClock(clock: SessionClock | null): { elapsedSeconds: number | null; remainingSeconds: number | null } {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!clock?.start_time) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [clock?.start_time])

  if (!clock?.start_time) return { elapsedSeconds: null, remainingSeconds: null }

  const startMs = new Date(clock.start_time).getTime()
  const elapsedSeconds = Math.max(0, (now - startMs) / 1000)
  const remainingSeconds = clock.time_limit_seconds != null ? Math.max(0, clock.time_limit_seconds - elapsedSeconds) : null

  return { elapsedSeconds, remainingSeconds }
}
