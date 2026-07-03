import { useEffect, useMemo } from 'react'
import { getLaps } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { buildReplayData } from './replayData'
import { useReplayClock } from './useReplayClock'
import { useReplayRows } from './useReplayRows'
import { ReplayLeaderboard } from './ReplayLeaderboard'
import { ReplayGapStrip } from './ReplayGapStrip'
import { ReplayTransport } from './ReplayTransport'
import { formatClock } from './format'
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

function ReplayConsole({ title, data }: { title: string; data: ReturnType<typeof buildReplayData> }) {
  const clock = useReplayClock(data.minTime, data.maxTime)
  const rows = useReplayRows(data, clock.current)

  return (
    <div className="replay-console">
      <div className="replay-topbar">
        <div className="replay-session-id">
          <h2>{title}</h2>
          <span>{data.cars.length} cars</span>
        </div>
        <div className="replay-clock-block">
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
          <span className="hint"> — blank cell = split not recorded · violet row = car currently in the pits</span>
        </p>
        <ReplayLeaderboard rows={rows} />
      </div>

      <ReplayGapStrip data={data} current={clock.current} />

      <ReplayTransport clock={clock} min={data.minTime} max={data.maxTime} />
    </div>
  )
}
