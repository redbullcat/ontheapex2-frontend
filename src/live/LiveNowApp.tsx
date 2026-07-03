import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useLiveState } from './useLiveState'
import { useSessionClock } from './useSessionClock'
import { formatGap, formatLapTime, formatClock, formatSplit } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'
import { classifyFlag, FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import { ClassFilter } from '../components/ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { colorBadgeClass } from './liveColors'
import { LiveSidebar } from './LiveSidebar'
import { RaceLogPanel } from './RaceLogPanel'
import { LiveFastestLapsPanel } from './LiveFastestLapsPanel'
import { ReplayTrendChart } from '../replay/ReplayTrendChart'
import { useLiveTrendData } from './liveTrendData'
import { BackLink } from '../components/BackLink'
import { CarDetailModal } from '../components/CarDetailModal'
import { liveLapToLapRead } from '../lib/liveLapAdapter'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { LiveLap, LiveState } from '../api/types'
import '../replay/replay.css'
import './live.css'

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

// This is a first cut, deliberately simpler than the historical Replay
// console in a few ways that need a live session to build against safely:
// no tap-to-inspect car detail modal, no working track map / circle-of-doom
// yet (placeholder tabs in the sidebar), and no tyre compound/age
// (unconfirmed data source — see app/live/state.py notes).
export function LiveNowApp() {
  const griiipSessionId = Number(readParam('sid')) || null
  const title = readParam('title') || 'Live Now'
  const panel = readParam('panel')

  useDocumentTitle(`${title} — Live · On The Apex`)

  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const theme = stored === 'light' || stored === 'dark' ? stored : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const live = useLiveState(griiipSessionId)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

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

  // Called unconditionally (before the early returns below) so hook order
  // stays consistent across renders regardless of loading/error state.
  const trendData = useLiveTrendData(data?.laps ?? [])
  const leaderLap = useMemo(() => Math.max(0, ...(data?.standings ?? []).map((r) => r.total_laps)), [data])

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

  // A pop-out from the sidebar lands here with &panel=<tab> — render just
  // that one panel full-screen instead of the whole console.
  const POPOUT_TITLES: Record<string, string> = {
    'race-log': 'Race log',
    'fastest-laps': 'Fastest laps',
    gap: 'Gap evolution',
    position: 'Lap-by-lap position',
  }
  if (panel in POPOUT_TITLES) {
    return (
      <div className="replay-root">
        <div className="replay-console">
          <div className="replay-topbar">
            <div className="replay-session-id">
              <BackLink />
              <h2>
                {title} — {POPOUT_TITLES[panel]}
              </h2>
            </div>
          </div>
          <div className="replay-leaderboard-panel">
            {panel === 'race-log' && <RaceLogPanel entries={data.race_log} />}
            {panel === 'fastest-laps' && <LiveFastestLapsPanel laps={data.laps} standings={data.standings} />}
            {panel === 'gap' && <ReplayTrendChart data={trendData} mode="gap" currentLap={leaderLap} title="Gap evolution" />}
            {panel === 'position' && <ReplayTrendChart data={trendData} mode="position" currentLap={leaderLap} title="Lap-by-lap position" />}
          </div>
        </div>
      </div>
    )
  }

  return <LiveConsole data={data} title={title} griiipSessionId={griiipSessionId} classSelection={classSelection} setClassSelection={setClassSelection} classes={classes} activeClasses={activeClasses} clock={clock} lastLapByCar={lastLapByCar} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
}

function LiveConsole({
  data,
  title,
  griiipSessionId,
  classSelection,
  setClassSelection,
  classes,
  activeClasses,
  clock,
  lastLapByCar,
  sidebarOpen,
  setSidebarOpen,
}: {
  data: LiveState
  title: string
  griiipSessionId: number
  classSelection: ClassSelection
  setClassSelection: (s: ClassSelection) => void
  classes: string[]
  activeClasses: Set<string>
  clock: { elapsedSeconds: number | null; remainingSeconds: number | null }
  lastLapByCar: Map<string, LiveLap>
  sidebarOpen: boolean
  setSidebarOpen: (fn: (open: boolean) => boolean) => void
}) {
  const flagCategory = classifyFlag(data.current_flag)
  const visibleStandings = data.standings.filter((r) => activeClasses.has(r.class ?? 'Unknown'))
  const [selectedCar, setSelectedCar] = useState<string | null>(null)

  // Live's own laps are already "as of now" by definition — no clock-based
  // filtering needed the way Replay needs (see ReplayApp.tsx). Reshaped to
  // LapRead's shape so the car detail panel's reused historical chart
  // components (built for LapRead) work unmodified against live data too.
  const carDetailLaps = useMemo(() => {
    if (!selectedCar) return []
    return data.laps.map((lap, i) => liveLapToLapRead(lap, i))
  }, [data.laps, selectedCar])

  return (
    <div className="replay-root live-with-sidebar">
      <div className="replay-console live-main">
        <div className="replay-topbar">
          <div className="replay-session-id">
            <BackLink />
            <h2>{title}</h2>
            <span>{data.standings.length} cars</span>
          </div>
          <div className="replay-clock-block">
            {data.session_ended ? (
              <span className="live-chequered-pill">🏁 Session complete</span>
            ) : (
              <span className="replay-flag-pill" style={{ '--flag-color': FLAG_COLORS[flagCategory] } as CSSProperties}>
                {FLAG_LABELS[flagCategory]}
              </span>
            )}
            {data.chequered_flag_shown && !data.session_ended && (
              <span className="live-chequered-hint">Cars on track are completing their final lap</span>
            )}
            <span className="replay-clock-mode">{data.session_ended ? 'Ended' : 'Live'}</span>
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
          <p className="replay-panel-label">{data.session_ended ? 'Final standings' : 'Standings — polling every 2s'}</p>
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
                    <tr
                      key={row.car_number}
                      className={row.in_pit ? 'replay-row in-pit clickable' : 'replay-row clickable'}
                      onClick={() => setSelectedCar(row.car_number)}
                    >
                      <td className="num pos">{row.position ?? '—'}</td>
                      <td className="num cls-pos">{row.class_position ?? '—'}</td>
                      <td className="al">
                        <span className="class-chip">{row.class ?? '—'}</span>
                      </td>
                      <td className="al">
                        <span className="car-num">#{row.car_number}</span>
                        {row.taken_chequered_flag && <span title="Taken the chequered flag">🏁</span>}
                      </td>
                      <td className="al driver">{row.driver_name ?? '—'}</td>
                      <td className="al team">{getTeamDisplayName(row.team)}</td>
                      <td className="num gap">{formatGap(row.gap_to_first_seconds, row.gap_to_first_laps)}</td>
                      <td className="num interval">{formatGap(row.gap_to_next_seconds, row.gap_to_next_laps)}</td>
                      <td className="num">{row.total_laps || ''}</td>
                      {row.in_pit ? (
                        <td className="num s-merged" colSpan={3}>
                          <span className="pit-label">IN PIT</span>
                        </td>
                      ) : (
                        <>
                          <td className={'num' + colorBadgeClass(lastLap?.s1_color ?? null)}>{formatSplit(lastLap?.s1_seconds ?? null)}</td>
                          <td className={'num' + colorBadgeClass(lastLap?.s2_color ?? null)}>{formatSplit(lastLap?.s2_seconds ?? null)}</td>
                          <td className={'num' + colorBadgeClass(lastLap?.s3_color ?? null)}>{formatSplit(lastLap?.s3_seconds ?? null)}</td>
                        </>
                      )}
                      <td className="num best">{formatLapTime(row.best_lap_seconds)}</td>
                      <td className={'num last' + colorBadgeClass(row.last_lap_color)}>{formatLapTime(row.last_lap_seconds)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visibleStandings.length === 0 && <p className="replay-hint">No cars in this class have started yet.</p>}
          </div>
        </div>
      </div>

      <LiveSidebar
        data={data}
        griiipSessionId={griiipSessionId}
        title={title}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
      />

      {selectedCar && <CarDetailModal carNumber={selectedCar} allLaps={carDetailLaps} onClose={() => setSelectedCar(null)} />}
    </div>
  )
}
