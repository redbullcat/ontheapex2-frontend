import { useMemo } from 'react'
import type { LiveLap } from '../api/types'
import type { CarMeta } from '../replay/replayData'
import { computeReferenceAndGaps, computePositionByLap } from '../lib/trendData'
import type { TrendChartData } from '../replay/ReplayTrendChart'

// Live has no precomputed per-lap gap/position map the way Replay does from
// a full historical CSV (replayData.ts) — it only has whatever laps have
// completed so far via the polling feed. Recomputed from scratch on every
// poll tick (cheap enough: even a 6h race tops out around a few thousand
// completed-lap rows).
export function useLiveTrendData(laps: LiveLap[]): TrendChartData {
  return useMemo(() => {
    const lastLapByCar = new Map<string, LiveLap>()
    for (const lap of laps) {
      if (lap.lap_number == null) continue
      const prev = lastLapByCar.get(lap.car_number)
      if (!prev || lap.lap_number > prev.lap_number) lastLapByCar.set(lap.car_number, lap)
    }
    const cars: CarMeta[] = [...lastLapByCar.entries()]
      .map(([car_number, lap]) => ({ car_number, class: lap.class ?? 'Unknown', team: lap.team }))
      .sort((a, b) => a.car_number.localeCompare(b.car_number, undefined, { numeric: true }))
    const classes = [...new Set(cars.map((c) => c.class))].sort()

    const { gapByLapAndCar } = computeReferenceAndGaps(laps)
    const positionByLapAndCar = computePositionByLap(laps)

    return { cars, classes, gapByLapAndCar, positionByLapAndCar }
  }, [laps])
}
