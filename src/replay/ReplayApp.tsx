import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { getLaps } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { buildReplayData, type ReplayData } from './replayData'
import { useReplayClock } from './useReplayClock'
import { useReplaySnapshot } from './useReplayRows'
import { ReplayTransport } from './ReplayTransport'
import { renderReplayPanel, REPLAY_DEFAULT_PANELS, REPLAY_PANEL_DEFS, type ReplayPanelContext } from './replayPanels'
import type { PendingNoteLink } from '../lib/raceNotes'
import { formatClock } from './format'
import { FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import { bucketFor } from '../lib/sessionBucket'
import { BackLink } from '../components/BackLink'
import { CarDetailModal } from '../components/CarDetailModal'
import { ThemeToggleButton } from '../components/ThemeToggleButton'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useTheme, type Theme } from '../hooks/useTheme'
import type { SessionType } from '../api/types'
import { DashboardGrid } from '../dashboard/DashboardGrid'
import { useDashboardLayout } from '../dashboard/useDashboardLayout'
import { useBroadcastChannel } from '../dashboard/useBroadcastChannel'
import { buildPopoutUrl, openPopout } from '../dashboard/popout'
import type { PanelInstance } from '../dashboard/types'
import './replay.css'

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

interface ClockSync {
  current: number
  playing: boolean
  speed: number
}

export function ReplayApp() {
  const sessionId = readParam('session')
  const title = readParam('title') || 'Live Timing Replay'
  const rawType = readParam('type')
  // Unset (e.g. an old bookmarked link from before this param existed)
  // defaults to treating it as a race — that's the safer default since
  // it's also what the entry point used to be gated to exclusively.
  const isRaceSession = rawType ? bucketFor(rawType as SessionType) === 'race' : true
  const dashPanel = readParam('dashPanel')
  const dashCar = readParam('dashCar')

  useDocumentTitle(`${title} — Replay · On The Apex`)

  const [theme, setTheme] = useTheme()

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
        dashPanel ? (
          <PoppedOutPanel sessionId={sessionId} data={data} title={title} isRaceSession={isRaceSession} kind={dashPanel} carNumber={dashCar || undefined} />
        ) : (
          <ReplayConsole title={title} data={data} sessionId={sessionId} isRaceSession={isRaceSession} theme={theme} setTheme={setTheme} />
        )
      ) : (
        <p className="replay-hint">No lap data for this session.</p>
      )}
    </div>
  )
}

// A pop-out window for exactly one panel — mirrors the main dashboard's
// clock via BroadcastChannel instead of running its own independent
// playback, so it stays in lockstep with wherever the main tab has
// scrubbed/played to rather than drifting on its own. Read-only: no
// transport controls here, on purpose — two independently-driven clocks
// for the same session would defeat the point of "synced together".
function PoppedOutPanel({
  sessionId,
  data,
  title,
  isRaceSession,
  kind,
  carNumber,
}: {
  sessionId: string
  data: ReplayData
  title: string
  isRaceSession: boolean
  kind: string
  carNumber?: string
}) {
  // No broadcast received yet (e.g. opened from a bookmark with no source
  // tab running) falls back to showing the whole session, same as the
  // pop-out's old default before this dashboard existed.
  const [sync, setSync] = useState<ClockSync>({ current: data.maxTime, playing: false, speed: 1 })
  useBroadcastChannel<ClockSync>(`replay-clock:${sessionId}`, setSync)

  const snapshot = useReplaySnapshot(data, sync.current)
  const activeClasses = useMemo(() => new Set(data.classes), [data])
  const visibleLaps = useMemo(
    () => data.laps.filter((l) => l.elapsed_seconds != null && l.elapsed_seconds <= sync.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.laps, Math.floor(sync.current)],
  )

  const ctx: ReplayPanelContext = {
    data,
    rows: snapshot.rows,
    activeClasses,
    currentTime: sync.current,
    leaderLap: snapshot.leaderLap,
    title,
    isRaceSession,
    visibleLaps,
    sessionKey: sessionId,
    // Note-linking from a chart click only makes sense within the main
    // dashboard, where a race-notes panel might actually be open to
    // receive it — a pop-out window is just one chart on its own.
    pendingNoteLink: null,
    onRequestNoteLink: () => {},
    onConsumeNoteLink: () => {},
  }
  const panelTitle = REPLAY_PANEL_DEFS[kind]?.title ?? kind

  return (
    <div className="replay-console">
      <div className="replay-topbar">
        <div className="replay-session-id">
          <BackLink />
          <h2>
            {title} — {panelTitle}
            {carNumber ? ` — #${carNumber}` : ''}
          </h2>
          <span className="replay-popout-sync-hint">{formatClock(sync.current)} · {sync.playing ? `playing ${sync.speed}x` : 'paused'} · synced to main tab</span>
        </div>
      </div>
      <div className="replay-leaderboard-panel">{renderReplayPanel({ id: kind, kind, carNumber }, ctx)}</div>
    </div>
  )
}

