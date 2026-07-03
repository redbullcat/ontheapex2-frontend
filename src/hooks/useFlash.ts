import { useEffect, useRef, useState } from 'react'

// True for `durationMs` of real wall-clock time whenever `value` changes —
// deliberately real time, not sim time, so it reads the same regardless of
// how fast the underlying data is advancing (e.g. Replay at 1x vs 30x).
export function useFlash(value: number, durationMs = 700): boolean {
  const [flash, setFlash] = useState(false)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current === value) return
    prev.current = value
    setFlash(true)
    const t = setTimeout(() => setFlash(false), durationMs)
    return () => clearTimeout(t)
  }, [value, durationMs])
  return flash
}
