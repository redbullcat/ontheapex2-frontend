import { useEffect, useState } from 'react'

const STORAGE_PREFIX = 'liveDelaySeconds:'
const MAX_DELAY_SECONDS = 600

export function clampDelaySeconds(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(MAX_DELAY_SECONDS, Math.round(n)))
}

// Scoped per griiip session id (a fresh session — practice, quali, the race
// itself — always starts back at 0s rather than inheriting whatever delay
// was last dialled in for a previous one), but still persisted within that
// same session so reloading the tab mid-session keeps it — a viewer picks a
// delay to match their stream once per session and expects it to stick for
// the rest of that session.
export function useLiveDelay(griiipSessionId: number | null): [number, (n: number) => void] {
  const key = griiipSessionId != null ? `${STORAGE_PREFIX}${griiipSessionId}` : null
  const [delaySeconds, setDelaySecondsState] = useState<number>(() =>
    key ? clampDelaySeconds(Number(window.localStorage.getItem(key))) : 0,
  )

  useEffect(() => {
    setDelaySecondsState(key ? clampDelaySeconds(Number(window.localStorage.getItem(key))) : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (key) window.localStorage.setItem(key, String(delaySeconds))
  }, [key, delaySeconds])

  return [delaySeconds, (n: number) => setDelaySecondsState(clampDelaySeconds(n))]
}
