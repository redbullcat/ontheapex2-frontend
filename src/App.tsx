import { useEffect, useMemo, useState } from 'react'
import {
  getCombinedLaps,
  getEvents,
  getHourlyPositions,
  getLaps,
  getLeadHistory,
  getSeries,
  getSessions,
  getStints,
  getWeather,
} from './api/client'
import { useAsync } from './hooks/useAsync'
import { useDeletedLapsVersion } from './hooks/useDeletedLapsVersion'
import { usePenaltiesVersion } from './hooks/usePenaltiesVersion'
import { ensureDeletedLapsLoaded } from './lib/lapOverrides'
import { ensurePenaltiesLoaded, listPenalties } from './lib/penalties'
import { useDocumentTitle } from './hooks/useDocumentTitle'
import { Sidebar, type Theme } from './components/Sidebar'
import { useLiveSessions } from './live/useLiveSessions'
import { Tabs, type Tab } from './components/Tabs'
import { SessionTypeTabs } from './components/SessionTypeTabs'
import { bucketFor, type SessionBucket } from './lib/sessionBucket'
import { parseCombinedSessionId } from './lib/combinedSession'
import { computeStartingGrid } from './lib/startingGrid'
import type { LapRead, SessionSummary } from './api/types'
import { LeadHistoryPanel } from './components/LeadHistoryPanel'
import { PositionChart } from './components/PositionChart'
import { LapPositionChart } from './components/LapPositionChart'
import { ResultsTable } from './components/ResultsTable'
import { SessionResultsTable } from './components/SessionResultsTable'
import { CarDetailModal } from './components/CarDetailModal'
import { PaceChart } from './components/PaceChart'
import { GapEvolutionChart } from './components/GapEvolutionChart'
import { DriverHistoryChart } from './components/DriverHistoryChart'
import { RaceOverview } from './components/RaceOverview'
import { RaceStats } from './components/RaceStats'
import { FastestLapsTable } from './components/FastestLapsTable'
import { PaceConsistencyChart } from './components/PaceConsistencyChart'
import { TopSpeedChart } from './components/TopSpeedChart'
import { PitTimeChart } from './components/PitTimeChart'
import { PitStopAverageChart } from './components/PitStopAverageChart'
import { PitRoundsChart } from './components/PitRoundsChart'
import { PitCumulativeChart } from './components/PitCumulativeChart'
import { PitVftUsageChart } from './components/PitVftUsageChart'
import { DriverConsistencyChart } from './components/DriverConsistencyChart'
import { HeadToHeadChart } from './components/HeadToHeadChart'
import { DriveTimeChart } from './components/DriveTimeChart'
import { StoryChart } from './components/StoryChart'
import { FlagGanttChart } from './components/FlagGanttChart'
import { SectorAnalysisChart } from './components/SectorAnalysisChart'
import { SettingsPanel } from './components/SettingsPanel'
import { onIdentityOverridesChanged } from './lib/identityOverrides'
import { LongRunChart } from './components/LongRunChart'
import { AverageLongRunChart } from './components/AverageLongRunChart'
import { StintLengthDistribution } from './components/StintLengthDistribution'
import { LongRunPaceByManufacturer } from './components/LongRunPaceByManufacturer'
import { TyreHistoryChart } from './components/TyreHistoryChart'
import { TyreDegradationChart } from './components/TyreDegradationChart'
import { hasTyreData, compoundDisplayName, tyreSummary } from './lib/carTyres'
import { WeatherChart } from './components/WeatherChart'
import { DriverRatingPaceChart } from './components/DriverRatingPaceChart'
import './App.css'

const RACE_TABS: Tab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'results', label: 'Results' },
  { id: 'position', label: 'Position' },
  { id: 'pace', label: 'Pace' },
  { id: 'battle', label: 'Battle' },
  { id: 'sectors', label: 'Sectors' },
  { id: 'longruns', label: 'Long Runs' },
  { id: 'pit', label: 'Pit Stops' },
  { id: 'stints', label: 'Stints' },
  { id: 'headtohead', label: 'Head to Head' },
  { id: 'tyres', label: 'Tyres' },
  { id: 'story', label: 'Story' },
  { id: 'weather', label: 'Weather' },
]

