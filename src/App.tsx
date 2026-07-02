import { useState } from 'react'
import { getEvents, getLeadHistory, getSeries, getSessions } from './api/client'
import { useAsync } from './hooks/useAsync'
import { Select } from './components/Select'
import { LeadHistoryChart } from './components/LeadHistoryChart'
import './App.css'

function App() {
  const [seriesSlug, setSeriesSlug] = useState('')
  const [eventId, setEventId] = useState('')
  const [sessionId, setSessionId] = useState('')

  const seriesState = useAsync(getSeries, [])
  const eventsState = useAsync(seriesSlug ? () => getEvents(seriesSlug) : null, [seriesSlug])
  const sessionsState = useAsync(eventId ? () => getSessions(Number(eventId)) : null, [eventId])
  const leadHistoryState = useAsync(
    sessionId ? () => getLeadHistory(Number(sessionId)) : null,
    [sessionId],
  )

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
              ? seriesState.data.map((s) => ({ value: s.slug, label: s.name }))
              : []
          }
          onChange={(v) => {
            setSeriesSlug(v)
            setEventId('')
            setSessionId('')
          }}
          disabled={seriesState.status !== 'success'}
        />
        <Select
          label="Event"
          value={eventId}
          options={
            eventsState.status === 'success'
              ? eventsState.data.map((e) => ({ value: String(e.id), label: e.name }))
              : []
          }
          onChange={(v) => {
            setEventId(v)
            setSessionId('')
          }}
          disabled={!seriesSlug || eventsState.status !== 'success'}
        />
        <Select
          label="Session"
          value={sessionId}
          options={
            sessionsState.status === 'success'
              ? sessionsState.data.map((s) => ({ value: String(s.id), label: `${s.name} (${s.type})` }))
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
        {leadHistoryState.status === 'idle' && <p className="hint">Pick a series, event and session to see who led.</p>}
      </section>
    </div>
  )
}

export default App
