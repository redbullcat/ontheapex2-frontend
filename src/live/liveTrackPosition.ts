import type { LiveLap, LiveState, SessionClock } from '../api/types'
import { fractionFromSegment } from '../lib/trackFraction'

export interface LiveTrackCar {
  car_number: string
  fraction: number
  // True when this came from the real cars-geo-locations feed rather than
  // an interpolated estimate — lets the UI show a "live" vs "approx" hint.
  isLive: boolean
}

function sessionElapsedSeconds(clock: SessionClock | null, delaySeconds: number): number | null {
  if (!clock?.start_time) return null
  const startMs = Date.parse(clock.start_time)
  if (Number.isNaN(startMs)) return null
  return (Date.now() - startMs) / 1000 - delaySeconds
}

// Whole-lap-resolution fallback for cars with no real cars-geo-locations
// entry yet — same idea as Replay's sector-resolution version (see
// lib/trackFraction.ts) but Live only gets mid-race position at lap
// boundaries, not per-sector, since we don't ingest sector-cross-updates
// live yet.
function interpolatedFraction(carNumber: string, laps: LiveLap[], nowSeconds: number): number {
  const carLaps = laps.filter((l) => l.car_number === carNumber && l.elapsed_seconds != null)
  const completed = carLaps.filter((l) => l.elapsed_seconds! <= nowSeconds).sort((a, b) => a.lap_number - b.lap_number)
  const last = completed[completed.length - 1] ?? null
  const lapStart = last?.elapsed_seconds ?? 0

  const median = (vals: number[]): number | null => {
    if (!vals.length) return null
    const sorted = [...vals].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }
  // The car's *own last lap time* is by far the best predictor of how long
  // its current lap will take — using a personal-best or field-best
  // reference instead systematically underestimates (fuel load, traffic,
  // tyre wear), which pins the fraction at its 0.999 ceiling for most of
  // the lap and reads as "stuck". Only fall back to the field's typical lap
  // when this car hasn't completed one yet.
  const refLapTime =
    last?.lap_time_seconds ?? median(laps.map((l) => l.lap_time_seconds).filter((v): v is number => v != null && v > 0)) ?? 90

  return fractionFromSegment(0, Math.max(0, nowSeconds - lapStart), refLapTime)
}

export function computeLiveTrackPositions(data: LiveState, delaySeconds: number): LiveTrackCar[] {
  const nowSeconds = sessionElapsedSeconds(data.session_clock, delaySeconds)
  const carNumbers = new Set(data.standings.map((s) => s.car_number))
  return [...carNumbers].map((car_number) => {
    const real = data.car_locations?.[car_number]
    if (real != null) {
      return { car_number, fraction: real, isLive: true }
    }
    return {
      car_number,
      fraction: nowSeconds == null ? 0 : interpolatedFraction(car_number, data.laps, nowSeconds),
      isLive: false,
    }
  })
}
