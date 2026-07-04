import { useEffect, useState } from 'react'

// Seconds until `targetIso` (negative once past) — ticks every second.
// Null input means "no known target", not "zero".
export function useCountdownTo(targetIso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!targetIso) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [targetIso])

  if (!targetIso) return null
  return (new Date(targetIso).getTime() - now) / 1000
}
