import type { LiveSessionSummary } from '../api/types'

export function liveNowUrl(session: LiveSessionSummary): string {
  const title = [session.series_name, session.event_name, session.session_name].filter(Boolean).join(' · ')
  const params = new URLSearchParams({ sid: String(session.griiip_session_id), title })
  return `/live-now?${params.toString()}`
}
