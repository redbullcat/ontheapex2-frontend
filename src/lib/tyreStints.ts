import type { LapRead } from '../api/types'

export interface WheelStint {
  compound: string | null
  startLap: number
  endLap: number
  lapCount: number
}

export type Wheel = 'fl' | 'fr' | 'rl' | 'rr'
export const WHEELS: Wheel[] = ['fl', 'fr', 'rl', 'rr']

function wheelFields(lap: LapRead, wheel: Wheel): { compound: string | null; age: number | null; changed: boolean } {
  switch (wheel) {
    case 'fl':
      return { compound: lap.tire_fl_compound ?? null, age: lap.tire_fl_age_laps ?? null, changed: Boolean(lap.tire_fl_changed) }
    case 'fr':
      return { compound: lap.tire_fr_compound ?? null, age: lap.tire_fr_age_laps ?? null, changed: Boolean(lap.tire_fr_changed) }
    case 'rl':
      return { compound: lap.tire_rl_compound ?? null, age: lap.tire_rl_age_laps ?? null, changed: Boolean(lap.tire_rl_changed) }
    case 'rr':
      return { compound: lap.tire_rr_compound ?? null, age: lap.tire_rr_age_laps ?? null, changed: Boolean(lap.tire_rr_changed) }
  }
}

// One wheel's own stint history for one car, tracked independently of the
// other three — a pit stop that only swaps 1-3 wheels shows up as exactly
// those wheels' stints breaking, not the whole car's.
//
// Boundaries come primarily from that wheel's own age_laps resetting or
// decreasing lap over lap, not from Griiip's isChanged event flag: age is a
// value re-sent on every lap, so a dropped live-feed message for one lap
// just delays detection by a lap rather than losing the change entirely,
// whereas isChanged is a one-shot event that a single dropped message loses
// for good — confirmed missing for real on this app's own live captures
// before (see app/live/state.py's stale-tyre self-heal on the backend).
// isChanged firing is still kept as a secondary signal for whatever the age
// heuristic alone might miss (e.g. a same-age swap).
export function computeWheelStints(laps: LapRead[], carNumber: string): Record<Wheel, WheelStint[]> {
  const carLaps = laps.filter((l) => l.car_number === carNumber).sort((a, b) => a.lap_number - b.lap_number)

  const result = {} as Record<Wheel, WheelStint[]>
  for (const wheel of WHEELS) {
    const stints: WheelStint[] = []
    let prevAge: number | null = null
    let prevCompound: string | null = null
    for (const lap of carLaps) {
      const { compound, age, changed } = wheelFields(lap, wheel)
      if (compound == null) continue
      const last = stints[stints.length - 1]
      const isReset = age != null && prevAge != null && age < prevAge
      const compoundChanged = prevCompound != null && compound !== prevCompound
      if (!last || isReset || compoundChanged || changed) {
        stints.push({ compound, startLap: lap.lap_number, endLap: lap.lap_number, lapCount: 1 })
      } else {
        last.endLap = lap.lap_number
        last.lapCount += 1
      }
      prevAge = age
      prevCompound = compound
    }
    result[wheel] = stints
  }
  return result
}
