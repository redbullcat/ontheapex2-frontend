import type { LapRead } from '../api/types'

export interface TyreStint {
  compound: string | null
  startLap: number
  endLap: number
  lapCount: number
}

function representativeCompound(lap: LapRead): string | null {
  return lap.tire_fl_compound ?? lap.tire_fr_compound ?? lap.tire_rl_compound ?? lap.tire_rr_compound ?? null
}

function wasChanged(lap: LapRead): boolean {
  return Boolean(lap.tire_fl_changed || lap.tire_fr_changed || lap.tire_rl_changed || lap.tire_rr_changed)
}

// Groups one car's laps into tyre stints — mirrors computeCarStints's
// accumulator/flush pattern (lib/stints.ts), but the boundary is a tyre
// change rather than a driver change: either the compound itself differs
// from the previous lap, or Griiip's own isChanged flag fired (a same-
// compound swap wouldn't otherwise show up as a boundary at all).
export function computeTyreStints(laps: LapRead[], carNumber: string): TyreStint[] {
  const carLaps = laps
    .filter((l) => l.car_number === carNumber && representativeCompound(l) != null)
    .sort((a, b) => a.lap_number - b.lap_number)

  const stints: TyreStint[] = []
  for (const lap of carLaps) {
    const compound = representativeCompound(lap)
    const last = stints[stints.length - 1]
    if (!last || wasChanged(lap) || last.compound !== compound) {
      stints.push({ compound, startLap: lap.lap_number, endLap: lap.lap_number, lapCount: 1 })
    } else {
      last.endLap = lap.lap_number
      last.lapCount += 1
    }
  }
  return stints
}
