import { useMemo, useState } from 'react'
import type { LapRead } from '../api/types'
import { ClassFilter } from './ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { getTeamDisplayName } from '../lib/identityColors'

const FLAG_LABELS: Record<string, string> = {
  GF: 'Green',
  GREEN: 'Green',
  SF: 'Safety Car',
  FCY: 'Full Course Yellow',
  YF: 'Yellow',
  YELLOW: 'Yellow',
  RF: 'Red',
  RED: 'Red',
  CF: 'Checkered',
}

function flagLabel(flag: string | null): string {
  if (!flag) return 'Green'
  return FLAG_LABELS[flag.toUpperCase()] ?? flag
}

interface LeaderAtLap {
  lap: number
  car: string
  class: string
}

interface LedRow {
  key: string
  label: string
  laps: number
  pct: number
}

function computeStats(laps: LapRead[], activeClasses: Set<string>) {
  const filtered = laps.filter((l) => activeClasses.has(l.class ?? 'Unknown') && l.elapsed_seconds != null)

  const byLap = new Map<number, LapRead[]>()
  for (const lap of filtered) {
    const arr = byLap.get(lap.lap_number)
    if (arr) arr.push(lap)
    else byLap.set(lap.lap_number, [lap])
  }

  const leaders: LeaderAtLap[] = []
  for (const [lap, rows] of [...byLap.entries()].sort((a, b) => a[0] - b[0])) {
    let best: LapRead | null = null
    for (const r of rows) {
      if (!best || r.elapsed_seconds! < best.elapsed_seconds!) best = r
    }
    if (best) leaders.push({ lap, car: best.car_number, class: best.class ?? 'Unknown' })
  }

  let leadChanges = 0
  const carsLed = new Set<string>()
  for (let i = 0; i < leaders.length; i++) {
    carsLed.add(leaders[i].car)
    if (i > 0 && leaders[i].car !== leaders[i - 1].car) leadChanges++
  }

  // Longest consecutive run by the same leader.
  let longestCar = leaders[0]?.car ?? null
  let longestLaps = 0
  let runCar: string | null = null
  let runLaps = 0
  for (const l of leaders) {
    if (l.car === runCar) {
      runLaps++
    } else {
      runCar = l.car
      runLaps = 1
    }
    if (runLaps > longestLaps) {
      longestLaps = runLaps
      longestCar = runCar
    }
  }

  const lapsByFlag = new Map<string, number>()
  const seenLapsForFlag = new Set<number>()
  for (const lap of filtered) {
    if (seenLapsForFlag.has(lap.lap_number)) continue
    seenLapsForFlag.add(lap.lap_number)
    const label = flagLabel(lap.flag_at_fl)
    lapsByFlag.set(label, (lapsByFlag.get(label) ?? 0) + 1)
  }

  const totalLeaderLaps = leaders.length

  const lapsLedByCar = new Map<string, { team: string | null; laps: number }>()
  for (const l of leaders) {
    const row = lapsLedByCar.get(l.car)
    const team = filtered.find((r) => r.car_number === l.car)?.team ?? null
    if (row) row.laps++
    else lapsLedByCar.set(l.car, { team, laps: 1 })
  }
  const ledByCar: LedRow[] = [...lapsLedByCar.entries()]
    .map(([car, v]) => ({
      key: car,
      label: `#${car}${v.team ? ` — ${getTeamDisplayName(v.team)}` : ''}`,
      laps: v.laps,
      pct: totalLeaderLaps > 0 ? (v.laps / totalLeaderLaps) * 100 : 0,
    }))
    .sort((a, b) => b.laps - a.laps)

  const lapsLedByDriver = new Map<string, number>()
  for (const l of leaders) {
    const driver = filtered.find((r) => r.car_number === l.car && r.lap_number === l.lap)?.driver_name ?? 'Unknown'
    lapsLedByDriver.set(driver, (lapsLedByDriver.get(driver) ?? 0) + 1)
  }
  const ledByDriver: LedRow[] = [...lapsLedByDriver.entries()]
    .map(([driver, count]) => ({
      key: driver,
      label: driver,
      laps: count,
      pct: totalLeaderLaps > 0 ? (count / totalLeaderLaps) * 100 : 0,
    }))
    .sort((a, b) => b.laps - a.laps)

  const totalLaps = new Set(filtered.map((l) => l.lap_number)).size

  return {
    totalLaps,
    leadChanges,
    carsLed: carsLed.size,
    longestCar,
    longestLaps,
    lapsByFlag: [...lapsByFlag.entries()].sort((a, b) => b[1] - a[1]),
    ledByCar,
    ledByDriver,
  }
}

export function RaceStats({ laps }: { laps: LapRead[] }) {
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)

  const allClasses = useMemo(() => {
    const s = new Set<string>()
    for (const lap of laps) s.add(lap.class ?? 'Unknown')
    return [...s].sort()
  }, [laps])

  const activeClasses = useMemo(
    () => resolveClassSelection(classSelection, allClasses),
    [classSelection, allClasses],
  )

  const stats = useMemo(() => computeStats(laps, activeClasses), [laps, activeClasses])

  return (
    <div className="race-stats">
      <div className="chart-controls">
        <ClassFilter classes={allClasses} selection={classSelection} onChange={setClassSelection} />
      </div>
      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">Race laps</span>
          <span className="stat-value">{stats.totalLaps}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Lead changes</span>
          <span className="stat-value">{stats.leadChanges}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Cars that led</span>
          <span className="stat-value">{stats.carsLed}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Longest lead stint</span>
          <span className="stat-value">
            {stats.longestLaps} laps{stats.longestCar ? ` (#${stats.longestCar})` : ''}
          </span>
        </div>
        {stats.lapsByFlag.map(([label, count]) => (
          <div className="stat-tile" key={label}>
            <span className="stat-label">{label} laps</span>
            <span className="stat-value">{count}</span>
          </div>
        ))}
      </div>

      <div className="race-stats-tables">
        <div>
          <h3>Laps led by car</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Laps led</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {stats.ledByCar.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.laps}</td>
                    <td>{row.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Laps led by driver</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Laps led</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {stats.ledByDriver.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.laps}</td>
                    <td>{row.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
