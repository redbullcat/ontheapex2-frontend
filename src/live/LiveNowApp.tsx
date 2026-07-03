import { useEffect, type CSSProperties } from 'react'
import { useLiveState } from './useLiveState'
import { formatGap, formatLapTime } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'
import { classifyFlag, FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import '../replay/replay.css'
import './live.css'

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

// This is a first cut, deliberately simpler than the historical Replay
// console: it shows whatever the backend's in-memory live state currently
// knows (see app/live/state.py), which today is position/gap and completed
// laps only — no live sector-by-sector splits or pit status yet. Extend
// once the backend pipeline is persisting and the message-to-row mapping
// has proven out further.
export function LiveNowApp() {
  const griiipSessionId = Number(readParam('sid')) || null
  const title = readParam('title') || 'Live Now'

  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const theme = stored === 'light' || stored === 'dark' ? stored : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const live = useLiveState(griiipSessionId)

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

  if (live.status === 'error' || !live.data) {
    return (
      <div className="replay-root">
        <p className="replay-hint">
          No live session running for sid {griiipSessionId}. Start it first via POST /api/live/{griiipSessionId}/start.
        </p>
      </div>
    )
  }

  const { data } = live
  const flagCategory = classifyFlag(data.current_flag)
  const recentLaps = [...data.laps].sort((a, b) => b.elapsed_seconds! - a.elapsed_seconds!).slice(0, 15)

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
            {data.weather && (
              <span className="live-weather">
                Track {data.weather.trackTemperature?.toFixed(0)}°C · Air {data.weather.temperature?.toFixed(0)}°C
              </span>
            )}
          </div>
        </div>

        <div className="replay-leaderboard-panel">
          <p className="replay-panel-label">Standings — polling every 2s</p>
          <div className="replay-board-wrap">
            <table className="replay-board">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th className="al">Class</th>
                  <th className="al">Car</th>
                  <th className="al">Driver</th>
                  <th className="al">Team</th>
                  <th>Gap</th>
                  <th>Int</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((row) => (
                  <tr key={row.car_number} className="replay-row">
                    <td className="num pos">{row.position ?? '—'}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="replay-leaderboard-panel">
          <p className="replay-panel-label">Most recent laps</p>
          <div className="replay-board-wrap">
            <table className="replay-board">
              <thead>
                <tr>
                  <th className="al">Car</th>
                  <th>Lap</th>
                  <th>Time</th>
                  <th className="al">Driver</th>
                </tr>
              </thead>
              <tbody>
                {recentLaps.map((lap) => (
                  <tr key={`${lap.car_number}-${lap.lap_number}`} className="replay-row">
                    <td className="al">
                      <span className="car-num">#{lap.car_number}</span>
                    </td>
                    <td className="num">{lap.lap_number}</td>
                    <td className="num last">{formatLapTime(lap.lap_time_seconds)}</td>
                    <td className="al driver">{lap.driver_name ?? '—'}</td>
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
