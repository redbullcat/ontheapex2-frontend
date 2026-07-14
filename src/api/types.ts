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
  // False for a lap the timing system flagged as not a legitimate timed
  // lap (track-limit violation, pit-in lap, driver-change/red-flag
  // out-lap, etc). Absent on older cached data — treat missing the same
  // as true (see isLapValid in lib/lapValidity.ts).
  is_valid?: boolean
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
  // FIA driver category (Platinum/Gold/Silver/Bronze) — live/promoted
  // sessions only, null for CSV imports (predate this entirely).
  driver_category?: string | null
  pit_time: string | null
  pit_time_seconds: number | null
  class: string | null
  group: string | null
  team: string | null
  manufacturer: string | null
  flag_at_fl: string | null

  // Tyre snapshot at the moment this lap finished — null for CSV-imported
  // sessions and any live session promoted before this existed.
  tire_fl_compound?: string | null
  tire_fl_age_laps?: number | null
  tire_fl_changed?: boolean | null
  tire_fr_compound?: string | null
  tire_fr_age_laps?: number | null
  tire_fr_changed?: boolean | null
  tire_rl_compound?: string | null
  tire_rl_age_laps?: number | null
  tire_rl_changed?: boolean | null
  tire_rr_compound?: string | null
  tire_rr_age_laps?: number | null
  tire_rr_changed?: boolean | null
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
  manufacturer: string | null
  driver_name: string | null
  // FIA driver category (Platinum/Gold/Silver/Bronze), lowercase — null
  // for any class/series without it, or until Griiip's participants push
  // for this driver has been seen (see app/live/participants.py).
  driver_category: string | null
  gap_to_first_seconds: number
  gap_to_next_seconds: number | null
  // Lap-deficit form of the two gaps above, e.g. "+1 Lap" instead of a
  // seconds figure once a car's actually a lap or more behind — null
  // whenever the deficit is zero (never actually observed non-null in a
  // capture yet, only ever seen in practice sessions where it doesn't
  // apply; see app/live/state.py's standings_as_list).
  gap_to_first_laps: number | null
  gap_to_next_laps: number | null
  // Same gap/interval concept, but relative to the class field instead of
  // the overall one (Griiip's own frontend's "C.Gap"/"C.Int" columns) —
  // derived server-side from the same gap_to_first/total_laps data above,
  // not a distinct field Griiip sends. Null for a class leader's
  // class_gap_to_next_* (no car ahead in class) and for
  // class_gap_to_first_seconds only on the class leader itself, which is
  // always exactly 0.
  class_gap_to_first_seconds: number | null
  class_gap_to_next_seconds: number | null
  class_gap_to_first_laps: number | null
  class_gap_to_next_laps: number | null
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
  // Current tyre snapshot (Griiip's `tires` channel) — updates continuously
  // mid-stint, unlike the copy attached to each completed lap.
  tire_fl_compound: string | null
  tire_fl_age_laps: number | null
  tire_fl_changed: boolean | null
  tire_fr_compound: string | null
  tire_fr_age_laps: number | null
  tire_fr_changed: boolean | null
  tire_rl_compound: string | null
  tire_rl_age_laps: number | null
  tire_rl_changed: boolean | null
  tire_rr_compound: string | null
  tire_rr_age_laps: number | null
  tire_rr_changed: boolean | null
  // "Virtual Energy Tank" — Griiip's `cars-energy-tanks` channel, the same
  // data source powering WEC's official broadcast graphic. Hypercar/LMGT3
  // only; null for every other class (no energy allocation system) and
  // null until the backend's field-shape guess for this channel has been
  // confirmed against a real push (see app/live/state.py).
  vft_percent: number | null
}

// 'TyreChange' is never sent by Griiip itself — synthesized client-side
// from wheel-stint boundaries (see lib/tyreChangeEvents.ts) since the raw
// feed has no discrete event for it, the same way Replay already
// synthesizes PitIn/PitOut/DriverSwap/RaceFlag from lap data.
export type RaceLogType = 'PitIn' | 'PitOut' | 'RCMessage' | 'RaceFlag' | 'DriverSwap' | 'FastestLap' | 'WeatherUpdate' | 'TyreChange'

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
  pit_time: string | null
  pit_time_seconds: number | null
  class: string | null
  team: string | null
  manufacturer: string | null
  flag_at_fl: string | null

  tire_fl_compound?: string | null
  tire_fl_age_laps?: number | null
  tire_fl_changed?: boolean | null
  tire_fr_compound?: string | null
  tire_fr_age_laps?: number | null
  tire_fr_changed?: boolean | null
  tire_rl_compound?: string | null
  tire_rl_age_laps?: number | null
  tire_rl_changed?: boolean | null
  tire_rr_compound?: string | null
  tire_rr_age_laps?: number | null
  tire_rr_changed?: boolean | null
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
  // car_number -> relative distance around the lap (0-1), from Griiip's
  // cars-geo-locations channel — empty until that channel is confirmed to
  // actually push against a real session (see backend app/live/state.py).
  car_locations: Record<string, number>
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

// Empty for every CSV-imported historical session (predates this entirely)
// and for any live-promoted session recorded before weather history was
// added — a normal "no data" state, not an error (see app/api/v1/endpoints/
// sessions.py's weather endpoint).
export interface WeatherReading {
  elapsed_seconds: number | null
  air_temperature: number | null
  track_temperature: number | null
  humidity: number | null
  wind_speed_kph: number | null
  wind_direction_code: string | null
  // Unconfirmed Griiip field name — see app/live/state.py's
  // _extract_weather_reading.
  pressure: number | null
  sky: string | null
}

// A post-session steward decision (a time penalty, drive-through, DSQ, etc)
// recorded by hand — free-type since stewards' decisions cover far more
// ground than any fixed set of penalty types would capture. `consequence`
// is what actually feeds classification math (ResultsTable/
// SessionResultsTable) — 'none' leaves the badge purely informational.
export type PenaltyConsequence = 'none' | 'time' | 'dsq'

export interface PenaltyRead {
  id: number
  session_id: number
  car_number: string
  penalty: string
  reason: string
  stewards_doc_url: string | null
  consequence: PenaltyConsequence
  time_penalty_seconds: number | null
  created_at: string
}

// A lap manually flagged as excluded from fastest-lap classification (e.g.
// a pole lap struck down for a sporting infringement) — the raw lap is
// never touched, only skipped wherever "fastest lap" is computed.
export interface DeletedLapRead {
  id: number
  session_id: number
  car_number: string
  lap_number: number
  reason: string
  deleted_at: string
}
