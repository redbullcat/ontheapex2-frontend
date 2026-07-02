import { useMemo } from 'react'
import type { LapRead, LeadStint } from '../api/types'
import { LeadHistoryPanel } from './LeadHistoryPanel'
import { getTeamColor, getTeamDisplayName } from '../lib/identityColors'

interface PodiumRow {
  position: number
  car: string
  team: string | null
  drivers: string
  laps: number
}

interface ClassSummary {
  cls: string
  podium: PodiumRow[]
  fastestLap: LapRead | null
  carCount: number
  finishedCount: number
}

// A car is treated as "finished"/classified once it completes at least this
// fraction of the class (or overall) leader's total laps — endurance racing
// convention for who counts as a finisher rather than a retirement, since
// the raw lap data carries no explicit DNF/status flag.
const FINISH_THRESHOLD = 0.75

function computeOverview(laps: LapRead[]) {
  const filtered = laps.filter((l) => l.elapsed_seconds != null && l.lap_number != null)
  const totalLaps = new Set(filtered.map((l) => l.lap_number)).size
  const carCount = new Set(filtered.map((l) => l.car_number)).size
  const allClasses = [...new Set(filtered.map((l) => l.class ?? 'Unknown'))].sort()

  const lastLapByCar = new Map<string, LapRead>()
  for (const lap of filtered) {
    const prev = lastLapByCar.get(lap.car_number)
    if (!prev || lap.lap_number > prev.lap_number) lastLapByCar.set(lap.car_number, lap)
  }

  const driversByCar = new Map<string, Set<string>>()
  for (const lap of filtered) {
    if (!lap.driver_name) continue
    const set = driversByCar.get(lap.car_number)
    if (set) set.add(lap.driver_name)
    else driversByCar.set(lap.car_number, new Set([lap.driver_name]))
  }

  function classify(rows: LapRead[]): LapRead[] {
    return [...rows].sort((a, b) => b.lap_number - a.lap_number || a.elapsed_seconds! - b.elapsed_seconds!)
  }

  function podiumFor(sorted: LapRead[]): PodiumRow[] {
    return sorted.slice(0, 3).map((lap, i) => ({
      position: i + 1,
      car: lap.car_number,
      team: lap.team,
      drivers: [...(driversByCar.get(lap.car_number) ?? [])].sort().join(' / '),
      laps: lap.lap_number,
    }))
  }

  function fastestOf(rows: LapRead[]): LapRead | null {
    let best: LapRead | null = null
    for (const lap of rows) {
      if (lap.lap_time_seconds == null) continue
      if (!best || lap.lap_time_seconds < best.lap_time_seconds!) best = lap
    }
    return best
  }

  function finishedCount(sorted: LapRead[]): number {
    if (sorted.length === 0) return 0
    const leaderLaps = sorted[0].lap_number
    return sorted.filter((l) => l.lap_number >= leaderLaps * FINISH_THRESHOLD).length
  }

  const overallClassification = classify([...lastLapByCar.values()])
  const podium = podiumFor(overallClassification)
  const fastestLap = fastestOf(filtered)

  const perClass: ClassSummary[] = allClasses.map((cls) => {
    const classLastLaps = [...lastLapByCar.values()].filter((l) => (l.class ?? 'Unknown') === cls)
    const sorted = classify(classLastLaps)
    const classFiltered = filtered.filter((l) => (l.class ?? 'Unknown') === cls)
    return {
      cls,
      podium: podiumFor(sorted),
      fastestLap: fastestOf(classFiltered),
      carCount: sorted.length,
      finishedCount: finishedCount(sorted),
    }
  })

  return {
    totalLaps,
    carCount,
    classCount: allClasses.length,
    podium,
    fastestLap,
    finishedCount: finishedCount(overallClassification),
    perClass,
  }
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
        <div className="stat-tile">
          <span className="stat-label">Finished</span>
          <span className="stat-value">
            {overview.finishedCount}
            <span className="stat-value-sub"> / {overview.carCount}</span>
          </span>
        </div>
        {overview.fastestLap && (
          <div className="stat-tile">
            <span className="stat-label">Fastest lap</span>
            <span className="stat-value">
              {formatLapTime(overview.fastestLap.lap_time_seconds!)}
              <span className="stat-value-sub">
                {' '}
                #{overview.fastestLap.car_number}
                {overview.fastestLap.driver_name ? ` — ${overview.fastestLap.driver_name}` : ''}
              </span>
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
                #{row.car} {row.team ? `— ${getTeamDisplayName(row.team)}` : ''}
              </span>
              <span className="podium-drivers">{row.drivers || '—'}</span>
              <span className="podium-laps">{row.laps} laps</span>
            </div>
          </div>
        ))}
      </div>

      {overview.perClass.length > 1 &&
        overview.perClass.map((cls) => (
          <div key={cls.cls}>
            <h3 className="race-overview-subheading">
              {cls.cls} — Top 3 <span className="stat-value-sub">({cls.finishedCount} / {cls.carCount} finished)</span>
            </h3>
            <div className="podium-row">
              {cls.podium.map((row) => (
                <div className="podium-tile" key={row.car}>
                  <span className="podium-position">P{row.position}</span>
                  <span className="team-key" style={{ background: getTeamColor(row.team) }} />
                  <div className="podium-details">
                    <span className="podium-car">
                      #{row.car} {row.team ? `— ${getTeamDisplayName(row.team)}` : ''}
                    </span>
                    <span className="podium-drivers">{row.drivers || '—'}</span>
                    <span className="podium-laps">{row.laps} laps</span>
                  </div>
                </div>
              ))}
            </div>
            {cls.fastestLap && (
              <p className="hint">
                Fastest lap: {formatLapTime(cls.fastestLap.lap_time_seconds!)} — #{cls.fastestLap.car_number}
                {cls.fastestLap.driver_name ? ` — ${cls.fastestLap.driver_name}` : ''}
              </p>
            )}
          </div>
        ))}

      {(leadHistory.length > 0 || overview.perClass.length > 1) && (
        <>
          <h3 className="race-overview-subheading">Who led</h3>
          <LeadHistoryPanel laps={laps} overallStints={leadHistory} />
        </>
      )}
    </div>
  )
}
