import { useMemo, useState } from 'react'
import { getEvents, getLeadHistory, getSeries, getSessions } from './api/client'
import { useAsync } from './hooks/useAsync'
import { Select } from './components/Select'
import { LeadHistoryChart } from './components/LeadHistoryChart'
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
        <p className="subtitle">Endurance racing data — lead history</p>
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

      <section className="chart-section">
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
    </div>
  )
}

export default App
