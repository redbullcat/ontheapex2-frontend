import type { LapRead, RaceLogEntry } from '../api/types'
import { computeFlagPeriods, type FlagPeriod } from '../lib/flags'
import { computeReferenceAndGaps, computePositionByLap } from '../lib/trendData'
import { buildReplayRaceLog } from './raceLogSynth'

export interface CarMeta {
  car_number: string
  class: string
  team: string | null
}

export type Sector = 1 | 2 | 3

export interface SectorEvent {
  time: number
  car: string
  sector: Sector
  lap: number
  value: number
  // Endurance cars swap drivers mid-race, and each lap row already carries
  // whoever was driving *that* lap — carried on every event (not just
  // sector-3) so the leaderboard shows the current driver immediately as
  // laps tick over, not a lap late.
  driverName: string | null
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
  classes: string[]
  events: SectorEvent[]
  pitWindowsByCar: Map<string, PitWindow[]>
  // Fixed-reference gap (vs. the eventual race winner) — used by the
  // gap-evolution trend chart, where a stable reference makes sense for a
  // whole-session view. elapsedByLapSectorByCar below is what the live
  // leaderboard's Gap/Interval columns use instead, computed against
  // whoever is *currently* leading at sector granularity, since that's
  // what "gap to leader" means on a running timing screen and it can hand
  // off between cars as the race unfolds.
  referenceCar: string | null
  gapByLapAndCar: Map<number, Map<string, number>>
  // Per-lap running-order position (1..N), same rule LapPositionChart uses
  // (rank by elapsed_seconds within the lap) — feeds the position trend chart.
  positionByLapAndCar: Map<number, Map<string, number>>
  // `${lap}:${sector}` -> elapsed seconds at that checkpoint, per car. Lets
  // the live leaderboard compare "my elapsed at (lap,sector) X" against
  // "the current leader's elapsed at that same (lap,sector) X", which is
  // what makes Gap/Interval update on every sector crossing instead of
  // only once per lap.
  elapsedByLapSectorByCar: Map<string, Map<string, number>>
  flagPeriods: FlagPeriod[]
  // Synthesized from laps/pit windows/flag periods — see raceLogSynth.ts.
  // Same RaceLogEntry shape the live view uses, so the sidebar's race log
  // panel is shared between both.
  raceLog: RaceLogEntry[]
  minTime: number
  maxTime: number
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
  const elapsedByLapSectorByCar = new Map<string, Map<string, number>>()
  const classes = new Set<string>()

  for (const [car, rows] of byCar) {
    const sorted = [...rows].sort((a, b) => a.lap_number - b.lap_number)
    const last = sorted[sorted.length - 1]
    const carClass = last.class ?? 'Unknown'
    cars.push({ car_number: car, class: carClass, team: last.team })
    classes.add(carClass)

    const elapsedBySector = new Map<string, number>()
    elapsedByLapSectorByCar.set(car, elapsedBySector)

    for (const lap of sorted) {
      if (lap.elapsed_seconds == null) continue
      const t3 = lap.elapsed_seconds
      events.push({
        time: t3,
        car,
        sector: 3,
        lap: lap.lap_number,
        value: lap.s3_seconds ?? t3,
        driverName: lap.driver_name,
        lapTimeSeconds: lap.lap_time_seconds,
      })
      elapsedBySector.set(`${lap.lap_number}:3`, t3)
      // t2/t1 are anchored backward from the finish line (t3), so deriving
      // either one needs every split between it and the finish to be known
      // — if s3 or s2 is missing, the earlier splits' *timestamps* aren't
      // trustworthy either, so skip them too rather than guess. This is the
      // "leave blank" rule from the scope notes: no event pushed = the
      // leaderboard just keeps showing whatever it last had for that cell.
      if (lap.s3_seconds != null && lap.s2_seconds != null) {
        const t2 = t3 - lap.s3_seconds
        events.push({ time: t2, car, sector: 2, lap: lap.lap_number, value: lap.s2_seconds, driverName: lap.driver_name })
        elapsedBySector.set(`${lap.lap_number}:2`, t2)
        if (lap.s1_seconds != null) {
          const t1 = t2 - lap.s2_seconds
          events.push({ time: t1, car, sector: 1, lap: lap.lap_number, value: lap.s1_seconds, driverName: lap.driver_name })
          elapsedBySector.set(`${lap.lap_number}:1`, t1)
        }
      }
    }

    pitWindowsByCar.set(car, computePitWindows(sorted))
  }

  events.sort((a, b) => a.time - b.time)

  const { referenceCar, gapByLapAndCar } = computeReferenceAndGaps(laps)
  const positionByLapAndCar = computePositionByLap(laps)
  const flagPeriods = computeFlagPeriods(laps)
  const raceLog = buildReplayRaceLog(laps, pitWindowsByCar)

  const minTime = events.length ? events[0].time : 0
  const maxTime = events.length ? events[events.length - 1].time : 0

  cars.sort((a, b) => a.car_number.localeCompare(b.car_number, undefined, { numeric: true }))

  return {
    cars,
    classes: [...classes].sort(),
    events,
    pitWindowsByCar,
    referenceCar,
    gapByLapAndCar,
    positionByLapAndCar,
    elapsedByLapSectorByCar,
    flagPeriods,
    raceLog,
    minTime,
    maxTime,
  }
}
