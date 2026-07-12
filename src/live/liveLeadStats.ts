import type { LiveLap } from '../api/types'
import { computePositionByLap } from '../lib/trendData'
import { getTeamDisplayName } from '../lib/identityColors'

export interface LedRow {
  key: string
  label: string
  sub: string | null
  lapsLed: number
  totalLaps: number
  percent: number
}

// Same ranking computePositionByLap already does for the position/gap trend
// charts and CarDetailModal's own "% led" stat (computeCarSummary in
// lib/carDetail.ts) — position 1 at a given lap number is that lap's
// leader. Grouped by car or by driver (a driver can accumulate laps led
// across more than one stint in the same car).
export function computeLedRows(laps: LiveLap[], by: 'car' | 'driver'): LedRow[] {
  const positionByLapAndCar = computePositionByLap(laps)
  const totalScoredLaps = positionByLapAndCar.size

  const driverByCarLap = new Map<string, string | null>()
  const teamByCar = new Map<string, string | null>()
  for (const lap of laps) {
    driverByCarLap.set(`${lap.car_number}:${lap.lap_number}`, lap.driver_name)
    if (!teamByCar.has(lap.car_number)) teamByCar.set(lap.car_number, lap.team)
  }

  const lapsLedByKey = new Map<string, { label: string; sub: string | null; lapsLed: number }>()
  for (const [lapNumber, byCarMap] of positionByLapAndCar) {
    for (const [car, position] of byCarMap) {
      if (position !== 1) continue
      const key = by === 'car' ? car : (driverByCarLap.get(`${car}:${lapNumber}`) ?? 'Unknown driver')
      const label = by === 'car' ? `#${car}` : key
      const sub = by === 'car' ? getTeamDisplayName(teamByCar.get(car) ?? null) : `#${car}`
      const entry = lapsLedByKey.get(key) ?? { label, sub, lapsLed: 0 }
      entry.lapsLed += 1
      lapsLedByKey.set(key, entry)
    }
  }

  return [...lapsLedByKey.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      sub: v.sub,
      lapsLed: v.lapsLed,
      totalLaps: totalScoredLaps,
      percent: totalScoredLaps > 0 ? (v.lapsLed / totalScoredLaps) * 100 : 0,
    }))
    .sort((a, b) => b.lapsLed - a.lapsLed)
}