function ReplayConsole({
  title,
  data,
  sessionId,
  isRaceSession,
  theme,
  setTheme,
}: {
  title: string
  data: ReplayData
  sessionId: string
  isRaceSession: boolean
  theme: Theme
  setTheme: (t: Theme) => void
}) {
  const clock = useReplayClock(data.minTime, data.maxTime)
  const snapshot = useReplaySnapshot(data, clock.current)
  const [selectedCar, setSelectedCar] = useState<string | null>(null)
  const [pendingNoteLink, setPendingNoteLink] = useState<PendingNoteLink | null>(null)

  const broadcastClock = useBroadcastChannel<ClockSync>(`replay-clock:${sessionId}`)
  const lastBroadcastRef = useRef(0)
  useEffect(() => {
    const now = performance.now()
    // Every frame while playing is more than any pop-out window needs —
    // throttled to a still-smooth ~6fps, plus always sent immediately on
    // pause/speed changes below via the playing/speed deps.
    if (clock.playing && now - lastBroadcastRef.current < 150) return
    lastBroadcastRef.current = now
    broadcastClock({ current: clock.current, playing: clock.playing, speed: clock.speed })
  }, [clock.current, clock.playing, clock.speed, broadcastClock])

  // "As if live": only what's happened up to the current playback clock —
  // shared by every per-car dashboard panel, the same principle the old
  // car detail modal's carDetailLaps already used. Floored to the second
  // so this doesn't re-filter every animation frame at high playback
  // speeds.
  const visibleLaps = useMemo(
    () => data.laps.filter((l) => l.elapsed_seconds != null && l.elapsed_seconds <= clock.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.laps, Math.floor(clock.current)],
  )
  const carDetailLaps = useMemo(() => (selectedCar ? visibleLaps : []), [selectedCar, visibleLaps])

  const activeClasses = useMemo(() => new Set(data.classes), [data])

  const flag = snapshot.flag
  const flagLabel = flag ? FLAG_LABELS[flag] : null

  // Stable identities across renders — these two are in the dependency
  // array of chart-rebuilding D3 effects (LapPositionChart/ReplayTrendChart),
  // so a fresh function reference every render (Replay's clock ticks every
  // frame while playing) would force those charts to tear down and rebuild
  // their whole SVG far more often than the data they render actually changes.
  const handleRequestNoteLink = useCallback(
    (carNumber: string, lapNumber: number) => {
      const row = data.laps.find((l) => l.car_number === carNumber && l.lap_number === lapNumber)
      setPendingNoteLink({ carNumber, lapNumber, elapsedSeconds: row?.elapsed_seconds ?? null })
    },
    [data.laps],
  )
  const handleConsumeNoteLink = useCallback(() => setPendingNoteLink(null), [])

  const ctx: ReplayPanelContext = {
    data,
    rows: snapshot.rows,
    activeClasses,
    currentTime: clock.current,
    leaderLap: snapshot.leaderLap,
    title,
    isRaceSession,
    visibleLaps,
    sessionKey: sessionId,
    pendingNoteLink,
    onRequestNoteLink: handleRequestNoteLink,
    onConsumeNoteLink: handleConsumeNoteLink,
  }

  const carOptions = useMemo(
    () => data.cars.map((c) => ({ id: c.car_number, label: `#${c.car_number} — ${c.team ?? 'Unknown'}` })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [data],
  )

  const layoutState = useDashboardLayout(`dashboard:replay:${sessionId}`, REPLAY_DEFAULT_PANELS, REPLAY_PANEL_DEFS)

  const handlePopOut = useCallback(
    (panel: PanelInstance) => {
      const url = buildPopoutUrl(panel, { session: sessionId, title, type: isRaceSession ? 'race' : 'practice' })
      openPopout(url)
    },
    [sessionId, title, isRaceSession],
  )

  return (
    <div className="replay-console-root">
      <div className="replay-topbar">
        <div className="replay-session-id">
          <BackLink />
          <ThemeToggleButton theme={theme} onChange={setTheme} />
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

      <ReplayTransport clock={clock} min={data.minTime} max={data.maxTime} />

      <DashboardGrid
        panelDefs={REPLAY_PANEL_DEFS}
        renderPanel={(panel) => renderReplayPanel(panel, ctx, setSelectedCar, true)}
        carOptions={carOptions}
        onPopOut={handlePopOut}
        layoutState={layoutState}
      />

      {selectedCar && (
        <CarDetailModal
          carNumber={selectedCar}
          allLaps={carDetailLaps}
          isRaceSession={isRaceSession}
          onClose={() => setSelectedCar(null)}
          onAddToDashboard={(kind) => layoutState.addPanel(kind, selectedCar)}
        />
      )}
    </div>
  )
}
