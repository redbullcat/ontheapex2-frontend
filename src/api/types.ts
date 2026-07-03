export interface Series {
  id: number
  slug: string
  display_name: string
}

export interface EventSummary {
  id: number
  series_id: number
  year: number
  slug: string
  display_name: string
}

export type SessionType = 'race' | 'practice' | 'qualifying' | 'test' | 'other'

export interface SessionSummary {
  id: number
  event_id: number
  type: SessionType
  filename: string
  race_date: string | null
  label: string
}

export interface LeadStint {
  car_number: string
  team: string | null
  manufacturer: string | null
  drivers: string
  start_lap: number
  end_lap: number
  laps_led: number
}

export interface HourlyPositionEntry {
  position: number
  car_number: string
  team: string | null
  class: string | null
  manufacturer: string | null
  lap_number: number
  elapsed_seconds: number
}

export interface HourlyPositions {
  hour: number
  positions: HourlyPositionEntry[]
}

export interface LapRead {
  id: number
  session_id: number
  car_number: string
  driver_number: string | null
  lap_number: number
  lap_time: string | null
  lap_time_seconds: number | null
  lap_improvement: boolean
  crossing_finish_line_in_pit: string | null
  s1: string | null
  s2: string | null
  s3: string | null
  s1_improvement: boolean
  s2_improvement: boolean
  s3_improvement: boolean
  s1_seconds: number | null
  s2_seconds: number | null
  s3_seconds: number | null
  kph: number | null
  elapsed: string | null
  elapsed_seconds: number | null
  hour: string | null
  top_speed: number | null
  driver_name: string | null
  pit_time: string | null
  pit_time_seconds: number | null
  class: string | null
  group: string | null
  team: string | null
  manufacturer: string | null
  flag_at_fl: string | null
}

// Griiip's own per-crossing classification: Green = personal best, Purple =
// session best in class (also implies personal best), Gray = neither.
export type LiveTimeColor = 'Green' | 'Purple' | 'Gray' | null

export interface LiveStanding {
  position: number | null
  class_position: number | null
  car_number: string
  class: string | null
  team: string | null
  driver_name: string | null
  gap_to_first_seconds: number
  gap_to_next_seconds: number | null
  // Lap-deficit form of the two gaps above, e.g. "+1 Lap" instead of a
  // seconds figure once a car's actually a lap or more behind — null
  // whenever the deficit is zero (never actually observed non-null in a
  // capture yet, only ever seen in practice sessions where it doesn't
  // apply; see app/live/state.py's standings_as_list).
  gap_to_first_laps: number | null
  gap_to_next_laps: number | null
  best_lap_seconds: number | null
  last_lap_seconds: number | null
  last_lap_color: LiveTimeColor
  total_laps: number
  // True once this car has completed the one lap it's entitled to finish
  // after the chequered flag came out (motorsport convention — see
  // chequered_flag_shown below). Always false until the flag has been shown.
  taken_chequered_flag: boolean
  // Real-time (car-location-on-track channel), not inferred from lap
  // boundaries — can flip mid-lap, before the car's current lap even
  // completes.
  in_pit: boolean
}

export type RaceLogType = 'PitIn' | 'PitOut' | 'RCMessage' | 'RaceFlag' | 'DriverSwap' | 'FastestLap' | 'WeatherUpdate'

export interface RaceLogEntry {
  type: RaceLogType
  raceLogItemId: string
  lapNumber: number
  ts: string
  elapsedTimeMillis: number
  pid: number
  carNumber: string
  classId: string
  // Present depending on `type` — RCMessage has `text`, RaceFlag has `flag`,
  // DriverSwap has previousDriverId/newDriverId, PitOut/FastestLap have
  // totalTimeInPitMillis/lapTimeMillis. Left loose rather than a discriminated
  // union since this is a passthrough of Griiip's own event shape.
  text?: string
  flag?: string
  lapTimeMillis?: number
  totalTimeInPitMillis?: number
}

export interface SessionClock {
  start_time: string | null
  time_limit_seconds: number | null
  laps_limit: number | null
}

// A subset of LapRead's fields — live laps have no `id`/`session_id` (they
// aren't persisted yet) and several columns (kph, elapsed, hour) aren't
// populated by the live feed at all.
export interface LiveLap {
  is_valid: boolean
  car_number: string
  lap_number: number
  lap_time: string | null
  lap_time_seconds: number | null
  lap_improvement: boolean
  crossing_finish_line_in_pit: string | null
  s1: string | null
  s2: string | null
  s3: string | null
  s1_seconds: number | null
  s2_seconds: number | null
  s3_seconds: number | null
  s1_improvement: boolean
  s2_improvement: boolean
  s3_improvement: boolean
  lap_color: LiveTimeColor
  s1_color: LiveTimeColor
  s2_color: LiveTimeColor
  s3_color: LiveTimeColor
  elapsed_seconds: number | null
  top_speed: number | null
  driver_name: string | null
  class: string | null
  team: string | null
  manufacturer: string | null
  flag_at_fl: string | null
}

export interface LiveWeather {
  temperature: number | null
  trackTemperature: number | null
  humidity: number | null
  windSpeedKph: number | null
  windDirectionCode: string | null
  sky: string | null
}

export interface LiveState {
  griiip_session_id: number
  current_flag: string | null
  // Raw Griiip sessionType string, best-effort — see lib/liveSessionType.ts
  // for how this gets classified into practice/qualifying/race.
  session_type: string | null
  session_ended: boolean
  // True once the chequered flag has been shown this session — distinct
  // from session_ended, since cars on track when it drops get to complete
  // their current lap first (see LiveStanding.taken_chequered_flag).
  chequered_flag_shown: boolean
  session_clock: SessionClock | null
  weather: LiveWeather | null
  standings: LiveStanding[]
  laps: LiveLap[]
  race_log: RaceLogEntry[]
}

// From GET /api/live/sessions — enough to build a "Live now" link without
// already knowing the griiip session id.
export interface LiveSessionSummary {
  griiip_session_id: number
  session_ended: boolean
  series_name: string
  event_name: string
  session_name: string
  session_type: string
}

export interface Stint {
  car_number: string
  team: string | null
  manufacturer: string | null
  class: string | null
  drivers: string
  start_lap: number
  end_lap: number
  lap_count: number
  avg_lap_seconds: number | null
  best_lap_seconds: number | null
}
