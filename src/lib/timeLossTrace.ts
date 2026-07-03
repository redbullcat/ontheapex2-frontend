import type { LapRead } from '../api/types'
import { computeSectorFractions } from './trackFraction'

export interface TimeLossPoint {
  fraction: number
  label: string
  // Positive = slower than reference at this point in the lap (losing
  // time), negative = faster (gaining time) — standard delta convention.
  // Null when either lap's split at this point isn't known (a blank split,
  // "split not recorded" in the leaderboard's own terms).
  delta: number | null
}

export interface TimeLossResult {
  points: TimeLossPoint[]
  targetLapNumber: number
  targetLapTime: number | null
  referenceCarNumber: string
  referenceDriverName: string | null
  referenceLapNumber: number
  referenceLapTime: number | null
  // True when no other car in class had a clean lap to compare against,
  // so the reference fell back to this car's own best lap instead.
  referenceIsOwnBest: boolean
}

function cumulativeSplits(lap: {
  s1_seconds: number | null
  s2_seconds: number | null
  lap_time_seconds: number | null
}): [number, number | null, number | null, number | null] {
  const t1 = lap.s1_seconds
  const t2 = t1 != null && lap.s2_seconds != null ? t1 + lap.s2_seconds : null
  // The lap's own recorded total, not s1+s2+s3 summed — stays correct even
  // when a split went unrecorded but the full lap time is still known.
  const t3 = lap.lap_time_seconds
  return [0, t1, t2, t3]
}

const isGreenFlag = (l: LapRead) => !l.flag_at_fl || l.flag_at_fl.toUpperCase() === 'GF'

// Compares one specific completed lap against the fastest clean lap set so
// far in the same class, at each sector boundary — "where in the lap is
// time actually being gained or lost", not just the sector totals. Can
// only ever use completed laps: the live feed only exposes a lap's splits
// once the whole lap finishes (see backend app/live/state.py's
// _handle_laps), so there's no way to build this up as the current lap is
// still being driven.
export function computeTimeLossTrace(laps: LapRead[], carNumber: string, lapNumber?: number): TimeLossResult | null {
  const carLaps = laps.filter((l) => l.car_number === carNumber && l.lap_time_seconds != null)
  if (carLaps.length === 0) return null

  const target =
    lapNumber != null ? carLaps.find((l) => l.lap_number === lapNumber) : carLaps.reduce((a, b) => (b.lap_number > a.lap_number ? b : a))
  if (!target) return null

  const classLaps = laps.filter((l) => l.class === target.class && l.lap_time_seconds != null && isGreenFlag(l))
  const pool = classLaps.length > 0 ? classLaps : carLaps
  const reference = pool.reduce((best: LapRead | null, l) => (best == null || l.lap_time_seconds! < best.lap_time_seconds! ? l : best), null)
  if (!reference) return null

  const [s1Frac, s2Frac] = computeSectorFractions(laps) ?? [1 / 3, 2 / 3]
  const xs: [number, string][] = [
    [0, 'Start'],
    [s1Frac, 'S1'],
    [s2Frac, 'S2'],
    [1, 'Finish'],
  ]

  const targetCum = cumulativeSplits(target)
  const refCum = cumulativeSplits(reference)

  const points: TimeLossPoint[] = xs.map(([fraction, label], i) => {
    const t = targetCum[i]
    const r = refCum[i]
    return { fraction, label, delta: t != null && r != null ? t - r : null }
  })

  return {
    points,
    targetLapNumber: target.lap_number,
    targetLapTime: target.lap_time_seconds,
    referenceCarNumber: reference.car_number,
    referenceDriverName: reference.driver_name,
    referenceLapNumber: reference.lap_number,
    referenceLapTime: reference.lap_time_seconds,
    referenceIsOwnBest: reference.car_number === carNumber,
  }
}
