import { useEffect, useState } from 'react'

const STORAGE_KEY = 'liveDelaySeconds'
const MAX_DELAY_SECONDS = 600

export function clampDelaySeconds(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(MAX_DELAY_SECONDS, Math.round(n)))
}

// Persisted the same way theme is (see LiveNowApp's own localStorage read
// for theme) — a viewer picks a delay to match their stream once and
// expects it to still be set next time they open the tab.
export function useLiveDelay(): [number, (n: number) => void] {
  const [delaySeconds, setDelaySecondsState] = useState<number>(() => clampDelaySeconds(Number(window.localStorage.getItem(STORAGE_KEY))))

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(delaySeconds))
  }, [delaySeconds])

  return [delaySeconds, (n: number) => setDelaySecondsState(clampDelaySeconds(n))]
}
