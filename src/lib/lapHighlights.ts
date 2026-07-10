import type { LapRead } from '../api/types'
import { isLapValid } from './lapValidity'
import { isLapDeleted } from './lapOverrides'

// Three-tier highlight, checked in this priority order (a session-best cell
// is trivially also a car-best and a personal-best, so only the highest
// tier that applies is kept): 'session' = fastest in this class across the
// whole session (purple), 'car' = fastest among every driver of this car
// (bold), 'personal' = fastest among this specific driver's own laps in
// this car (green). A lap that's either flagged invalid by the timing
// system (see lapValidity.ts) or flagged deleted by a user (see
// lapOverrides.ts — a steward's decision the timing feed has no way to
// represent) is never a reference time for any tier, even though it still
// appears in the table.
export type HighlightTier = 'session' | 'car' | 'personal' | null

// Exported so callers (e.g. CarLapHistoryTable, to decide row styling and
// the flag/restore button's label) can check the same combined condition
// without duplicating it.
export function isLapExcluded(lap: LapRead): boolean {
  return !isLapValid(lap) || isLapDeleted(lap.session_id, lap.car_number, lap.lap_number)
}

export interface LapHighlight {
  lap: HighlightTier
  s1: HighlightTier
  s2: HighlightTier
  s3: HighlightTier
}

function tierFor(value: number | null, classBest: number | null, carBest: number | null, driverBest: number | null): HighlightTier {
  if (value == null) return null
  if (classBest != null && value === classBest) return 'session'
  if (carBest != null && value === carBest) return 'car'
  if (driverBest != null && value === driverBest) return 'personal'
  return null
}

function minValid<T>(items: T[], pick: (item: T) => number | null): number | null {
  let best: number | null = null
  for (const item of items) {
    const v = pick(item)
    if (v == null) continue
    if (best == null || v < best) best = v
  }
  return best
}

// `carLaps` = this car's own laps; `allLaps` = the whole session (for the
// class-best reference) — both should include excluded laps (the table
// still displays them), this function does its own filtering internally
// for the "best" reference values only.
export function computeLapHighlights(carLaps: LapRead[], allLaps: LapRead[], carClass: string | null): Map<number, LapHighlight> {
  const validCarLaps = carLaps.filter((l) => !isLapExcluded(l))
  const validClassLaps = carClass == null ? [] : allLaps.filter((l) => !isLapExcluded(l) && (l.class ?? 'Unknown') === carClass)

  const classBest = {
    lap: minValid(validClassLaps, (l) => l.lap_time_seconds),
    s1: minValid(validClassLaps, (l) => l.s1_seconds),
    s2: minValid(validClassLaps, (l) => l.s2_seconds),
    s3: minValid(validClassLaps, (l) => l.s3_seconds),
  }
  const carBest = {
    lap: minValid(validCarLaps, (l) => l.lap_time_seconds),
    s1: minValid(validCarLaps, (l) => l.s1_seconds),
    s2: minValid(validCarLaps, (l) => l.s2_seconds),
    s3: minValid(validCarLaps, (l) => l.s3_seconds),
  }

  const driverBestByDriver = new Map<string, { lap: number | null; s1: number | null; s2: number | null; s3: number | null }>()
  for (const lap of validCarLaps) {
    if (!lap.driver_name) continue
    if (!driverBestByDriver.has(lap.driver_name)) {
      const driverLaps = validCarLaps.filter((l) => l.driver_name === lap.driver_name)
      driverBestByDriver.set(lap.driver_name, {
        lap: minValid(driverLaps, (l) => l.lap_time_seconds),
        s1: minValid(driverLaps, (l) => l.s1_seconds),
        s2: minValid(driverLaps, (l) => l.s2_seconds),
        s3: minValid(driverLaps, (l) => l.s3_seconds),
      })
    }
  }

  const result = new Map<number, LapHighlight>()
  for (const lap of carLaps) {
    const driverBest = (lap.driver_name && driverBestByDriver.get(lap.driver_name)) || { lap: null, s1: null, s2: null, s3: null }
    // An excluded lap's own time is never itself a highlight target, even if
    // it numerically matches a best value some other counted lap also set.
    const counted = !isLapExcluded(lap)
    result.set(lap.lap_number, {
      lap: counted ? tierFor(lap.lap_time_seconds, classBest.lap, carBest.lap, driverBest.lap) : null,
      s1: counted ? tierFor(lap.s1_seconds, classBest.s1, carBest.s1, driverBest.s1) : null,
      s2: counted ? tierFor(lap.s2_seconds, classBest.s2, carBest.s2, driverBest.s2) : null,
      s3: counted ? tierFor(lap.s3_seconds, classBest.s3, carBest.s3, driverBest.s3) : null,
    })
  }
  return result
}
