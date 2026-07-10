import type { LapRead } from '../api/types'
import { isLapDeleted } from './lapOverrides'
import { isLapValid } from './lapValidity'

// The combined (not per-class) grid order from a qualifying session's own
// laps — same convention as SessionResultsTable's overall `position`
// column: rank every car by its single fastest lap, ascending, across all
// classes together. Used to seed LapPositionChart's lines at their actual
// starting slot instead of at lap 1, since a lot can change between taking
// the green flag and first crossing the line.
//
// `qualifyingLaps` is the pool of every session bucketed as "qualifying"
// for the event (see App.tsx's sessionsByBucket) — for a knock-out format
// like WEC's Hyperpole (Qualifying -> Hyperpole 1 -> Hyperpole 2, each
// round eliminating cars) that's several separate sessions, not one. A
// car's grid slot is set by the *last* round it took part in — its time
// from an earlier, larger-field round (set under different track
// conditions) must never override that, even if it happened to be faster.
// There's no explicit "round order" field to key off, but a knock-out
// format's rounds strictly shrink the field, so the round with the fewest
// cars that a given car appears in is, by construction, its last one.
//
// Skips any lap flagged deleted (see lapOverrides.ts) — a steward's
// decision the timing CSV has no way to represent on its own, but which
// can change who actually starts where (a struck-down pole lap promoting
// the next-fastest time, and everyone else down a slot).
export function computeStartingGrid(qualifyingLaps: LapRead[]): Map<string, number> {
  const carsInSession = new Map<number, Set<string>>()
  for (const lap of qualifyingLaps) {
    let cars = carsInSession.get(lap.session_id)
    if (!cars) {
      cars = new Set()
      carsInSession.set(lap.session_id, cars)
    }
    cars.add(lap.car_number)
  }
  const lastRoundForCar = new Map<string, number>()
  for (const [sessionId, cars] of carsInSession) {
    for (const car of cars) {
      const prevSessionId = lastRoundForCar.get(car)
      const prevSize = prevSessionId === undefined ? Infinity : carsInSession.get(prevSessionId)!.size
      if (cars.size < prevSize) lastRoundForCar.set(car, sessionId)
    }
  }

  const bestByCar = new Map<string, number>()
  for (const lap of qualifyingLaps) {
    if (lap.lap_time_seconds == null) continue
    if (!isLapValid(lap)) continue
    if (lastRoundForCar.get(lap.car_number) !== lap.session_id) continue
    if (isLapDeleted(lap.session_id, lap.car_number, lap.lap_number)) continue
    const prev = bestByCar.get(lap.car_number)
    if (prev === undefined || lap.lap_time_seconds < prev) bestByCar.set(lap.car_number, lap.lap_time_seconds)
  }

  // Sort by round first (every car that reached a later, more exclusive
  // round outranks every car that didn't, regardless of raw time — a
  // slower lap set in a 10-car Hyperpole 2 still beats a faster one set
  // in the 18-car session it eliminated that car from) and only fall back
  // to comparing lap times within the same round.
  const roundSize = (car: string) => carsInSession.get(lastRoundForCar.get(car)!)!.size
  const ordered = [...bestByCar.entries()].sort((a, b) => {
    const roundDiff = roundSize(a[0]) - roundSize(b[0])
    return roundDiff !== 0 ? roundDiff : a[1] - b[1]
  })
  const grid = new Map<string, number>()
  ordered.forEach(([car], i) => grid.set(car, i + 1))
  return grid
}
