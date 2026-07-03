import { computePositionByLap, type TrendLap } from './trendData'

export interface CarSummary {
  lapsLed: number
  // Distinct lap numbers with any position data recorded so far (i.e. the
  // race's length so far, not this car's own lap count — a car that's
  // pitted and missed laps shouldn't get its percentage distorted by a
  // smaller personal denominator).
  totalScoredLaps: number
  percentLed: number | null
  // Position as of the most recent lap number with data, for this car
  // specifically (null if it hasn't completed a scored lap yet).
  currentPosition: number | null
}

// Reuses the exact same per-lap position ranking that already drives the
// Gap evolution/Lap position trend charts (lib/trendData.ts) — "led" is
// just "was P1" read off that same map, so this stays consistent with
// whatever those charts show rather than recomputing leader-per-lap with
// slightly different rules. `laps` is the whole field's laps (not just one
// car) since position is relative to everyone else on track.
export function computeCarSummary(carNumber: string, laps: TrendLap[]): CarSummary {
  const positionByLapAndCar = computePositionByLap(laps)
  let lapsLed = 0
  let currentPosition: number | null = null
  for (const lapNumber of [...positionByLapAndCar.keys()].sort((a, b) => a - b)) {
    const pos = positionByLapAndCar.get(lapNumber)!.get(carNumber)
    if (pos === 1) lapsLed++
    if (pos != null) currentPosition = pos
  }
  const totalScoredLaps = positionByLapAndCar.size
  return {
    lapsLed,
    totalScoredLaps,
    percentLed: totalScoredLaps > 0 ? (lapsLed / totalScoredLaps) * 100 : null,
    currentPosition,
  }
}
