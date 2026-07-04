import { useCallback, useEffect, useRef, useState } from 'react'
import { getLiveSessions } from '../api/client'
import type { LiveSessionSummary } from '../api/types'

const POLL_INTERVAL_SECONDS = 30

// Like useLiveSessions (the sidebar's quiet background poller), but exposes
// the poll cadence itself — a countdown to the next automatic check, and a
// manual "retry now" escape hatch — for a page whose whole point is
// actively waiting for a session to appear rather than a passive presence
// indicator.
export function useLiveSessionsPoll() {
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([])
  const [secondsUntilNextPoll, setSecondsUntilNextPoll] = useState(POLL_INTERVAL_SECONDS)
  const [loading, setLoading] = useState(true)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNow = useCallback(async () => {
    try {
      const data = await getLiveSessions()
      setSessions(data.filter((s) => !s.session_ended))
    } catch {
      // Best-effort — leave whatever we last had rather than flashing empty.
    } finally {
      setLoading(false)
      setSecondsUntilNextPoll(POLL_INTERVAL_SECONDS)
    }
  }, [])

  // Manual retry restarts the poll cadence from zero too, so clicking it
  // doesn't leave a stale countdown ticking down to an already-superseded check.
  const retryNow = useCallback(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    fetchNow()
    pollTimerRef.current = setInterval(fetchNow, POLL_INTERVAL_SECONDS * 1000)
  }, [fetchNow])

  useEffect(() => {
    fetchNow()
    pollTimerRef.current = setInterval(fetchNow, POLL_INTERVAL_SECONDS * 1000)
    const countdownTimer = setInterval(() => {
      setSecondsUntilNextPoll((s) => Math.max(0, s - 1))
    }, 1000)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      clearInterval(countdownTimer)
    }
  }, [fetchNow])

  return { sessions, secondsUntilNextPoll, retryNow, loading }
}
