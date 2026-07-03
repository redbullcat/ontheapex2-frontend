import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getLaps } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { buildReplayData, type ReplayData } from './replayData'
import { useReplayClock } from './useReplayClock'
import { useReplaySnapshot } from './useReplayRows'
import { ReplayLeaderboard } from './ReplayLeaderboard'
import { ReplayTrendChart } from './ReplayTrendChart'
import { ReplayTransport } from './ReplayTransport'
import { formatClock } from './format'
import { ClassFilter } from '../components/ClassFilter'
import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'
import { FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import './replay.css'

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

export function ReplayApp() {
  const sessionId = readParam('session')
  const title = readParam('title') || 'Live Timing Replay'

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
        <ReplayConsole title={title} data={data} />
      ) : (
        <p className="replay-hint">No lap data for this session.</p>
      )}
    </div>
  )
}

function ReplayConsole({ title, data }: { title: string; data: ReplayData }) {
  const clock = useReplayClock(data.minTime, data.maxTime)
  const snapshot = useReplaySnapshot(data, clock.current)
  const [classSelection, setClassSelection] = useState<ClassSelection>(null)
  const [expandedChart, setExpandedChart] = useState<'gap' | 'position' | null>(null)
  const [gapVisibleCars, setGapVisibleCars] = useState<Set<string>>(new Set())
  const [positionVisibleCars, setPositionVisibleCars] = useState<Set<string>>(new Set())

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
    <div className="replay-console">
      {expandedChart && <div className="replay-backdrop" onClick={() => setExpandedChart(null)} />}

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

      <ReplayTrendChart
        data={data}
        mode="gap"
        currentLap={snapshot.leaderLap}
        title="Gap evolution — live"
        onVisibleCarsChange={onGapVisibleCarsChange}
        expanded={expandedChart === 'gap'}
        onToggleExpand={() => setExpandedChart((c) => (c === 'gap' ? null : 'gap'))}
      />

      <ReplayTrendChart
        data={data}
        mode="position"
        currentLap={snapshot.leaderLap}
        title="Lap-by-lap position — live"
        onVisibleCarsChange={onPositionVisibleCarsChange}
        expanded={expandedChart === 'position'}
        onToggleExpand={() => setExpandedChart((c) => (c === 'position' ? null : 'position'))}
      />

      <ReplayTransport clock={clock} min={data.minTime} max={data.maxTime} />
    </div>
  )
}
