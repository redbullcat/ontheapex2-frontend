import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useLiveState } from './useLiveState'
import { useSessionClock } from './useSessionClock'
import { formatGap, formatLapTime, formatClock, formatSplit } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'
import { classifyFlag, FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import { ClassFilter } from '../components/ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { RACE_LOG_TYPE_LABELS, formatRaceLogEntry } from './raceLog'
import type { LiveLap, RaceLogType } from '../api/types'
import '../replay/replay.css'
import './live.css'

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

const ALL_LOG_TYPES: RaceLogType[] = ['RCMessage', 'RaceFlag', 'DriverSwap', 'FastestLap', 'PitIn', 'PitOut']

// This is a first cut, deliberately simpler than the historical Replay
// console in a few ways that need a live session to build against safely:
// no tap-to-inspect car detail modal, no track map / circle-of-doom, and no
// tyre compound/age (unconfirmed data source — see app/live/state.py notes).
export function LiveNowApp() {
  const griiipSessionId = Number(readParam('sid')) || null
  const title = readParam('title') || 'Live Now'

  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const theme = stored === 'light' || stored === 'dark' ? stored : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const live = useLiveState(griiipSessionId)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [logTypeFilter, setLogTypeFilter] = useState<Set<RaceLogType>>(new Set(ALL_LOG_TYPES))

  const data = live.data
  const classes = useMemo(() => [...new Set((data?.standings ?? []).map((r) => r.class ?? 'Unknown'))].sort(), [data])
  const activeClasses = useMemo(() => resolveClassSelection(classSelection, classes), [classSelection, classes])
  const clock = useSessionClock(data?.session_clock ?? null)

  // Each car's most recent lap, for the S1/S2/S3 columns — standings itself
  // only carries position/gap, sector splits live on the lap rows.
  const lastLapByCar = useMemo(() => {
    const map = new Map<string, LiveLap>()
    for (const lap of data?.laps ?? []) {
      const prev = map.get(lap.car_number)
      if (!prev || lap.lap_number > prev.lap_number) map.set(lap.car_number, lap)
    }
    return map
  }, [data])

  const visibleLog = useMemo(() => (data?.race_log ?? []).filter((e) => logTypeFilter.has(e.type)).slice(0, 60), [data, logTypeFilter])

  function toggleLogType(t: RaceLogType) {
    setLogTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next.size === 0 ? new Set(ALL_LOG_TYPES) : next
    })
  }

  if (griiipSessionId == null) {
    return (
      <div className="replay-root">
        <p className="replay-hint">No session specified — add ?sid=&lt;griiip session id&gt; to the URL.</p>
      </div>
    )
  }

  if (live.status === 'loading') {
    return (
      <div className="replay-root">
        <p className="replay-hint">Connecting…</p>
      </div>
    )
  }

  if (live.status === 'error' || !data) {
    return (
      <div className="replay-root">
        <p className="replay-hint">
          No live session running for sid {griiipSessionId}. Start it first via POST /api/live/{griiipSessionId}/start.
        </p>
      </div>
    )
  }

  const flagCategory = classifyFlag(data.current_flag)
  const visibleStandings = data.standings.filter((r) => activeClasses.has(r.class ?? 'Unknown'))

  return (
    <div className="replay-root">
      <div className="replay-console">
        <div className="replay-topbar">
          <div className="replay-session-id">
            <h2>{title}</h2>
            <span>{data.standings.length} cars</span>
          </div>
          <div className="replay-clock-block">
            <span className="replay-flag-pill" style={{ '--flag-color': FLAG_COLORS[flagCategory] } as CSSProperties}>
              {FLAG_LABELS[flagCategory]}
            </span>
            <span className="replay-clock-mode">Live</span>
            {clock.elapsedSeconds != null && (
              <div className="replay-clock">
                {formatClock(clock.elapsedSeconds)}
                {clock.remainingSeconds != null && <small> · {formatClock(clock.remainingSeconds)} left</small>}
              </div>
            )}
            {data.weather && (
              <span className="live-weather">
                Track {data.weather.trackTemperature?.toFixed(0)}°C · Air {data.weather.temperature?.toFixed(0)}°C
              </span>
            )}
          </div>
        </div>

        <div className="replay-leaderboard-panel">
          <p className="replay-panel-label">Standings — polling every 2s</p>
          <div className="replay-trend-controls">
            <ClassFilter classes={classes} selection={classSelection} onChange={setClassSelection} />
          </div>
          <div className="replay-board-wrap">
            <table className="replay-board">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Cls&nbsp;Pos</th>
                  <th className="al">Class</th>
                  <th className="al">Car</th>
                  <th className="al">Driver</th>
                  <th className="al">Team</th>
                  <th>Gap</th>
                  <th>Int</th>
                  <th>Lap</th>
                  <th>S1</th>
                  <th>S2</th>
                  <th>S3</th>
                  <th>Best</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {visibleStandings.map((row) => {
                  const lastLap = lastLapByCar.get(row.car_number)
                  return (
                    <tr key={row.car_number} className="replay-row">
                      <td className="num pos">{row.position ?? '—'}</td>
                      <td className="num cls-pos">{row.class_position ?? '—'}</td>
                      <td className="al">
                        <span className="class-chip">{row.class ?? '—'}</span>
                      </td>
                      <td className="al">
                        <span className="car-num">#{row.car_number}</span>
                      </td>
                      <td className="al driver">{row.driver_name ?? '—'}</td>
                      <td className="al team">{getTeamDisplayName(row.team)}</td>
                      <td className="num gap">{formatGap(row.gap_to_first_seconds)}</td>
                      <td className="num interval">{formatGap(row.gap_to_next_seconds)}</td>
                      <td className="num">{row.total_laps || ''}</td>
                      <td className={'num' + (lastLap?.s1_improvement ? ' badge-personal' : '')}>{formatSplit(lastLap?.s1_seconds ?? null)}</td>
                      <td className={'num' + (lastLap?.s2_improvement ? ' badge-personal' : '')}>{formatSplit(lastLap?.s2_seconds ?? null)}</td>
                      <td className={'num' + (lastLap?.s3_improvement ? ' badge-personal' : '')}>{formatSplit(lastLap?.s3_seconds ?? null)}</td>
                      <td className="num best">{formatLapTime(row.best_lap_seconds)}</td>
                      <td className="num last">{formatLapTime(row.last_lap_seconds)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visibleStandings.length === 0 && <p className="replay-hint">No cars in this class have started yet.</p>}
          </div>
        </div>

        <div className="replay-leaderboard-panel">
          <p className="replay-panel-label">
            Race log
            <span className="hint"> — race control, flags, driver swaps, fastest laps, pit in/out</span>
          </p>
          <div className="live-log-filters">
            {ALL_LOG_TYPES.map((t) => (
              <label className="class-filter-item" key={t}>
                <input type="checkbox" checked={logTypeFilter.has(t)} onChange={() => toggleLogType(t)} />
                <span>{RACE_LOG_TYPE_LABELS[t]}</span>
              </label>
            ))}
          </div>
          <ul className="live-log-list">
            {visibleLog.map((entry, i) => (
              <li key={`${entry.raceLogItemId}-${i}`} className={`live-log-item live-log-${entry.type}`}>
                <span className="live-log-time">{new Date(entry.ts).toLocaleTimeString()}</span>
                <span className="live-log-type">{RACE_LOG_TYPE_LABELS[entry.type]}</span>
                <span className="live-log-text">{formatRaceLogEntry(entry)}</span>
              </li>
            ))}
            {visibleLog.length === 0 && <p className="replay-hint">No events yet for the selected filters.</p>}
          </ul>
        </div>
      </div>
    </div>
  )
}
