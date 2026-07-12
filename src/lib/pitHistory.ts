import * as d3 from 'd3'
import type { LapRead } from '../api/types'
import { tyreAgeDisplay, tyreCode } from './carTyres'

export interface PitStint {
  car_number: string
  team: string | null
  manufacturer: string | null
  class: string | null
  driver: string | null
  startLap: number
  endLap: number
  lapCount: number
  avgLapSeconds: number | null
  tyreCompound: string | null
  tyreAge: string | null
  // Still-running stint (car hasn't pitted since) — the very last block in
  // a car's row, distinguished so the Gantt/tooltip can call it out as "in
  // progress" rather than a completed stop-to-stop stint.
  isCurrent: boolean
}

// Same outlier guard as lib/stints.ts's computeCarStints, just scoped to
// excluding a lap from the stint's *average*, not from the stint entirely
// — every lap still needs to belong to some stint so the Gantt bar spans
// the full race with no gaps.
const OUTLIER_MULTIPLIER = 1.3

// Splits each car's laps into pit-to-pit stints (in-lap included at the end
// of the stint it's leaving, out-lap starting the next one) — same in-lap/
// out-lap pairing convention as lib/pitStats.ts's computePitStats, just
// producing full stint blocks instead of a running count. A stint whose
// closing out-lap hasn't arrived yet (car still in the pits when this ran)
// stays open and un-flushed — it resolves itself on the next call once the
// out-lap completes.
export function computePitHistory(laps: LapRead[]): PitStint[] {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (lap.lap_number == null) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const result: PitStint[] = []
  for (const carLaps of byCar.values()) {
    const sorted = [...carLaps].sort((a, b) => a.lap_number - b.lap_number)
    const byLapNumber = new Map(sorted.map((l) => [l.lap_number, l]))
    const times = sorted.map((l) => l.lap_time_seconds).filter((t): t is number => t != null)
    const maxReasonable = (d3.median(times) ?? Infinity) * OUTLIER_MULTIPLIER

    let current: LapRead[] = []

    const flush = (isCurrent: boolean) => {
      if (current.length === 0) return
      const first = current[0]
      const last = current[current.length - 1]
      // Clean laps for the average: not the in-lap itself, not the out-lap
      // right after a stop (both carry pit-loss baked into lap_time_seconds
      // — see lib/stints.ts), not an outlier.
      const clean = current.filter((lap, i) => {
        if (lap.crossing_finish_line_in_pit === 'B') return false
        if (i === 0 && current.length > 1) return false
        if (lap.lap_time_seconds == null) return false
        return lap.lap_time_seconds <= maxReasonable
      })
      const cleanTimes = clean.map((l) => l.lap_time_seconds).filter((t): t is number => t != null)
      const drivers = [...new Set(current.map((l) => l.driver_name).filter((d): d is string => !!d))]
      result.push({
        car_number: first.car_number,
        team: first.team,
        manufacturer: first.manufacturer,
        class: first.class,
        driver: drivers.join(' → ') || null,
        startLap: first.lap_number,
        endLap: last.lap_number,
        lapCount: current.length,
        avgLapSeconds: cleanTimes.length > 0 ? cleanTimes.reduce((a, b) => a + b, 0) / cleanTimes.length : null,
        tyreCompound: tyreCode(last),
        tyreAge: tyreAgeDisplay(last),
        isCurrent,
      })
      current = []
    }

    for (const lap of sorted) {
      current.push(lap)
      if (lap.crossing_finish_line_in_pit === 'B') {
        const outLap = byLapNumber.get(lap.lap_number + 1)
        if (outLap && outLap.pit_time_seconds != null && outLap.pit_time_seconds > 0) {
          flush(false)
        }
      }
    }
    flush(true)
  }
  return result
}
