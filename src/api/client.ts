import type { EventSummary, LeadStint, Series, SessionSummary } from './types'

const BASE_URL = 'https://ontheapex-api.fly.dev'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export function getSeries(): Promise<Series[]> {
  return get<Series[]>('/api/series')
}

export function getEvents(seriesSlug: string): Promise<EventSummary[]> {
  return get<EventSummary[]>(`/api/series/${seriesSlug}/events`)
}

export function getSessions(eventId: number): Promise<SessionSummary[]> {
  return get<SessionSummary[]>(`/api/events/${eventId}/sessions`)
}

export function getLeadHistory(sessionId: number): Promise<LeadStint[]> {
  return get<LeadStint[]>(`/api/sessions/${sessionId}/lead-history`)
}
