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
