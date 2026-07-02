import { Select } from './Select'

interface Option {
  value: string
  label: string
}

export type Theme = 'light' | 'dark'

export function Sidebar({
  open,
  onToggle,
  theme,
  onThemeChange,
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
}: {
  open: boolean
  onToggle: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
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
}) {
  if (!open) {
    return (
      <div className="sidebar-collapsed">
        <button type="button" className="sidebar-toggle" onClick={onToggle} title="Show sidebar" aria-label="Show sidebar">
          »
        </button>
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top-row">
        <button type="button" className="sidebar-toggle" onClick={onToggle} title="Hide sidebar" aria-label="Hide sidebar">
          «
        </button>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
      <Select label="Series" value={seriesValue} options={series} onChange={onSeriesChange} disabled={seriesDisabled} />
      <Select label="Year" value={yearValue} options={years} onChange={onYearChange} disabled={yearDisabled} />
      <Select label="Event" value={eventValue} options={events} onChange={onEventChange} disabled={eventDisabled} />
    </aside>
  )
}
