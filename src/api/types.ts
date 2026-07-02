export interface Series {
  slug: string
  name: string
}

export interface EventSummary {
  id: number
  name: string
  series_slug: string
  start_date: string
  end_date: string
}

export type SessionType = 'race' | 'practice' | 'qualifying' | 'test' | 'other'

export interface SessionSummary {
  id: number
  event_id: number
  name: string
  type: SessionType
  start_time: string | null
}

export interface LeadStint {
  car_number: string
  driver: string | null
  team: string | null
  lap_start: number
  lap_end: number
}
