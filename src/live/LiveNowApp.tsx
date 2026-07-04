import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useDelayedLiveState } from './useDelayedLiveState'
import { useLiveDelay } from './useLiveDelay'
import { DelaySettings } from './DelaySettings'
import { ConnectionStatusBar } from './ConnectionStatusBar'
import { useSessionClock } from './useSessionClock'
import { useCountdownTo } from './useCountdownTo'
import { formatClock } from '../replay/format'
import { classifyFlag, FLAG_COLORS, FLAG_LABELS } from '../lib/flags'
import { renderLivePanel, LIVE_DEFAULT_PANELS, LIVE_PANEL_DEFS, type LivePanelContext } from './livePanels'
import { BackLink } from '../components/BackLink'
import { ThemeToggleButton } from '../components/ThemeToggleButton'
import { useTheme, type Theme } from '../hooks/useTheme'
import { CarDetailModal } from '../components/CarDetailModal'
import { liveLapToLapRead } from '../lib/liveLapAdapter'
import { isLiveRaceSession } from './liveSessionType'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { LiveState } from '../api/types'
import { DashboardGrid } from '../dashboard/DashboardGrid'
import { useDashboardLayout } from '../dashboard/useDashboardLayout'
import { useBroadcastChannel } from '../dashboard/useBroadcastChannel'
import { buildPopoutUrl, openPopout } from '../dashboard/popout'
import type { PanelInstance } from '../dashboard/types'
import type { PendingNoteLink } from '../lib/raceNotes'
import '../replay/replay.css'
import './live.css'

function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

export function LiveNowApp() {
  const griiipSessionId = Number(readParam('sid')) || null
  const title = readParam('title') || 'Live Now'
  const dashPanel = readParam('dashPanel')
  const dashCar = readParam('dashCar')

  useDocumentTitle(`${title} — Live · On The Apex`)

  const [theme, setTheme] = useTheme()

  const [delaySeconds, setDelaySeconds] = useLiveDelay(griiipSessionId)
  const live = useDelayedLiveState(griiipSessionId, delaySeconds)
  const clock = useSessionClock(live.data?.session_clock ?? null, delaySeconds)

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

  if (dashPanel) {
    return (
      <PoppedOutLivePanel
        griiipSessionId={griiipSessionId}
        data={live.data}
        title={title}
        kind={dashPanel}
        carNumber={dashCar || undefined}
        initialDelaySeconds={delaySeconds}
      />
    )
  }

  return (
    <LiveConsole
      data={live.data}
      title={title}
      griiipSessionId={griiipSessionId}
      clock={clock}
      delaySeconds={delaySeconds}
      setDelaySeconds={setDelaySeconds}
      lastFetchAt={live.lastFetchAt}
      liveStatus={live.status}
      theme={theme}
      setTheme={setTheme}
    />
  )
}

// A pop-out window for exactly one panel — mirrors the main dashboard's
// delay setting via BroadcastChannel so a popped-out chart stays synced to
// whatever stream-delay the viewer has dialled in on the main tab, rather
// than each window needing its own copy of that control. Live's actual
// *data* doesn't need this kind of sync the way Replay's clock does: every
// window already independently polls the same backend every ~2s, so
// they're naturally in step with each other already.
function PoppedOutLivePanel({
  griiipSessionId,
  data,
  title,
  kind,
  carNumber,
  initialDelaySeconds,
}: {
  griiipSessionId: number
  data: LiveState
  title: string
  kind: string
  carNumber?: string
  initialDelaySeconds: number
}) {
  const [delaySeconds, setDelaySeconds] = useState(initialDelaySeconds)
  useBroadcastChannel<number>(`live-delay:${griiipSessionId}`, setDelaySeconds)

  const ctx: LivePanelContext = {
    data,
    title,
    delaySeconds,
    sessionKey: String(griiipSessionId),
    clock: { elapsedSeconds: null, remainingSeconds: null },
    // Note-linking from a chart click only makes sense within the main
    // dashboard, where a race-notes panel might actually be open to
    // receive it — a pop-out window is just one chart on its own.
    pendingNoteLink: null,
    onRequestNoteLink: () => {},
    onConsumeNoteLink: () => {},
    isRaceSession: isLiveRaceSession(data.session_type),
  }
  const panelTitle = LIVE_PANEL_DEFS[kind]?.title ?? kind

  return (
    <div className="replay-root">
      <div className="replay-console">
        <div className="replay-topbar">
          <div className="replay-session-id">
            <BackLink />
            <h2>
              {title} — {panelTitle}
              {carNumber ? ` — #${carNumber}` : ''}
            </h2>
            <span className="replay-popout-sync-hint">delay {delaySeconds}s · synced to main tab</span>
          </div>
        </div>
        <div className="replay-leaderboard-panel">{renderLivePanel({ id: kind, kind, carNumber }, ctx)}</div>
      </div>
    </div>
  )
}

