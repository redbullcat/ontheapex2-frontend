import type { LapRead, RaceLogEntry } from '../api/types'
import { computeWheelStints, WHEELS, type Wheel } from './tyreStints'

const WHEEL_LABELS: Record<Wheel, string> = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' }

// Synthesizes a 'TyreChange' race-log entry for every wheel-stint boundary
// computeWheelStints detects, the same way Replay already synthesizes
// PitIn/PitOut/DriverSwap from lap data (see raceLogSynth.ts) — Griiip's
// feed has no discrete tyre-change event of its own (see
// app/live/state.py's module docstring), so this is the only way either
// Live or Replay gets one. Wheels that change on the same lap are merged
// into a single entry (e.g. a real 2-wheel swap reads as one "FR/RR"
// event, not two separate rows for the same stop).
export function tyreChangeEvents(laps: LapRead[]): RaceLogEntry[] {
  const carNumbers = [...new Set(laps.map((l) => l.car_number))]
  const entries: RaceLogEntry[] = []

  for (const car of carNumbers) {
    const wheels = computeWheelStints(laps, car)
    const wheelsChangedByLap = new Map<number, Wheel[]>()
    for (const wheel of WHEELS) {
      const stints = wheels[wheel]
      // Stint 0 is the tyres the car started the session on — not a
      // "change" to report.
      for (let i = 1; i < stints.length; i++) {
        const lap = stints[i].startLap
        const arr = wheelsChangedByLap.get(lap)
        if (arr) arr.push(wheel)
        else wheelsChangedByLap.set(lap, [wheel])
      }
    }
    if (wheelsChangedByLap.size === 0) continue

    const carLaps = laps.filter((l) => l.car_number === car)
    for (const [lapNumber, wheelsChanged] of wheelsChangedByLap) {
      const lap = carLaps.find((l) => l.lap_number === lapNumber)
      entries.push({
        type: 'TyreChange',
        raceLogItemId: `tyre-change-${car}-${lapNumber}`,
        lapNumber,
        ts: '',
        elapsedTimeMillis: (lap?.elapsed_seconds ?? 0) * 1000,
        pid: 0,
        carNumber: car,
        classId: lap?.class ?? '',
        text: wheelsChanged.map((w) => WHEEL_LABELS[w]).join('/'),
      })
    }
  }
  return entries
}
