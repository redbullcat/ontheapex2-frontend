import { useMemo, useState } from 'react'
import { getEvents, getHourlyPositions, getLaps, getLeadHistory, getSeries, getSessions, getStints } from './api/client'
import { useAsync } from './hooks/useAsync'
import { Sidebar } from './components/Sidebar'
import { Tabs, type Tab } from './components/Tabs'
import { LeadHistoryChart } from './components/LeadHistoryChart'
import { PositionChart } from './components/PositionChart'
import { LapPositionChart } from './components/LapPositionChart'
import { ResultsTable } from './components/ResultsTable'
import { PaceChart } from './components/PaceChart'
import { GapEvolutionChart } from './components/GapEvolutionChart'
import { DriverHistoryChart } from './components/DriverHistoryChart'
import './App.css'

const TABS: Tab[] = [
  { id: 'results', label: 'Results' },
  { id: 'position', label: 'Position' },
  { id: 'pace', label: 'Pace' },
  { id: 'battle', label: 'Battle' },
  { id: 'stints', label: 'Stints' },
]

function App() {
  const [seriesSlug, setSeriesSlug] = useState('')
  const [year, setYear] = useState('')
  const [eventId, setEventId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [activeTab, setActiveTab] = useState('results')

  const seriesState = useAsync(getSeries, [])
  const eventsState = useAsync(seriesSlug ? () => getEvents(seriesSlug) : null, [seriesSlug])
  const sessionsState = useAsync(eventId ? () => getSessions(Number(eventId)) : null, [eventId])
  const leadHistoryState = useAsync(
    sessionId ? () => getLeadHistory(Number(sessionId)) : null,
    [sessionId],
  )
  const positionsState = useAsync(
    sessionId ? () => getHourlyPositions(Number(sessionId)) : null,
    [sessionId],
  )
  const lapsState = useAsync(sessionId ? () => getLaps(Number(sessionId)) : null, [sessionId])
  const stintsState = useAsync(sessionId ? () => getStints(Number(sessionId)) : null, [sessionId])

  const years = useMemo(() => {
    if (eventsState.status !== 'success') return []
    const distinct = [...new Set(eventsState.data.map((e) => e.year))]
    return distinct.sort((a, b) => b - a)
  }, [eventsState])

  const eventsForYear = useMemo(() => {
    if (eventsState.status !== 'success' || !year) return []
    return eventsState.data.filter((e) => String(e.year) === year)
  }, [eventsState, year])

  const hasSession = sessionId !== ''

  return (
    <div className="app">
      <header>
        <h1>On The Apex</h1>
        <p className="subtitle">Endurance racing data</p>
      </header>

      <div className="app-shell">
        <Sidebar
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
          sessions={
            sessionsState.status === 'success'
              ? sessionsState.data.map((s) => ({ value: String(s.id), label: `${s.label} (${s.type})` }))
              : []
          }
          sessionValue={sessionId}
          onSessionChange={setSessionId}
          sessionDisabled={!eventId || sessionsState.status !== 'success'}
        />

        <main className="main">
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

          {!hasSession ? (
            <p className="hint">Pick a series, year, event and session in the sidebar to get started.</p>
          ) : (
            <>
              <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

              {activeTab === 'results' && (
                <>
                  <section className="chart-section">
                    <h2>Who led</h2>
                    {leadHistoryState.status === 'loading' && <p className="hint">Loading lead history…</p>}
                    {leadHistoryState.status === 'success' &&
                      (leadHistoryState.data.length > 0 ? (
                        <LeadHistoryChart stints={leadHistoryState.data} />
                      ) : (
                        <p className="hint">No lead-history data for this session.</p>
                      ))}
                  </section>

                  <section className="chart-section">
                    <h2>Results</h2>
                    {lapsState.status === 'loading' && <p className="hint">Loading results…</p>}
                    {lapsState.status === 'success' &&
                      (lapsState.data.length > 0 ? (
                        <ResultsTable laps={lapsState.data} />
                      ) : (
                        <p className="hint">No results for this session.</p>
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
                        <LapPositionChart laps={lapsState.data} />
                      ) : (
                        <p className="hint">No lap data for this session.</p>
                      ))}
                  </section>
                </>
              )}

              {activeTab === 'pace' && (
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
              )}

              {activeTab === 'battle' && (
                <section className="chart-section">
                  <h2>Gap evolution</h2>
                  {lapsState.status === 'loading' && <p className="hint">Loading gap data…</p>}
                  {lapsState.status === 'success' &&
                    (lapsState.data.length > 0 ? (
                      <GapEvolutionChart laps={lapsState.data} />
                    ) : (
                      <p className="hint">No lap data for this session.</p>
                    ))}
                </section>
              )}

              {activeTab === 'stints' && (
                <section className="chart-section">
                  <h2>Driver stint history</h2>
                  {(stintsState.status === 'loading' || lapsState.status === 'loading') && (
                    <p className="hint">Loading stint data…</p>
                  )}
                  {stintsState.status === 'success' &&
                    lapsState.status === 'success' &&
                    (stintsState.data.length > 0 ? (
                      <DriverHistoryChart stints={stintsState.data} laps={lapsState.data} />
                    ) : (
                      <p className="hint">No stint data for this session.</p>
                    ))}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