function LiveConsole({
  data,
  title,
  griiipSessionId,
  clock,
  delaySeconds,
  setDelaySeconds,
  lastFetchAt,
  liveStatus,
  theme,
  setTheme,
}: {
  data: LiveState
  title: string
  griiipSessionId: number
  clock: { elapsedSeconds: number | null; remainingSeconds: number | null }
  delaySeconds: number
  setDelaySeconds: (n: number) => void
  lastFetchAt: number | null
  liveStatus: 'loading' | 'success' | 'error'
  theme: Theme
  setTheme: (t: Theme) => void
}) {
  const flagCategory = classifyFlag(data.current_flag)
  const isRaceSession = isLiveRaceSession(data.session_type)
  // No flag has been observed yet — a genuinely running session always has
  // one (backend now discards a bootstrap "Chequered" that's just leftover
  // from a previous session at discovery time, see app/live/manager.py), so
  // null here means the session hasn't actually started. Shown as its own
  // "Due to start" state with a countdown rather than defaulting to Green
  // (misleadingly implying racing is underway) or Chequered (implying it's
  // already over) — and the elapsed clock stays off until a real flag
  // arrives, so it doesn't start counting a session that hasn't begun.
  const dueToStart = data.current_flag == null && !data.session_ended
  const countdownSeconds = useCountdownTo(dueToStart ? data.session_clock?.start_time ?? null : null)
  const [selectedCar, setSelectedCar] = useState<string | null>(null)
  const [pendingNoteLink, setPendingNoteLink] = useState<PendingNoteLink | null>(null)

  const broadcastDelay = useBroadcastChannel<number>(`live-delay:${griiipSessionId}`)
  useEffect(() => {
    broadcastDelay(delaySeconds)
  }, [delaySeconds, broadcastDelay])

  // Live's own laps are already "as of now" by definition — no clock-based
  // filtering needed the way Replay needs. Reshaped to LapRead's shape so
  // the car detail panel's reused historical chart components (built for
  // LapRead) work unmodified against live data too.
  const carDetailLaps = useMemo(() => {
    if (!selectedCar) return []
    return data.laps.map((lap, i) => liveLapToLapRead(lap, i))
  }, [data.laps, selectedCar])

  // Stable identities across renders — these two are in the dependency
  // array of chart-rebuilding D3 effects (LapPositionChart/ReplayTrendChart),
  // so a fresh function reference every render (Live re-renders every ~2s
  // poll) would force those charts to tear down and rebuild their whole SVG
  // far more often than the data they render actually changes.
  const handleRequestNoteLink = useCallback(
    (carNumber: string, lapNumber: number) => {
      const row = data.laps.find((l) => l.car_number === carNumber && l.lap_number === lapNumber)
      setPendingNoteLink({ carNumber, lapNumber, elapsedSeconds: row?.elapsed_seconds ?? null })
    },
    [data.laps],
  )
  const handleConsumeNoteLink = useCallback(() => setPendingNoteLink(null), [])

  const ctx: LivePanelContext = {
    data,
    title,
    delaySeconds,
    sessionKey: String(griiipSessionId),
    clock,
    pendingNoteLink,
    onRequestNoteLink: handleRequestNoteLink,
    onConsumeNoteLink: handleConsumeNoteLink,
    isRaceSession,
  }

  const carOptions = useMemo(
    () =>
      data.standings
        .map((s) => ({ id: s.car_number, label: `#${s.car_number} — ${s.team ?? 'Unknown'}` }))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [data.standings],
  )

  const layoutState = useDashboardLayout(`dashboard:live:${griiipSessionId}`, LIVE_DEFAULT_PANELS, LIVE_PANEL_DEFS)

  const handlePopOut = useCallback(
    (panel: PanelInstance) => {
      const url = buildPopoutUrl(panel, { sid: String(griiipSessionId), title })
      openPopout(url)
    },
    [griiipSessionId, title],
  )

  return (
    <div className="replay-root replay-console-root">
      <div className="replay-topbar">
        <div className="replay-session-id">
          <BackLink />
          <ThemeToggleButton theme={theme} onChange={setTheme} />
          <h2>{title}</h2>
          <span>{data.standings.length} cars</span>
        </div>
        <div className="replay-clock-block">
          {data.session_ended ? (
            <span className="live-chequered-pill">🏁 Session complete</span>
          ) : dueToStart ? (
            <span className="live-due-to-start-pill">Due to start</span>
          ) : (
            <span className="replay-flag-pill" style={{ '--flag-color': FLAG_COLORS[flagCategory] } as CSSProperties}>
              {FLAG_LABELS[flagCategory]}
            </span>
          )}
          {data.chequered_flag_shown && !data.session_ended && (
            <span className="live-chequered-hint">Cars on track are completing their final lap</span>
          )}
          <span className="replay-clock-mode">{data.session_ended ? 'Ended' : 'Live'}</span>
          {dueToStart ? (
            <div className="replay-clock">
              {countdownSeconds == null
                ? 'Waiting for session to start…'
                : countdownSeconds > 0
                  ? `Starts in ${formatClock(countdownSeconds)}`
                  : 'Starting…'}
            </div>
          ) : (
            clock.elapsedSeconds != null && (
              <div className="replay-clock">
                {formatClock(clock.elapsedSeconds)}
                {clock.remainingSeconds != null && <small> · {formatClock(clock.remainingSeconds)} left</small>}
              </div>
            )
          )}
          {data.weather && (
            <span className="live-weather">
              Track {data.weather.trackTemperature?.toFixed(0)}°C · Air {data.weather.temperature?.toFixed(0)}°C
            </span>
          )}
        </div>
      </div>

      <DashboardGrid
        panelDefs={LIVE_PANEL_DEFS}
        renderPanel={(panel) => renderLivePanel(panel, ctx, setSelectedCar, true)}
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

      <ConnectionStatusBar lastFetchAt={lastFetchAt} liveStatus={liveStatus} />
      <DelaySettings delaySeconds={delaySeconds} onChange={setDelaySeconds} />
    </div>
  )
}
