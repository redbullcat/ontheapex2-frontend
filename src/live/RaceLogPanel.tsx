import { useMemo, useState } from 'react'
import type { RaceLogEntry, RaceLogType } from '../api/types'
import { RACE_LOG_TYPE_LABELS, formatRaceLogEntry } from './raceLog'

const ALL_LOG_TYPES: RaceLogType[] = ['RCMessage', 'RaceFlag', 'DriverSwap', 'FastestLap', 'PitIn', 'PitOut', 'TyreChange']

function defaultFormatTimestamp(entry: RaceLogEntry): string {
  return new Date(entry.ts).toLocaleTimeString()
}

export function RaceLogPanel({
  entries,
  availableTypes = ALL_LOG_TYPES,
  formatTimestamp = defaultFormatTimestamp,
}: {
  entries: RaceLogEntry[]
  // Replay has no RCMessage/WeatherUpdate equivalent (nothing in the CSV
  // maps to them) — pass a narrower list so those filter chips don't show
  // up promising something that'll never have entries.
  availableTypes?: RaceLogType[]
  // Live has real wall-clock timestamps; Replay only has elapsed session
  // time, so it needs its own formatter (see ReplaySidebar).
  formatTimestamp?: (entry: RaceLogEntry) => string
}) {
  const [logTypeFilter, setLogTypeFilter] = useState<Set<RaceLogType>>(new Set(availableTypes))

  const visibleLog = useMemo(() => entries.filter((e) => logTypeFilter.has(e.type)).slice(0, 60), [entries, logTypeFilter])

  function toggleLogType(t: RaceLogType) {
    setLogTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next.size === 0 ? new Set(availableTypes) : next
    })
  }

  return (
    <div>
      <p className="replay-panel-label">
        Race log
        <span className="hint"> — race control, flags, driver swaps, fastest laps, pit in/out</span>
      </p>
      <div className="live-log-filters">
        {availableTypes.map((t) => (
          <label className="class-filter-item" key={t}>
            <input type="checkbox" checked={logTypeFilter.has(t)} onChange={() => toggleLogType(t)} />
            <span>{RACE_LOG_TYPE_LABELS[t]}</span>
          </label>
        ))}
      </div>
      <ul className="live-log-list">
        {visibleLog.map((entry, i) => (
          <li key={`${entry.raceLogItemId}-${i}`} className={`live-log-item live-log-${entry.type}`}>
            <span className="live-log-time">{formatTimestamp(entry)}</span>
            <span className="live-log-type">{RACE_LOG_TYPE_LABELS[entry.type]}</span>
            <span className="live-log-text">{formatRaceLogEntry(entry)}</span>
          </li>
        ))}
        {visibleLog.length === 0 && <p className="replay-hint">No events yet for the selected filters.</p>}
      </ul>
    </div>
  )
}
