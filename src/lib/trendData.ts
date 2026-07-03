// Shared by Replay (whole-session CSV data) and Live (laps accumulated so
// far from the polling feed) — both just need "per-lap gap to the reference
// car" and "per-lap running-order position" computed off a flat list of
// completed laps, regardless of where those laps came from.
export interface TrendLap {
  car_number: string
  lap_number: number
  elapsed_seconds: number | null
}

// Mirrors GapEvolutionChart's reference-car rule: the classification leader
// (most laps completed, ties broken by lowest elapsed time), held fixed for
// the whole session.
export function computeReferenceAndGaps(laps: TrendLap[]): {
  referenceCar: string | null
  gapByLapAndCar: Map<number, Map<string, number>>
} {
  const lastLapByCar = new Map<string, TrendLap>()
  for (const lap of laps) {
    if (lap.elapsed_seconds == null) continue
    const prev = lastLapByCar.get(lap.car_number)
    if (!prev || lap.lap_number > prev.lap_number) lastLapByCar.set(lap.car_number, lap)
  }
  let referenceCar: string | null = null
  let bestLap = -1
  let bestElapsed = Infinity
  for (const [car, lastLap] of lastLapByCar) {
    if (lastLap.lap_number > bestLap || (lastLap.lap_number === bestLap && lastLap.elapsed_seconds! < bestElapsed)) {
      bestLap = lastLap.lap_number
      bestElapsed = lastLap.elapsed_seconds!
      referenceCar = car
    }
  }

  const refByLap = new Map<number, number>()
  if (referenceCar) {
    for (const lap of laps) {
      if (lap.car_number === referenceCar && lap.elapsed_seconds != null) refByLap.set(lap.lap_number, lap.elapsed_seconds)
    }
  }

  const gapByLapAndCar = new Map<number, Map<string, number>>()
  for (const lap of laps) {
    if (lap.elapsed_seconds == null) continue
    const refTime = refByLap.get(lap.lap_number)
    if (refTime === undefined) continue
    let inner = gapByLapAndCar.get(lap.lap_number)
    if (!inner) {
      inner = new Map()
      gapByLapAndCar.set(lap.lap_number, inner)
    }
    inner.set(lap.car_number, lap.elapsed_seconds - refTime)
  }

  return { referenceCar, gapByLapAndCar }
}

// Same convention as LapPositionChart: re-rank within each lap by elapsed
// time ascending. Unlike gap-to-a-fixed-reference, position doesn't need a
// reference car at all — it's just "who's covered the most track by here."
export function computePositionByLap(laps: TrendLap[]): Map<number, Map<string, number>> {
  const byLap = new Map<number, TrendLap[]>()
  for (const lap of laps) {
    if (lap.lap_number == null || lap.elapsed_seconds == null) continue
    const arr = byLap.get(lap.lap_number)
    if (arr) arr.push(lap)
    else byLap.set(lap.lap_number, [lap])
  }
  const positionByLapAndCar = new Map<number, Map<string, number>>()
  for (const [lapNumber, rows] of byLap) {
    const sorted = [...rows].sort((a, b) => a.elapsed_seconds! - b.elapsed_seconds!)
    const inner = new Map<string, number>()
    sorted.forEach((r, i) => inner.set(r.car_number, i + 1))
    positionByLapAndCar.set(lapNumber, inner)
  }
  return positionByLapAndCar
}
