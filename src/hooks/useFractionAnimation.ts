import { useEffect, useRef } from 'react'

interface HasFraction {
  car_number: string
  fraction: number
}

// Fraction of the remaining gap closed per animation tick — high enough to
// feel snappy after a Live poll lands a big jump, low enough that Replay's
// already-continuously-moving target doesn't visibly lag behind.
const CATCH_UP_RATE = 0.25
const SNAP_THRESHOLD = 0.0005
const TICK_MS = 33 // ~30fps — imperative DOM writes are cheap enough for this

// 0..1 fractions are circular (0 and 1 are the same point, the start/finish
// line) — a plain numeric lerp from e.g. 0.98 to 0.02 would crawl backward
// through the whole lap instead of forward across the line. This always
// takes the shorter way around.
function circularDelta(from: number, to: number): number {
  let d = to - from
  if (d > 0.5) d -= 1
  if (d < -0.5) d += 1
  return d
}

export type FractionTickHandler = (carNumber: string, fraction: number) => void

// Deliberately imperative, not React-state-based: the caller's `onTick` is
// invoked directly from a timer, and is expected to write the value onto
// a DOM node itself (e.g. element.setAttribute('cx', ...)) rather than
// triggering a re-render. Two independent per-frame *state* update loops —
// this one and Replay's own playback clock — stacked on top of a
// react-grid-layout panel's extra render cost was enough combined pressure
// to trip React's "Maximum update depth exceeded" runaway-update
// detector, even with the update rate throttled well below 60fps. Not
// feeding this into React's scheduler at all sidesteps that entirely, and
// is the more standard approach for a continuous animation loop like this
// regardless.
export function useFractionAnimation<T extends HasFraction>(cars: T[], onTick: FractionTickHandler): void {
  const carsRef = useRef(cars)
  carsRef.current = cars
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    const animated = new Map<string, number>()
    const id = window.setInterval(() => {
      const cars = carsRef.current
      for (const key of [...animated.keys()]) {
        if (!cars.some((c) => c.car_number === key)) animated.delete(key)
      }
      for (const c of cars) {
        let current = animated.get(c.car_number)
        if (current == null) {
          current = c.fraction
        } else {
          const delta = circularDelta(current, c.fraction)
          current = Math.abs(delta) > SNAP_THRESHOLD ? (current + delta * CATCH_UP_RATE + 1) % 1 : c.fraction
        }
        animated.set(c.car_number, current)
        onTickRef.current(c.car_number, current)
      }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])
}
