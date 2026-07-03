import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getLaps } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { buildReplayData, type ReplayData } from './replayData'
import { useReplayClock } from './useReplayClock'
import { useReplaySnapshot } from './useReplayRows'
import { ReplayLeaderboard } from './ReplayLeaderboard'
import { ReplayTransport } from './ReplayTransport'
import { ReplaySidebar } from './ReplaySidebar'
import { ReplayFastestLapsPanel } from './ReplayFastestLapsPanel'
import { formatClock } from './format'
import { ClassFilter } from '../components/ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import { bucketFor } from '../lib/sessionBucket'
import { RaceLogPanel } from '../live/RaceLogPanel'
import { REPLAY_RACE_LOG_TYPES } from './raceLogSynth'
import type { RaceLogType, SessionType } from '../api/types'
import './replay.css'

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

function replayTimestampFormatter(elapsedTimeMillis: number): string {
  return formatClock(elapsedTimeMillis / 1000)
}

export function ReplayApp() {
  const sessionId = readParam('session')
  const title = readParam('title') || 'Live Timing Replay'
  const rawType = readParam('type')
  // Unset (e.g. an old bookmarked link from before this param existed)
  // defaults to treating it as a race — that's the safer default since
  // it's also what the entry point used to be gated to exclusively.
  const isRaceSession = rawType ? bucketFor(rawType as SessionType) === 'race' : true
  const panel = readParam('panel')

  // Mirrors the main app's stored theme so the two tabs stay visually
  // consistent — this view has no toggle of its own for v1.
  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const theme = stored === 'light' || stored === 'dark' ? stored : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const lapsState = useAsync(sessionId ? () => getLaps(Number(sessionId)) : null, [sessionId])

  const data = useMemo(() => {
    if (lapsState.status !== 'success') return null
    return buildReplayData(lapsState.data)
  }, [lapsState])

  return (
    <div className="replay-root">
      {!sessionId ? (
        <p className="replay-hint">No session specified.</p>
      ) : lapsState.status === 'loading' ? (
        <p className="replay-hint">Loading session…</p>
      ) : lapsState.status === 'error' ? (
        <p className="replay-hint">Failed to load laps: {lapsState.error}</p>
      ) : data && data.events.length > 0 ? (
        panel ? (
          <StandalonePanel panel={panel} data={data} title={title} />
        ) : (
          <ReplayConsole title={title} data={data} sessionId={sessionId} isRaceSession={isRaceSession} />
        )
      ) : (
        <p className="replay-hint">No lap data for this session.</p>
      )}
    </div>
  )
}

// A pop-out from the sidebar lands here with &panel=<tab> — render just
// that one panel full-screen. Race log/fastest laps are meaningful as a
// static, whole-session view outside the scrubbed clock (unlike inside the
// sidebar, where they track the current playback position) — showing
// everything is the more useful default for a dedicated tab/window.
function StandalonePanel({ panel, data, title }: { panel: string; data: ReplayData; title: string }) {
  const snapshot = useReplaySnapshot(data, data.maxTime)
  const activeClasses = useMemo(() => new Set(data.classes), [data])

  return (
    <div className="replay-console">
      <div className="replay-topbar">
        <h2>
          {title} — {panel === 'race-log' ? 'Race log' : 'Fastest laps'}
        </h2>
      </div>
      <div className="replay-leaderboard-panel">
        {panel === 'race-log' ? (
          <RaceLogPanel
            entries={data.raceLog}
            availableTypes={REPLAY_RACE_LOG_TYPES as unknown as RaceLogType[]}
            formatTimestamp={(entry) => replayTimestampFormatter(entry.elapsedTimeMillis)}
          />
        ) : (
          <ReplayFastestLapsPanel rows={snapshot.rows} activeClasses={activeClasses} />
        )}
      </div>
    </div>
  )
}

function ReplayConsole({
  title,
  data,
  sessionId,
  isRaceSession,
}: {
  title: string
  data: ReplayData
  sessionId: string
  isRaceSession: boolean
}) {
  const clock = useReplayClock(data.minTime, data.maxTime)
  const snapshot = useReplaySnapshot(data, clock.current)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [gapVisibleCars, setGapVisibleCars] = useState<Set<string>>(new Set())
  const [positionVisibleCars, setPositionVisibleCars] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const activeClasses = useMemo(() => resolveClassSelection(classSelection, data.classes), [classSelection, data.classes])

  // A chart's car filter only counts as a "highlight" once the user has
  // actually narrowed it away from the default (everything) — otherwise
  // every row would highlight, which isn't useful.
  const highlightedCars = useMemo(() => {
    const allCars = new Set(data.cars.map((c) => c.car_number))
    const gapIsFiltered = gapVisibleCars.size > 0 && gapVisibleCars.size < allCars.size
    const positionIsFiltered = positionVisibleCars.size > 0 && positionVisibleCars.size < allCars.size
    if (!gapIsFiltered && !positionIsFiltered) return undefined
    const merged = new Set<string>()
    if (gapIsFiltered) for (const c of gapVisibleCars) merged.add(c)
    if (positionIsFiltered) for (const c of positionVisibleCars) merged.add(c)
    return merged
  }, [data, gapVisibleCars, positionVisibleCars])

  const onGapVisibleCarsChange = useCallback((cars: Set<string>) => setGapVisibleCars(cars), [])
  const onPositionVisibleCarsChange = useCallback((cars: Set<string>) => setPositionVisibleCars(cars), [])

  const flag = snapshot.flag
  const flagLabel = flag ? FLAG_LABELS[flag] : null

  return (
    <div className="live-with-sidebar">
      <div className="replay-console live-main">
        <div className="replay-topbar">
          <div className="replay-session-id">
            <h2>{title}</h2>
            <span>{data.cars.length} cars</span>
          </div>
          <div className="replay-clock-block">
            {flag && (
              <span className="replay-flag-pill" style={{ '--flag-color': FLAG_COLORS[flag] } as CSSProperties}>
                {flagLabel}
              </span>
            )}
            <span className="replay-clock-mode">Replay</span>
            <div className="replay-clock">
              {formatClock(clock.current)}
              <small> / {formatClock(data.maxTime)}</small>
            </div>
          </div>
        </div>

        <div className="replay-leaderboard-panel">
          <p className="replay-panel-label">
            Leaderboard — updates on every sector crossing
            <span className="hint"> — blank = split not recorded · violet row = in the pits · purple time = session best in class · green time = personal best</span>
          </p>
          <div className="replay-trend-controls">
            <ClassFilter classes={data.classes} selection={classSelection} onChange={setClassSelection} />
          </div>
          <ReplayLeaderboard rows={snapshot.rows} activeClasses={activeClasses} highlightedCars={highlightedCars} />
        </div>

        <ReplayTransport clock={clock} min={data.minTime} max={data.maxTime} />
      </div>

      <ReplaySidebar
        data={data}
        rows={snapshot.rows}
        activeClasses={activeClasses}
        currentTime={clock.current}
        leaderLap={snapshot.leaderLap}
        isRaceSession={isRaceSession}
        sessionId={sessionId}
        title={title}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((o) => !o)}
        onGapVisibleCarsChange={onGapVisibleCarsChange}
        onPositionVisibleCarsChange={onPositionVisibleCarsChange}
      />
    </div>
  )
}
