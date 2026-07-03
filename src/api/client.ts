import type { EventSummary, HourlyPositions, LapRead, LeadStint, LiveState, Series, SessionSummary, Stint } from './types'

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

export function getHourlyPositions(sessionId: number): Promise<HourlyPositions[]> {
  return get<HourlyPositions[]>(`/api/sessions/${sessionId}/hourly-positions`)
}

const LAPS_PAGE_SIZE = 5000

// Long endurance races can exceed the 5000-row page cap (e.g. Le Mans is
// ~20k+ rows), so page through sequentially until a short page signals the end.
export async function getLaps(sessionId: number): Promise<LapRead[]> {
  const all: LapRead[] = []
  let offset = 0
  for (;;) {
    const page = await get<LapRead[]>(`/api/sessions/${sessionId}/laps?limit=${LAPS_PAGE_SIZE}&offset=${offset}`)
    all.push(...page)
    if (page.length < LAPS_PAGE_SIZE) break
    offset += LAPS_PAGE_SIZE
  }
  return all
}

export function getStints(sessionId: number): Promise<Stint[]> {
  return get<Stint[]>(`/api/sessions/${sessionId}/stints`)
}

// "Combine all Practice sessions" (etc) fetches every session's laps in
// parallel and pools them — each LapRead already carries its own
// session_id, which is what keeps stint/pit-stop pairing from bridging
// across a session boundary once laps from different sessions are mixed
// together (see computeCarStints and PitTimeChart).
export async function getCombinedLaps(sessionIds: number[]): Promise<LapRead[]> {
  const pages = await Promise.all(sessionIds.map((id) => getLaps(id)))
  return pages.flat()
}

// `griiipSessionId` is the raw Griiip feed session id (`sid`), not our own
// sessions.id — the live pipeline has no mapping onto a real session record
// yet, see app/live/manager.py on the backend.
export function getLiveState(griiipSessionId: number): Promise<LiveState> {
  return get<LiveState>(`/api/live/${griiipSessionId}/state`)
}
