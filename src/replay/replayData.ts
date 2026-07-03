import type { LapRead } from '../api/types'

export interface CarMeta {
  car_number: string
  class: string
  team: string | null
  driver_name: string | null
}

export type Sector = 1 | 2 | 3

export interface SectorEvent {
  time: number
  car: string
  sector: Sector
  lap: number
  value: number
  // Only set on sector-3 events — a sector-3 crossing is a lap completion,
  // so it carries the payload needed to update best/last lap and look up
  // the gap-to-leader for that lap in the same pass.
  lapTimeSeconds?: number | null
}

export interface PitWindow {
  inLap: number
  outLap: number
  // Approximate: the in-lap's finish-line crossing to the out-lap's start
  // (its finish-line time minus its own lap time). Good enough to drive the
  // "in pit" row state — not meant to reproduce the exact pit-lane-loop
  // timing loggers use.
  start: number
  end: number
}

export interface ReplayData {
  cars: CarMeta[]
  events: SectorEvent[]
  pitWindowsByCar: Map<string, PitWindow[]>
  // Fixed-reference gap (vs. the eventual race winner) — used only by the
  // gap-evolution trend strip, where a stable reference makes sense for a
  // whole-session chart. The live leaderboard's Gap/Interval columns use
  // elapsedByLapByCar below instead, computed against whoever is *currently*
  // leading, since that's what "gap to leader" means on a running timing
  // screen and it can hand off between cars as the race unfolds.
  referenceCar: string | null
  gapByLapAndCar: Map<number, Map<string, number>>
  elapsedByLapByCar: Map<string, Map<number, number>>
  minTime: number
  maxTime: number
}

// Mirrors GapEvolutionChart's reference-car rule: the classification leader
// (most laps completed, ties broken by lowest elapsed time), held fixed for
// the whole replay. Unfiltered here — v1 always replays the full field.
function computeReferenceAndGaps(laps: LapRead[]): {
  referenceCar: string | null
  gapByLapAndCar: Map<number, Map<string, number>>
} {
  const lastLapByCar = new Map<string, LapRead>()
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

// Pairs each car's in-lap (crossing_finish_line_in_pit === 'B') with the
// next lap as its out-lap — same pattern PitTimeChart uses for pit-loss.
// The window itself comes from pit_time_seconds (recorded on the out-lap):
// the in-lap's finish-line crossing to that many seconds later. Note this
// is *not* derivable from elapsed_seconds/lap_time_seconds alone — a lap's
// recorded time already has any stationary time baked in (it's just the
// gap between two finish-line crossings), so out.elapsed - out.lap_time
// always collapses back to the in-lap's own finish time regardless of how
// long the stop actually was. pit_time_seconds is the real signal.
function computePitWindows(sortedLaps: LapRead[]): PitWindow[] {
  const byLapNumber = new Map(sortedLaps.map((l) => [l.lap_number, l]))
  const windows: PitWindow[] = []
  for (const lap of sortedLaps) {
    if (lap.crossing_finish_line_in_pit !== 'B') continue
    if (lap.elapsed_seconds == null) continue
    const outLap = byLapNumber.get(lap.lap_number + 1)
    if (!outLap || outLap.pit_time_seconds == null || outLap.pit_time_seconds <= 0) continue
    const start = lap.elapsed_seconds
    const end = start + outLap.pit_time_seconds
    windows.push({ inLap: lap.lap_number, outLap: outLap.lap_number, start, end })
  }
  return windows
}

export function buildReplayData(laps: LapRead[]): ReplayData {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (lap.lap_number == null) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const cars: CarMeta[] = []
  const events: SectorEvent[] = []
  const pitWindowsByCar = new Map<string, PitWindow[]>()
  const elapsedByLapByCar = new Map<string, Map<number, number>>()

  for (const [car, rows] of byCar) {
    const sorted = [...rows].sort((a, b) => a.lap_number - b.lap_number)
    const last = sorted[sorted.length - 1]
    cars.push({ car_number: car, class: last.class ?? 'Unknown', team: last.team, driver_name: last.driver_name })

    const elapsedByLap = new Map<number, number>()
    for (const lap of sorted) {
      if (lap.elapsed_seconds != null) elapsedByLap.set(lap.lap_number, lap.elapsed_seconds)
    }
    elapsedByLapByCar.set(car, elapsedByLap)

    for (const lap of sorted) {
      if (lap.elapsed_seconds == null) continue
      const t3 = lap.elapsed_seconds
      events.push({ time: t3, car, sector: 3, lap: lap.lap_number, value: lap.s3_seconds ?? t3, lapTimeSeconds: lap.lap_time_seconds })
      // t2/t1 are anchored backward from the finish line (t3), so deriving
      // either one needs every split between it and the finish to be known
      // — if s3 or s2 is missing, the earlier splits' *timestamps* aren't
      // trustworthy either, so skip them too rather than guess. This is the
      // "leave blank" rule from the scope notes: no event pushed = the
      // leaderboard just keeps showing whatever it last had for that cell.
      if (lap.s3_seconds != null && lap.s2_seconds != null) {
        const t2 = t3 - lap.s3_seconds
        events.push({ time: t2, car, sector: 2, lap: lap.lap_number, value: lap.s2_seconds })
        if (lap.s1_seconds != null) {
          const t1 = t2 - lap.s2_seconds
          events.push({ time: t1, car, sector: 1, lap: lap.lap_number, value: lap.s1_seconds })
        }
      }
    }

    pitWindowsByCar.set(car, computePitWindows(sorted))
  }

  events.sort((a, b) => a.time - b.time)

  const { referenceCar, gapByLapAndCar } = computeReferenceAndGaps(laps)

  const minTime = events.length ? events[0].time : 0
  const maxTime = events.length ? events[events.length - 1].time : 0

  cars.sort((a, b) => a.car_number.localeCompare(b.car_number, undefined, { numeric: true }))

  return { cars, events, pitWindowsByCar, referenceCar, gapByLapAndCar, elapsedByLapByCar, minTime, maxTime }
}
