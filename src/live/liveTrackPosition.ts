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

  const bestOf = (get: (l: LiveLap) => number | null, source: LiveLap[]): number | null => {
    const vals = source.map(get).filter((v): v is number => v != null && v > 0)
    return vals.length ? Math.min(...vals) : null
  }
  const refLapTime =
    (bestOf((l) => l.s1_seconds, carLaps) ?? bestOf((l) => l.s1_seconds, laps) ?? 30) +
    (bestOf((l) => l.s2_seconds, carLaps) ?? bestOf((l) => l.s2_seconds, laps) ?? 30) +
    (bestOf((l) => l.s3_seconds, carLaps) ?? bestOf((l) => l.s3_seconds, laps) ?? 30)

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
