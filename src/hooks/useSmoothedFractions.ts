import { useEffect, useRef, useState } from 'react'

interface HasFraction {
  car_number: string
  fraction: number
}

// Fraction of the remaining gap closed per animation frame (~60fps) — high
// enough to feel snappy after a Live poll lands a big jump, low enough that
// Replay's already-continuously-moving target doesn't visibly lag behind.
const CATCH_UP_RATE = 0.25
const SNAP_THRESHOLD = 0.0005

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

// Smoothly animates each car's `fraction` toward its latest target,
// independent of how it's rendered (Circle of Doom's angle, or a track
// map's getPointAtLength) — driving the *fraction* rather than raw x/y
// pixels keeps every derived point mathematically on the circle/path (no
// cutting across empty space) and keeps a dot and its label perfectly in
// sync since both are computed from this one animated value each frame,
// instead of e.g. a CSS transition applied to only one of them.
export function useSmoothedFractions<T extends HasFraction>(cars: T[]): T[] {
  const animatedRef = useRef(new Map<string, number>())
  const [, forceRender] = useState(0)

  useEffect(() => {
    const animated = animatedRef.current
    for (const c of cars) {
      if (!animated.has(c.car_number)) animated.set(c.car_number, c.fraction)
    }
    for (const key of [...animated.keys()]) {
      if (!cars.some((c) => c.car_number === key)) animated.delete(key)
    }

    let cancelled = false
    let rafId: number | null = null
    const step = () => {
      if (cancelled) return
      let stillMoving = false
      for (const c of cars) {
        const current = animated.get(c.car_number) ?? c.fraction
        const delta = circularDelta(current, c.fraction)
        if (Math.abs(delta) > SNAP_THRESHOLD) {
          animated.set(c.car_number, (current + delta * CATCH_UP_RATE + 1) % 1)
          stillMoving = true
        } else {
          animated.set(c.car_number, c.fraction)
        }
      }
      forceRender((n) => n + 1)
      if (stillMoving) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => {
      cancelled = true
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [cars])

  return cars.map((c) => ({ ...c, fraction: animatedRef.current.get(c.car_number) ?? c.fraction }))
}
