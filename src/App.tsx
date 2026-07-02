import { useMemo, useState } from 'react'
import { getEvents, getHourlyPositions, getLaps, getLeadHistory, getSeries, getSessions } from './api/client'
import { useAsync } from './hooks/useAsync'
import { Select } from './components/Select'
import { LeadHistoryChart } from './components/LeadHistoryChart'
import { PositionChart } from './components/PositionChart'
import { LapPositionChart } from './components/LapPositionChart'
import { ResultsTable } from './components/ResultsTable'
import './App.css'

function App() {
  const [seriesSlug, setSeriesSlug] = useState('')
  const [year, setYear] = useState('')
  const [eventId, setEventId] = useState('')
  const [sessionId, setSessionId] = useState('')

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

  const years = useMemo(() => {
    if (eventsState.status !== 'success') return []
    const distinct = [...new Set(eventsState.data.map((e) => e.year))]
    return distinct.sort((a, b) => b - a)
  }, [eventsState])

  const eventsForYear = useMemo(() => {
    if (eventsState.status !== 'success' || !year) return []
    return eventsState.data.filter((e) => String(e.year) === year)
  }, [eventsState, year])

  return (
    <div className="app">
      <header>
        <h1>On The Apex</h1>
        <p className="subtitle">Endurance racing data</p>
      </header>

      <section className="picker">
        <Select
          label="Series"
          value={seriesSlug}
          options={
            seriesState.status === 'success'
              ? seriesState.data.map((s) => ({ value: s.slug, label: s.display_name }))
              : []
          }
          onChange={(v) => {
            setSeriesSlug(v)
            setYear('')
            setEventId('')
            setSessionId('')
          }}
          disabled={seriesState.status !== 'success'}
        />
        <Select
          label="Year"
          narrow
          value={year}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(v) => {
            setYear(v)
            setEventId('')
            setSessionId('')
          }}
          disabled={!seriesSlug || eventsState.status !== 'success'}
        />
        <Select
          label="Event"
          value={eventId}
          options={eventsForYear.map((e) => ({ value: String(e.id), label: e.display_name }))}
          onChange={(v) => {
            setEventId(v)
            setSessionId('')
          }}
          disabled={!year || eventsState.status !== 'success'}
        />
        <Select
          label="Session"
          value={sessionId}
          options={
            sessionsState.status === 'success'
              ? sessionsState.data.map((s) => ({ value: String(s.id), label: `${s.label} (${s.type})` }))
              : []
          }
          onChange={setSessionId}
          disabled={!eventId || sessionsState.status !== 'success'}
        />
      </section>

      {seriesState.status === 'error' && <p className="error">Failed to load series: {seriesState.error}</p>}
      {eventsState.status === 'error' && <p className="error">Failed to load events: {eventsState.error}</p>}
      {sessionsState.status === 'error' && <p className="error">Failed to load sessions: {sessionsState.error}</p>}
      {leadHistoryState.status === 'error' && (
        <p className="error">Failed to load lead history: {leadHistoryState.error}</p>
      )}
      {positionsState.status === 'error' && (
        <p className="error">Failed to load position data: {positionsState.error}</p>
      )}
      {lapsState.status === 'error' && <p className="error">Failed to load lap data: {lapsState.error}</p>}

      <section className="chart-section">
        <h2>Who led</h2>
        {leadHistoryState.status === 'loading' && <p className="hint">Loading lead history…</p>}
        {leadHistoryState.status === 'success' &&
          (leadHistoryState.data.length > 0 ? (
            <LeadHistoryChart stints={leadHistoryState.data} />
          ) : (
            <p className="hint">No lead-history data for this session.</p>
          ))}
        {leadHistoryState.status === 'idle' && (
          <p className="hint">Pick a series, year, event and session to see who led.</p>
        )}
      </section>

      <section className="chart-section">
        <h2>Race position by hour</h2>
        {positionsState.status === 'loading' && <p className="hint">Loading position data…</p>}
        {positionsState.status === 'success' &&
          (positionsState.data.length > 0 ? (
            <PositionChart data={positionsState.data} />
          ) : (
            <p className="hint">No position data for this session.</p>
          ))}
        {positionsState.status === 'idle' && (
          <p className="hint">Pick a series, year, event and session to see the running order.</p>
        )}
      </section>

      <section className="chart-section">
        <h2>Lap-by-lap position</h2>
        {lapsState.status === 'loading' && <p className="hint">Loading lap data (this can take a while for long races)…</p>}
        {lapsState.status === 'success' &&
          (lapsState.data.length > 0 ? (
            <LapPositionChart laps={lapsState.data} />
          ) : (
            <p className="hint">No lap data for this session.</p>
          ))}
        {lapsState.status === 'idle' && (
          <p className="hint">Pick a series, year, event and session to see lap-by-lap position.</p>
        )}
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
        {lapsState.status === 'idle' && (
          <p className="hint">Pick a series, year, event and session to see results.</p>
        )}
      </section>
    </div>
  )
}

export default App