// Practice/Qualifying sessions have no fixed finishing order, so the
// race-classification charts (Overview/Position) don't apply — Results
// still works but ranks by fastest lap instead of laps-completed/elapsed
// time (see SessionResultsTable). Pace, Battle (gap evolution still works
// as a pace-over-laps comparison), Sectors, Long Runs, Pit Stops and
// Stints are all still meaningful without a fixed finish too.
const NON_RACE_TABS: Tab[] = [
  { id: 'results', label: 'Results' },
  { id: 'pace', label: 'Pace' },
  { id: 'battle', label: 'Battle' },
  { id: 'sectors', label: 'Sectors' },
  { id: 'longruns', label: 'Long Runs' },
  { id: 'pit', label: 'Pit Stops' },
  { id: 'stints', label: 'Stints' },
  { id: 'tyres', label: 'Tyres' },
  { id: 'weather', label: 'Weather' },
]

// Selections round-trip through the URL (mirroring the Streamlit app's
// st.query_params) so a refresh or a shared link resumes the same view
// instead of dropping back to the empty pickers.
function readParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

function App() {
  const [seriesSlug, setSeriesSlug] = useState(() => readParam('series'))
  const [year, setYear] = useState(() => readParam('year'))
  const [eventId, setEventId] = useState(() => readParam('event'))
  const [sessionId, setSessionId] = useState(() => readParam('session'))
  const [activeTab, setActiveTab] = useState(() => readParam('tab') || 'overview')
  const liveSessions = useLiveSessions()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = window.localStorage.getItem('sidebarOpen')
    return stored === null ? true : stored === 'true'
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = window.localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedCarDetail, setSelectedCarDetail] = useState<string | null>(null)
  const [colorVersion, setColorVersion] = useState(0)

  useEffect(() => onIdentityOverridesChanged(() => setColorVersion((v) => v + 1)), [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (seriesSlug) params.set('series', seriesSlug)
    if (year) params.set('year', year)
    if (eventId) params.set('event', eventId)
    if (sessionId) params.set('session', sessionId)
    if (activeTab !== 'overview') params.set('tab', activeTab)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [seriesSlug, year, eventId, sessionId, activeTab])

  useEffect(() => {
    window.localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    window.localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const seriesState = useAsync(getSeries, [])
  const eventsState = useAsync(seriesSlug ? () => getEvents(seriesSlug) : null, [seriesSlug])
  const sessionsState = useAsync(eventId ? () => getSessions(Number(eventId)) : null, [eventId])

  const combinedBucket = parseCombinedSessionId(sessionId)

  const sessionsByBucket = useMemo(() => {
    const buckets: Record<SessionBucket, SessionSummary[]> = { practice: [], qualifying: [], race: [] }
    if (sessionsState.status === 'success') {
      for (const s of sessionsState.data) buckets[bucketFor(s.type)].push(s)
    }
    return buckets
  }, [sessionsState])

  // Lead history and hourly positions are race-only concepts (a race has a
  // running order to lead/rank; practice and qualifying don't) — "combine
  // all Practice/Qualifying" never needs either, so skip fetching them.
  const leadHistoryState = useAsync(
    sessionId && !combinedBucket ? () => getLeadHistory(Number(sessionId)) : null,
    [sessionId, combinedBucket],
  )
  const positionsState = useAsync(
    sessionId && !combinedBucket ? () => getHourlyPositions(Number(sessionId)) : null,
    [sessionId, combinedBucket],
  )
  const lapsState = useAsync(
    combinedBucket
      ? () => getCombinedLaps(sessionsByBucket[combinedBucket].map((s) => s.id))
      : sessionId
        ? () => getLaps(Number(sessionId))
        : null,
    [sessionId, combinedBucket, sessionsByBucket],
  )
  // Stint Gantt charts plot against raw lap number, which resets to 1 each
  // session — combining sessions would draw overlapping bars from
  // different sessions at the same x position, so that tab stays
  // single-session only (see the "stints" tab render below) and this
  // fetch is skipped entirely in combined mode.
  const stintsState = useAsync(
    sessionId && !combinedBucket ? () => getStints(Number(sessionId)) : null,
    [sessionId, combinedBucket],
  )
  // Weather is a session-wide time series, not per-lap — same
  // single-session-only reasoning as stints above (a combined view has no
  // single coherent elapsed-time axis to plot it against).
  const weatherState = useAsync(
    sessionId && !combinedBucket ? () => getWeather(Number(sessionId)) : null,
    [sessionId, combinedBucket],
  )
  const penaltiesVersion = usePenaltiesVersion()
  // Penalties for whichever single session is in view — read from the
  // in-memory cache (see lib/penalties.ts) rather than a separate fetch,
  // since ensurePenaltiesLoaded below already keeps it populated.
  const sessionPenalties = useMemo(
    () => (sessionId && !combinedBucket ? listPenalties().filter((p) => p.session_id === Number(sessionId)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, combinedBucket, penaltiesVersion],
  )

  // Populate the deleted-laps/penalties in-memory caches for whichever
  // session(s) are actually in view, so the synchronous per-lap/per-car
  // lookups those tables and charts make (isLapDeleted, penaltiesFor) have
  // data — both stores fetch lazily per session id the first time it's seen.
  useEffect(() => {
    if (combinedBucket) {
      for (const s of sessionsByBucket[combinedBucket]) {
        ensureDeletedLapsLoaded(s.id)
        ensurePenaltiesLoaded(s.id)
      }
    } else if (sessionId) {
      ensureDeletedLapsLoaded(Number(sessionId))
      ensurePenaltiesLoaded(Number(sessionId))
    }
  }, [sessionId, combinedBucket, sessionsByBucket])

  // One section per class (skipping the class heading entirely when there's
  // only one, matching RaceOverview's own per-class subheading convention)
  // — each with its own tyre-degradation chart per compound that class
  // actually ran, plus its own tyre-history chart scoped to just that
  // class's cars.
  const tyreClassSections = useMemo(() => {
    if (lapsState.status !== 'success') return []
    const byClass = new Map<string, LapRead[]>()
    for (const lap of lapsState.data) {
      if (!hasTyreData(lap)) continue
      const cls = lap.class ?? 'Unknown'
      const arr = byClass.get(cls)
      if (arr) arr.push(lap)
      else byClass.set(cls, [lap])
    }
    return [...byClass.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cls, classLaps]) => {
        const compounds = new Set<string>()
        for (const lap of classLaps) {
          const { compound } = tyreSummary(lap)
          if (compound && compound !== 'Mixed') compounds.add(compound)
        }
        return { cls, laps: classLaps, compounds: [...compounds].sort() }
      })
  }, [lapsState])

  const knownTeams = useMemo(() => {
    if (lapsState.status !== 'success') return []
    const s = new Set<string>()
    for (const lap of lapsState.data) if (lap.team) s.add(lap.team)
    return [...s].sort()
  }, [lapsState])

  const years = useMemo(() => {
    if (eventsState.status !== 'success') return []
    const distinct = [...new Set(eventsState.data.map((e) => e.year))]
    return distinct.sort((a, b) => b - a)
  }, [eventsState])

  const eventsForYear = useMemo(() => {
    if (eventsState.status !== 'success' || !year) return []
    return eventsState.data.filter((e) => String(e.year) === year)
  }, [eventsState, year])

  const currentEvent = useMemo(
    () => eventsForYear.find((e) => String(e.id) === eventId),
    [eventsForYear, eventId],
  )

  const currentSeriesLabel = useMemo(
    () => (seriesState.status === 'success' ? seriesState.data.find((s) => s.slug === seriesSlug)?.display_name : undefined),
    [seriesState, seriesSlug],
  )

  const currentSession = useMemo(
    () => (sessionsState.status === 'success' ? sessionsState.data.find((s) => String(s.id) === sessionId) : undefined),
    [sessionsState, sessionId],
  )

  // "Combine all Practice/Qualifying" pools laps from multiple sessions
  // with no single griiip-comparable id, so there's nothing for Replay to
  // open in that case — null hides the sidebar link entirely.
  const replayUrl = useMemo(() => {
    if (combinedBucket || !currentSession) return null
    const title = [currentSeriesLabel, currentEvent?.display_name, currentSession.label].filter(Boolean).join(' · ')
    return `/replay?session=${sessionId}&title=${encodeURIComponent(title)}&type=${currentSession.type}`
  }, [combinedBucket, currentSession, currentSeriesLabel, currentEvent, sessionId])

  useDocumentTitle(
    [currentEvent?.display_name, currentSession?.label, 'On The Apex'].filter(Boolean).join(' · '),
  )
  const sessionSection: SessionBucket | '' = combinedBucket || (currentSession ? bucketFor(currentSession.type) : '')

  // Seeds the lap-by-lap position chart at each car's actual qualifying
  // slot instead of at lap 1 (see startingGrid.ts) — only meaningful for a
  // real race's running order, so skipped entirely for practice/qualifying
  // sessions and for events with no qualifying session at all.
  const qualifyingLapsState = useAsync(
    sessionSection === 'race' && sessionsByBucket.qualifying.length > 0
      ? () => getCombinedLaps(sessionsByBucket.qualifying.map((s) => s.id))
      : null,
    [sessionSection, sessionsByBucket],
  )
  const deletedLapsVersion = useDeletedLapsVersion()
  const startingGrid = useMemo(
    () => (qualifyingLapsState.status === 'success' ? computeStartingGrid(qualifyingLapsState.data) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qualifyingLapsState, deletedLapsVersion],
  )

  // Default session once the event's sessions load: prefer Race, then
  // Qualifying, then Practice — but leave an already-valid selection (e.g.
  // restored from the URL, including a combined-session id) alone.
  useEffect(() => {
    if (sessionsState.status !== 'success') return
    if (sessionId) {
      if (sessionsState.data.some((s) => String(s.id) === sessionId)) return
      if (combinedBucket && sessionsByBucket[combinedBucket].length > 0) return
    }
    const preferred = sessionsByBucket.race[0] ?? sessionsByBucket.qualifying[0] ?? sessionsByBucket.practice[0]
    if (preferred) setSessionId(String(preferred.id))
  }, [sessionsState, sessionsByBucket, sessionId, combinedBucket])

  const chartTabs = sessionSection === 'race' ? RACE_TABS : NON_RACE_TABS

  // Keep the active chart tab valid when the session section changes (e.g.
  // switching from Race's "Results" to Practice, which doesn't have one).
  // Skip while sessionSection hasn't resolved yet (still loading which
  // session is active) — otherwise this fires once against the "not race"
  // default and bumps a perfectly valid "overview" off before Race is known.
  useEffect(() => {
    if (!sessionSection) return
    if (!chartTabs.some((t) => t.id === activeTab)) setActiveTab(chartTabs[0]?.id ?? '')
    // chartTabs is derived from sessionSection each render; re-run when that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSection])

  const hasSession = sessionId !== ''

  return (
    <div className="app">
      <header>
        <h1>On The Apex</h1>
        <p className="subtitle">Endurance racing data</p>
      </header>

      <div className="app-shell">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((v) => !v)}
          theme={theme}
          onThemeChange={setTheme}
          onOpenSettings={() => setSettingsOpen(true)}
          replayUrl={replayUrl}
          liveSessions={liveSessions}
          series={
            seriesState.status === 'success'
              ? seriesState.data.map((s) => ({ value: s.slug, label: s.display_name }))
              : []
          }
          seriesValue={seriesSlug}
          onSeriesChange={(v) => {
            setSeriesSlug(v)
            setYear('')
            setEventId('')
            setSessionId('')
          }}
          seriesDisabled={seriesState.status !== 'success'}
          years={years.map((y) => ({ value: String(y), label: String(y) }))}
          yearValue={year}
          onYearChange={(v) => {
            setYear(v)
            setEventId('')
            setSessionId('')
          }}
          yearDisabled={!seriesSlug || eventsState.status !== 'success'}
          events={eventsForYear.map((e) => ({ value: String(e.id), label: e.display_name }))}
          eventValue={eventId}
          onEventChange={(v) => {
            setEventId(v)
            setSessionId('')
          }}
          eventDisabled={!year || eventsState.status !== 'success'}
        />

        <main className="main" key={colorVersion}>
          {seriesState.status === 'error' && <p className="error">Failed to load series: {seriesState.error}</p>}
          {eventsState.status === 'error' && <p className="error">Failed to load events: {eventsState.error}</p>}
          {sessionsState.status === 'error' && (
            <p className="error">Failed to load sessions: {sessionsState.error}</p>
          )}
          {leadHistoryState.status === 'error' && (
            <p className="error">Failed to load lead history: {leadHistoryState.error}</p>
          )}
          {positionsState.status === 'error' && (
            <p className="error">Failed to load position data: {positionsState.error}</p>
          )}
          {lapsState.status === 'error' && <p className="error">Failed to load lap data: {lapsState.error}</p>}
          {stintsState.status === 'error' && (
            <p className="error">Failed to load stint data: {stintsState.error}</p>
          )}

          {!eventId ? (
            <p className="hint">Pick a series, year and event in the sidebar to get started.</p>
          ) : sessionsState.status === 'loading' ? (
            <p className="hint">Loading sessions…</p>
          ) : (
            <>
              <SessionTypeTabs
                sessionsByBucket={sessionsByBucket}
                activeBucket={sessionSection}
                onBucketChange={(bucket) => {
                  const preferred = sessionsByBucket[bucket][0]
                  if (preferred) setSessionId(String(preferred.id))
                }}
                sessionId={sessionId}
                onSessionChange={setSessionId}
              />

              {!hasSession ? null : (
                <>
                  <Tabs tabs={chartTabs} value={activeTab} onChange={setActiveTab} />

                  {activeTab === 'overview' && (
                <section className="chart-section">
                  <h2>Overview</h2>
                  {(lapsState.status === 'loading' || leadHistoryState.status === 'loading') && (
                    <p className="hint">Loading overview…</p>
                  )}
                  {lapsState.status === 'success' &&
                    leadHistoryState.status === 'success' &&
                    (lapsState.data.length > 0 ? (
                      <RaceOverview laps={lapsState.data} leadHistory={leadHistoryState.data} />
                    ) : (
                      <p className="hint">No lap data for this session.</p>
                    ))}
                </section>
              )}

              {activeTab === 'results' && sessionSection === 'race' && (
                <>
                  <section className="chart-section">
                    <h2>Race stats</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading race stats…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <RaceStats laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Who led</h2>
                    {(leadHistoryState.status === 'loading' || lapsState.status === 'loading') && (
                      <p className="hint">Loading lead history…</p>
                    )}
                    {leadHistoryState.status === 'success' &&
                      lapsState.status === 'success' &&
                      (leadHistoryState.data.length > 0 ? (
                        <LeadHistoryPanel laps={lapsState.data} overallStints={leadHistoryState.data} />
                      ) : (
                        <p className="hint">No lead-history data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Results</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading results…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <ResultsTable laps={lapsState.data} onSelectCar={setSelectedCarDetail} penalties={sessionPenalties} />
                      ) : (
                        <p className="hint">No results for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Fastest laps</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading fastest laps…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <FastestLapsTable laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>
                </>
              )}

              {activeTab === 'results' && sessionSection !== 'race' && (
                <>
                  <section className="chart-section">
                    <h2>Results</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading results…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <SessionResultsTable laps={lapsState.data} onSelectCar={setSelectedCarDetail} penalties={sessionPenalties} />
                      ) : (
                        <p className="hint">No results for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Fastest laps</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading fastest laps…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <FastestLapsTable laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>
                </>
              )}

              {activeTab === 'position' && (
                <>
                  <section className="chart-section">
                    <h2>Race position by hour</h2>
                    {positionsState.status === 'loading' && <p className="hint">Loading position data…</p>}
                    {positionsState.status === 'success' &&
                      (positionsState.data.length > 0 ? (
                        <PositionChart data={positionsState.data} />
                      ) : (
                        <p className="hint">No position data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Lap-by-lap position</h2>
                    {lapsState.status === 'loading' && (
                      <p className="hint">Loading lap data (this can take a while for long races)…</p>
                    )}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <LapPositionChart laps={lapsState.data} startingGrid={startingGrid} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Flag periods</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading flag data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <FlagGanttChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>
                </>
              )}

              {activeTab === 'pace' && (
                <>
                  <section className="chart-section">
                    <h2>Average pace</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading pace data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <PaceChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Pace consistency</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading consistency data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <PaceConsistencyChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Top speed</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading top speed data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <TopSpeedChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Driver consistency (class-wide)</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading consistency data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <DriverConsistencyChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Driver pace by FIA rating</h2>
                    {combinedBucket ? (
                      <p className="hint">
                        This chart is built from driver stints, which reset each session — pick a single session
                        above to use this chart.
                      </p>
                    ) : (
                      <>
                        {(lapsState.status === 'loading' || stintsState.status === 'loading') && (
                          <p className="hint">Loading pace data…</p>
                        )}
                        {lapsState.status === 'success' &&
                          stintsState.status === 'success' &&
                          (lapsState.data.length > 0 && stintsState.data.length > 0 ? (
                            <DriverRatingPaceChart laps={lapsState.data} stints={stintsState.data} />
                          ) : (
                            <p className="hint">No lap data for this session.</p>
                          ))}
                      </>
                    )}
                  </section>
                </>
              )}

              {activeTab === 'battle' && (
                <section className="chart-section">
                  <h2>Gap evolution</h2>
                  {combinedBucket ? (
                    <p className="hint">
                      Gap evolution compares elapsed time within one continuous session, so it isn't meaningful
                      across combined sessions — pick a single session above to use this chart.
                    </p>
                  ) : (
                    <>
                      {lapsState.status === 'loading' && <p className="hint">Loading gap data…</p>}
                      {lapsState.status === 'success' &&
                        (lapsState.data.length > 0 ? (
                          <GapEvolutionChart laps={lapsState.data} />
                        ) : (
                          <p className="hint">No lap data for this session.</p>
                        ))}
                    </>
                  )}
                </section>
              )}

              {activeTab === 'sectors' && (
                <section className="chart-section">
                  <h2>Sector analysis</h2>
                  {lapsState.status === 'loading' && <p className="hint">Loading sector data…</p>}
                  {lapsState.status === 'success' &&
                    (lapsState.data.length > 0 ? (
                      <SectorAnalysisChart
                        laps={lapsState.data}
                        seriesSlug={seriesSlug}
                        eventName={currentEvent?.display_name}
                      />
                    ) : (
                      <p className="hint">No lap data for this session.</p>
                    ))}
                </section>
              )}

              {activeTab === 'longruns' && (
                <>
                  <section className="chart-section">
                    <h2>Longest run pace by car</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading long run data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <LongRunChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Average long run pace</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading long run data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <AverageLongRunChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Stint length distribution</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading stint data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <StintLengthDistribution laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Long run pace by manufacturer</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading long run data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <LongRunPaceByManufacturer laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>
                </>
              )}

              {activeTab === 'pit' && (
                <>
                  <section className="chart-section">
                    <h2>Pit stops</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading pit stop data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <PitTimeChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Average pit stop time by team / manufacturer</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading pit stop data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <PitStopAverageChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Pit stops by round</h2>
                    <p className="hint">Each panel is one round of stops (every car's 1st, 2nd, 3rd, ... pit visit), ordered by which car stopped earliest.</p>
                    {lapsState.status === 'loading' && <p className="hint">Loading pit stop data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <PitRoundsChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Cumulative time in the pits</h2>
                    <p className="hint">Total pit time lost per car, stacked by round — texture identifies which stop, color identifies the team. Hover a segment for its VFT reading, where available.</p>
                    {lapsState.status === 'loading' && <p className="hint">Loading pit stop data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <PitCumulativeChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Average VFT use per lap</h2>
                    <p className="hint">Virtual Fuel Tank % consumed per lap on average, within a stint (excludes the recharge jump after a pit stop). Only populated for sessions with VFT data backfilled.</p>
                    {lapsState.status === 'loading' && <p className="hint">Loading VFT data…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <PitVftUsageChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>
                </>
              )}

              {activeTab === 'stints' && (
                <>
                <section className="chart-section">
                  <h2>Driver stint history</h2>
                  {combinedBucket ? (
                    <p className="hint">
                      Stint history is plotted against lap number, which restarts each session, so it can't be
                      combined across sessions — pick a single session above to use this chart.
                    </p>
                  ) : (
                    <>
                      {(stintsState.status === 'loading' || lapsState.status === 'loading') && (
                        <p className="hint">Loading stint data…</p>
                      )}
                      {stintsState.status === 'success' &&
                        lapsState.status === 'success' &&
                        (stintsState.data.length > 0 ? (
                          <DriverHistoryChart
                            stints={stintsState.data}
                            laps={lapsState.data}
                            isRaceSession={sessionSection === 'race'}
                          />
                        ) : (
                          <p className="hint">No stint data for this session.</p>
                        ))}
                    </>
                  )}
                </section>

                <section className="chart-section">
                  <h2>Drive time by driver</h2>
                  {lapsState.status === 'loading' && <p className="hint">Loading lap data…</p>}
                  {lapsState.status === 'success' &&
                    (lapsState.data.length > 0 ? (
                      <DriveTimeChart laps={lapsState.data} />
                    ) : (
                      <p className="hint">No lap data for this session.</p>
                    ))}
                </section>
                </>
              )}

              {activeTab === 'headtohead' && (
                <section className="chart-section">
                  <h2>Head to head</h2>
                  {lapsState.status === 'loading' && <p className="hint">Loading lap data…</p>}
                  {lapsState.status === 'success' &&
                    (lapsState.data.length > 0 ? (
                      <HeadToHeadChart laps={lapsState.data} />
                    ) : (
                      <p className="hint">No lap data for this session.</p>
                    ))}
                </section>
              )}

              {activeTab === 'tyres' && (
                <section className="chart-section">
                  <h2>Tyres</h2>
                  {lapsState.status === 'loading' && <p className="hint">Loading tyre data…</p>}
                  {lapsState.status === 'success' &&
                    (tyreClassSections.length > 0 ? (
                      tyreClassSections.map(({ cls, laps: classLaps, compounds }) => (
                        <div key={cls}>
                          {tyreClassSections.length > 1 && <h3 className="race-overview-subheading">{cls}</h3>}
                          {compounds.map((compound) => (
                            <div key={compound}>
                              <h4>Tyre degradation — {compoundDisplayName(compound)}</h4>
                              <TyreDegradationChart laps={classLaps} compound={compound} />
                            </div>
                          ))}
                          <h4>Tyre history</h4>
                          <TyreHistoryChart laps={classLaps} />
                        </div>
                      ))
                    ) : (
                      <p className="hint">No tyre data for this session.</p>
                    ))}
                </section>
              )}

              {activeTab === 'story' && (
                <section className="chart-section">
                  <h2>Story</h2>
                  {lapsState.status === 'loading' && <p className="hint">Loading story…</p>}
                  {lapsState.status === 'success' &&
                    (lapsState.data.length > 0 ? (
                      <StoryChart laps={lapsState.data} />
                    ) : (
                      <p className="hint">No lap data for this session.</p>
                    ))}
                </section>
              )}

              {activeTab === 'weather' && (
                <section className="chart-section">
                  <h2>Weather</h2>
                  {combinedBucket ? (
                    <p className="hint">
                      Weather is a single session's own time series — pick a single session above to use this chart.
                    </p>
                  ) : (
                    <>
                      {weatherState.status === 'loading' && <p className="hint">Loading weather data…</p>}
                      {weatherState.status === 'error' && (
                        <p className="error">Failed to load weather data: {weatherState.error}</p>
                      )}
                      {weatherState.status === 'success' &&
                        (weatherState.data.length > 0 ? (
                          <WeatherChart readings={weatherState.data} />
                        ) : (
                          <p className="hint">
                            No weather data for this session — only available for sessions captured via the live
                            timing feed.
                          </p>
                        ))}
                    </>
                  )}
                </section>
              )}
                </>
              )}
            </>
          )}
        </main>
      </div>
      {settingsOpen && (
        <SettingsPanel
          teams={knownTeams}
          onClose={() => setSettingsOpen(false)}
          currentSessionId={sessionId && !combinedBucket ? Number(sessionId) : undefined}
        />
      )}
      {selectedCarDetail && lapsState.status === 'success' && (
        <div className="replay-root car-detail-modal-scope">
          <CarDetailModal
            carNumber={selectedCarDetail}
            allLaps={lapsState.data}
            isRaceSession={sessionSection === 'race'}
            onClose={() => setSelectedCarDetail(null)}
          />
        </div>
      )}
    </div>
  )
}

export default App
