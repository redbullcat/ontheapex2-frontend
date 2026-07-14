import type { RaceLogEntry, RaceLogType } from '../api/types'
import { formatLapTime } from '../replay/format'

// One combined, filterable feed for race control messages, driver swaps,
// flag changes, and fastest-lap callouts — the shape Griiip's own race-log
// channel already arrives in, just given readable text per type.
export const RACE_LOG_TYPE_LABELS: Record<RaceLogType, string> = {
  RCMessage: 'Race control',
  RaceFlag: 'Flag',
  DriverSwap: 'Driver swap',
  FastestLap: 'Fastest lap',
  PitIn: 'Pit in',
  PitOut: 'Pit out',
  WeatherUpdate: 'Weather',
  TyreChange: 'Tyre change',
}

export function formatRaceLogEntry(entry: RaceLogEntry): string {
  switch (entry.type) {
    case 'RCMessage':
      return entry.text ?? ''
    case 'RaceFlag':
      return `Flag: ${entry.flag ?? '—'}`
    case 'DriverSwap':
      return `#${entry.carNumber} — driver change`
    case 'FastestLap':
      return `#${entry.carNumber} — new fastest lap: ${formatLapTime(entry.lapTimeMillis != null ? entry.lapTimeMillis / 1000 : null)}`
    case 'PitIn':
      return `#${entry.carNumber} — pit in (lap ${entry.lapNumber})`
    case 'PitOut':
      return `#${entry.carNumber} — pit out${entry.totalTimeInPitMillis != null ? ` (${(entry.totalTimeInPitMillis / 1000).toFixed(1)}s in pit)` : ''}`
    case 'WeatherUpdate':
      return 'Weather update'
    case 'TyreChange':
      return `#${entry.carNumber} — tyre change (${entry.text ?? '?'}, lap ${entry.lapNumber})`
    default:
      return entry.type
  }
}
