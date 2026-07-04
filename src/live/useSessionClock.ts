import { useEffect, useState } from 'react'
import type { SessionClock } from '../api/types'

// The feed has no live "remaining time"/countdown push, so this still ticks
// locally off the browser's own clock — but the backend now keeps
// clock.start_time synced against the live session-clock channel (see
// app/live/state.py's _handle_session_clock), correcting for a session that
// actually started later than the bootstrap originally said. Re-keying the
// effect on start_time means a correction resets the local tick cleanly.
//
// `delaySeconds` shifts "now" back by the same amount the stream-delay
// widget holds the standings/lap data back by — without this, the clock
// keeps ticking in real time while the rest of the screen is showing a
// moment from `delaySeconds` ago, so the two visibly disagree (e.g. the
// clock reads 12:34 while the leaderboard is still mid-lap for 12:32).
export function useSessionClock(
  clock: SessionClock | null,
  delaySeconds = 0,
): { elapsedSeconds: number | null; remainingSeconds: number | null } {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!clock?.start_time) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [clock?.start_time])

  if (!clock?.start_time) return { elapsedSeconds: null, remainingSeconds: null }

  const startMs = new Date(clock.start_time).getTime()
  const elapsedSeconds = Math.max(0, (now - delaySeconds * 1000 - startMs) / 1000)
  const remainingSeconds = clock.time_limit_seconds != null ? Math.max(0, clock.time_limit_seconds - elapsedSeconds) : null

  return { elapsedSeconds, remainingSeconds }
}
