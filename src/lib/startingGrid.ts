import type { LapRead } from '../api/types'
import { isLapDeleted } from './lapOverrides'

// The combined (not per-class) grid order from a qualifying session's own
// laps — same convention as SessionResultsTable's overall `position`
// column: rank every car by its single fastest lap, ascending, across all
// classes together. Used to seed LapPositionChart's lines at their actual
// starting slot instead of at lap 1, since a lot can change between taking
// the green flag and first crossing the line.
//
// Skips any lap flagged deleted (see lapOverrides.ts) — a steward's
// decision the timing CSV has no way to represent on its own, but which
// can change who actually starts where (a struck-down pole lap promoting
// the next-fastest time, and everyone else down a slot).
export function computeStartingGrid(qualifyingLaps: LapRead[]): Map<string, number> {
  const bestByCar = new Map<string, number>()
  for (const lap of qualifyingLaps) {
    if (lap.lap_time_seconds == null) continue
    if (isLapDeleted(lap.session_id, lap.car_number, lap.lap_number)) continue
    const prev = bestByCar.get(lap.car_number)
    if (prev === undefined || lap.lap_time_seconds < prev) bestByCar.set(lap.car_number, lap.lap_time_seconds)
  }
  const ordered = [...bestByCar.entries()].sort((a, b) => a[1] - b[1])
  const grid = new Map<string, number>()
  ordered.forEach(([car], i) => grid.set(car, i + 1))
  return grid
}
