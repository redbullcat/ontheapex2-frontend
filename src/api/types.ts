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
