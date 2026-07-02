import { Select } from './Select'

interface Option {
  value: string
  label: string
}

export function Sidebar({
  series,
  seriesValue,
  onSeriesChange,
  seriesDisabled,
  years,
  yearValue,
  onYearChange,
  yearDisabled,
  events,
  eventValue,
  onEventChange,
  eventDisabled,
  sessions,
  sessionValue,
  onSessionChange,
  sessionDisabled,
}: {
  series: Option[]
  seriesValue: string
  onSeriesChange: (v: string) => void
  seriesDisabled: boolean
  years: Option[]
  yearValue: string
  onYearChange: (v: string) => void
  yearDisabled: boolean
  events: Option[]
  eventValue: string
  onEventChange: (v: string) => void
  eventDisabled: boolean
  sessions: Option[]
  sessionValue: string
  onSessionChange: (v: string) => void
  sessionDisabled: boolean
}) {
  return (
    <aside className="sidebar">
      <Select label="Series" value={seriesValue} options={series} onChange={onSeriesChange} disabled={seriesDisabled} />
      <Select label="Year" value={yearValue} options={years} onChange={onYearChange} disabled={yearDisabled} />
      <Select label="Event" value={eventValue} options={events} onChange={onEventChange} disabled={eventDisabled} />
      <Select
        label="Session"
        value={sessionValue}
        options={sessions}
        onChange={onSessionChange}
        disabled={sessionDisabled}
      />
    </aside>
  )
}
