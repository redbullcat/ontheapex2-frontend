import type { LapRead, RaceLogEntry } from '../api/types'
import type { PitWindow } from './replayData'
import { FLAG_LABELS, computeFlagPeriods } from '../lib/flags'

// Historical CSV data has no discrete event stream the way the live feed's
// race-log channel does (see app/live/state.py) — this derives an
// equivalent from data Replay already computes (pit windows, flag periods)
// or a single pass over the laps, so the two views' race logs read the
// same way even though the underlying data sources are completely
// different shapes.
//
// Two of the live channel's types have no historical equivalent and are
// deliberately never emitted here: RCMessage (free-text commentary,
// nothing in the CSV maps to it) and WeatherUpdate (not tracked per-lap
// in this schema).
export const REPLAY_RACE_LOG_TYPES = ['PitIn', 'PitOut', 'DriverSwap', 'FastestLap', 'RaceFlag'] as const

function pitEvents(pitWindowsByCar: Map<string, PitWindow[]>): RaceLogEntry[] {
  const entries: RaceLogEntry[] = []
  for (const [car, windows] of pitWindowsByCar) {
    for (const w of windows) {
      entries.push({
        type: 'PitIn',
        raceLogItemId: `replay-pitin-${car}-${w.inLap}`,
        lapNumber: w.inLap,
        ts: '',
        elapsedTimeMillis: w.start * 1000,
        pid: 0,
        carNumber: car,
        classId: '',
      })
      entries.push({
        type: 'PitOut',
        raceLogItemId: `replay-pitout-${car}-${w.outLap}`,
        lapNumber: w.outLap,
        ts: '',
        elapsedTimeMillis: w.end * 1000,
        pid: 0,
        carNumber: car,
        classId: '',
        totalTimeInPitMillis: (w.end - w.start) * 1000,
      })
    }
  }
  return entries
}

function driverSwapEvents(laps: LapRead[]): RaceLogEntry[] {
  const byCar = new Map<string, LapRead[]>()
  for (const lap of laps) {
    if (lap.lap_number == null) continue
    const arr = byCar.get(lap.car_number)
    if (arr) arr.push(lap)
    else byCar.set(lap.car_number, [lap])
  }

  const entries: RaceLogEntry[] = []
  for (const [car, carLaps] of byCar) {
    const sorted = [...carLaps].sort((a, b) => a.lap_number - b.lap_number)
    let previousDriver: string | null = null
    for (const lap of sorted) {
      if (lap.driver_name && previousDriver && lap.driver_name !== previousDriver && lap.elapsed_seconds != null) {
        entries.push({
          type: 'DriverSwap',
          raceLogItemId: `replay-driverswap-${car}-${lap.lap_number}`,
          lapNumber: lap.lap_number,
          ts: '',
          elapsedTimeMillis: lap.elapsed_seconds * 1000,
          pid: 0,
          carNumber: car,
          classId: lap.class ?? '',
        })
      }
      if (lap.driver_name) previousDriver = lap.driver_name
    }
  }
  return entries
}

// Fires whenever a lap sets a new session-best-in-class — the same "Purple"
// moment the leaderboard badges elsewhere, just surfaced as a log entry too.
function fastestLapEvents(laps: LapRead[]): RaceLogEntry[] {
  const sorted = [...laps]
    .filter((l) => l.lap_time_seconds != null && l.elapsed_seconds != null)
    .sort((a, b) => a.elapsed_seconds! - b.elapsed_seconds!)

  const sessionBestByClass = new Map<string, number>()
  const entries: RaceLogEntry[] = []
  for (const lap of sorted) {
    const cls = lap.class ?? 'Unknown'
    const best = sessionBestByClass.get(cls)
    if (best == null || lap.lap_time_seconds! < best) {
      sessionBestByClass.set(cls, lap.lap_time_seconds!)
      entries.push({
        type: 'FastestLap',
        raceLogItemId: `replay-fastestlap-${lap.car_number}-${lap.lap_number}`,
        lapNumber: lap.lap_number,
        ts: '',
        elapsedTimeMillis: lap.elapsed_seconds! * 1000,
        pid: 0,
        carNumber: lap.car_number,
        classId: cls,
        lapTimeMillis: lap.lap_time_seconds! * 1000,
      })
    }
  }
  return entries
}

// Flag periods are lap-number ranges (see lib/flags.ts), not timestamped —
// approximates each period's start time as the earliest elapsed_seconds
// any car recorded for that lap number.
function flagEvents(laps: LapRead[]): RaceLogEntry[] {
  const periods = computeFlagPeriods(laps)
  if (periods.length === 0) return []

  const earliestElapsedByLap = new Map<number, number>()
  for (const lap of laps) {
    if (lap.lap_number == null || lap.elapsed_seconds == null) continue
    const prev = earliestElapsedByLap.get(lap.lap_number)
    if (prev == null || lap.elapsed_seconds < prev) earliestElapsedByLap.set(lap.lap_number, lap.elapsed_seconds)
  }

  const entries: RaceLogEntry[] = []
  for (const period of periods) {
    const elapsed = earliestElapsedByLap.get(period.startLap)
    if (elapsed == null) continue
    entries.push({
      type: 'RaceFlag',
      raceLogItemId: `replay-flag-${period.startLap}-${period.category}`,
      lapNumber: period.startLap,
      ts: '',
      elapsedTimeMillis: elapsed * 1000,
      pid: 0,
      carNumber: '',
      classId: '',
      flag: FLAG_LABELS[period.category],
    })
  }
  return entries
}

export function buildReplayRaceLog(laps: LapRead[], pitWindowsByCar: Map<string, PitWindow[]>): RaceLogEntry[] {
  return [...pitEvents(pitWindowsByCar), ...driverSwapEvents(laps), ...fastestLapEvents(laps), ...flagEvents(laps)].sort(
    (a, b) => a.elapsedTimeMillis - b.elapsedTimeMillis,
  )
}
