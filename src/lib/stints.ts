import * as d3 from 'd3'
import type { LapRead } from '../api/types'

export interface LapStint {
  car_number: string
  team: string | null
  manufacturer: string | null
  class: string | null
  laps: LapRead[]
}

// A lap this much slower than a car's own median counts as an outlier —
// an installation lap, a red-flag/VSC lap, or a lap sat behind an incident
// — rather than representative long-run pace. Visual QA on a practice
// session turned up single laps 5-10x the field's normal pace dragging the
// whole chart's y-axis flat; this mirrors the same outlier-guard pattern
// used for top speed (TopSpeedChart) and pit loss (PitTimeChart).
const OUTLIER_MULTIPLIER = 1.3

// Splits each car's laps into "clean" stints for long-run pace analysis,
// mirroring practice_average_long_run_pace.py's grouping: a stint is the
// run of green-track laps between pit visits, with both the in-lap (the
// one crossing the line into the pits) and the very next out-lap excluded
// — both carry compromised pace that would drag down a representative
// long-run read.
export function computeCarStints(laps: LapRead[]): LapStint[] {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (lap.lap_number == null) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const stints: LapStint[] = []
  for (const rows of byCar.values()) {
    const sorted = [...rows].sort((a, b) => a.lap_number - b.lap_number)
    const times = sorted.map((l) => l.lap_time_seconds).filter((t): t is number => t != null)
    const maxReasonable = (d3.median(times) ?? Infinity) * OUTLIER_MULTIPLIER

    let current: LapRead[] = []
    let skipNext = false

    const flush = () => {
      if (current.length > 0) {
        const first = current[0]
        stints.push({
          car_number: first.car_number,
          team: first.team,
          manufacturer: first.manufacturer,
          class: first.class,
          laps: current,
        })
      }
      current = []
    }

    for (const lap of sorted) {
      if (skipNext) {
        skipNext = false
        continue
      }
      if (lap.crossing_finish_line_in_pit === 'B') {
        flush()
        skipNext = true
        continue
      }
      if (lap.lap_time_seconds != null && lap.lap_time_seconds > maxReasonable) continue
      current.push(lap)
    }
    flush()
  }
  return stints
}
