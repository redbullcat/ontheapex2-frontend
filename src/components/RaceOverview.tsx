import { useMemo } from 'react'
import type { LapRead, LeadStint } from '../api/types'
import { LeadHistoryChart } from './LeadHistoryChart'
import { getTeamColor } from '../lib/identityColors'

interface PodiumRow {
  position: number
  car: string
  team: string | null
  drivers: string
  laps: number
}

function computeOverview(laps: LapRead[]) {
  const filtered = laps.filter((l) => l.elapsed_seconds != null && l.lap_number != null)
  const totalLaps = new Set(filtered.map((l) => l.lap_number)).size
  const carCount = new Set(filtered.map((l) => l.car_number)).size
  const classCount = new Set(filtered.map((l) => l.class ?? 'Unknown')).size

  const lastLapByCar = new Map<string, LapRead>()
  for (const lap of filtered) {
    const prev = lastLapByCar.get(lap.car_number)
    if (!prev || lap.lap_number > prev.lap_number) lastLapByCar.set(lap.car_number, lap)
  }
  const classification = [...lastLapByCar.values()].sort(
    (a, b) => b.lap_number - a.lap_number || a.elapsed_seconds! - b.elapsed_seconds!,
  )

  const driversByCar = new Map<string, Set<string>>()
  for (const lap of filtered) {
    if (!lap.driver_name) continue
    const set = driversByCar.get(lap.car_number)
    if (set) set.add(lap.driver_name)
    else driversByCar.set(lap.car_number, new Set([lap.driver_name]))
  }

  const podium: PodiumRow[] = classification.slice(0, 3).map((lap, i) => ({
    position: i + 1,
    car: lap.car_number,
    team: lap.team,
    drivers: [...(driversByCar.get(lap.car_number) ?? [])].sort().join(' / '),
    laps: lap.lap_number,
  }))

  let fastestLap: LapRead | null = null
  for (const lap of filtered) {
    if (lap.lap_time_seconds == null) continue
    if (!fastestLap || lap.lap_time_seconds < fastestLap.lap_time_seconds!) fastestLap = lap
  }

  return { totalLaps, carCount, classCount, podium, fastestLap }
}

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export function RaceOverview({ laps, leadHistory }: { laps: LapRead[]; leadHistory: LeadStint[] }) {
  const overview = useMemo(() => computeOverview(laps), [laps])

  return (
    <div className="race-overview">
      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">Laps</span>
          <span className="stat-value">{overview.totalLaps}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Cars</span>
          <span className="stat-value">{overview.carCount}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Classes</span>
          <span className="stat-value">{overview.classCount}</span>
        </div>
        {overview.fastestLap && (
          <div className="stat-tile">
            <span className="stat-label">Fastest lap</span>
            <span className="stat-value">
              {formatLapTime(overview.fastestLap.lap_time_seconds!)}
              <span className="stat-value-sub"> #{overview.fastestLap.car_number}</span>
            </span>
          </div>
        )}
      </div>

      <h3 className="race-overview-subheading">Podium</h3>
      <div className="podium-row">
        {overview.podium.map((row) => (
          <div className="podium-tile" key={row.car}>
            <span className="podium-position">P{row.position}</span>
            <span className="team-key" style={{ background: getTeamColor(row.team) }} />
            <div className="podium-details">
              <span className="podium-car">
                #{row.car} {row.team ? `— ${row.team}` : ''}
              </span>
              <span className="podium-drivers">{row.drivers || '—'}</span>
              <span className="podium-laps">{row.laps} laps</span>
            </div>
          </div>
        ))}
      </div>

      {leadHistory.length > 0 && (
        <>
          <h3 className="race-overview-subheading">Who led</h3>
          <LeadHistoryChart stints={leadHistory} />
        </>
      )}
    </div>
  )
}
