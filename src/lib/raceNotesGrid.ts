import { GENERAL_COLUMN_ID, hourBucket, type RaceNote } from './raceNotes'
import type { NotesColumn } from '../hooks/useNotesColumns'
import type { FlagEvent } from './flagEvents'
import { FLAG_LABELS } from './flags'

export interface NotesHourRow {
  type: 'hour'
  hour: number
  // The overall leader as of the last note logged in this hour, carried
  // forward from the previous hour if this hour has no notes of its own —
  // same "leader-tracking column filled in every row regardless of
  // whether anything happened" idea as the Google Doc this replaces.
  leader: { carNumber: string; driverName: string | null } | null
  byColumn: Map<string, RaceNote[]>
}

export interface NotesFlagRow {
  type: 'flag'
  event: FlagEvent
  label: string
}

export type NotesTimelineRow = NotesHourRow | NotesFlagRow

export function flagEventLabel(event: FlagEvent): string {
  return `${FLAG_LABELS[event.category]} #${event.occurrence} — Lap ${event.startLap}${event.endLap !== event.startLap ? `–${event.endLap}` : ''}`
}

// One row per race-elapsed hour (1..the latest hour any note or flag event
// falls in) with one cell per configured column, plus a full-width row for
// every FCY/safety-car/red-flag period inserted right after the hour it
// started in — mirrors the table the user described keeping in a Google
// Doc during races, extended with automatic incident markers.
export function buildNotesTimeline(notes: RaceNote[], columns: NotesColumn[], flagEvents: FlagEvent[]): NotesTimelineRow[] {
  const maxNoteHour = notes.length ? Math.max(...notes.map((n) => hourBucket(n.elapsedSeconds))) : 0
  const maxFlagHour = flagEvents.length ? Math.max(...flagEvents.map((f) => hourBucket(f.startElapsedSeconds))) : 0
  const maxHour = Math.max(maxNoteHour, maxFlagHour)
  if (maxHour === 0) return []

  const flagsByHour = new Map<number, FlagEvent[]>()
  for (const event of flagEvents) {
    const hour = hourBucket(event.startElapsedSeconds)
    const arr = flagsByHour.get(hour)
    if (arr) arr.push(event)
    else flagsByHour.set(hour, [event])
  }
  for (const arr of flagsByHour.values()) {
    arr.sort((a, b) => (a.startElapsedSeconds ?? 0) - (b.startElapsedSeconds ?? 0))
  }

  const rows: NotesTimelineRow[] = []
  let lastKnownLeader: NotesHourRow['leader'] = null

  for (let hour = 1; hour <= maxHour; hour++) {
    const inHour = notes
      .filter((n) => hourBucket(n.elapsedSeconds) === hour)
      .sort((a, b) => (a.elapsedSeconds ?? 0) - (b.elapsedSeconds ?? 0))

    const byColumn = new Map<string, RaceNote[]>()
    for (const col of columns) byColumn.set(col.id, [])
    byColumn.set(GENERAL_COLUMN_ID, [])

    for (const note of inHour) {
      const key = byColumn.has(note.columnId) ? note.columnId : GENERAL_COLUMN_ID
      byColumn.get(key)!.push(note)
    }

    if (inHour.length > 0) {
      const last = inHour[inHour.length - 1]
      if (last.overallLeader) lastKnownLeader = last.overallLeader
    }

    rows.push({ type: 'hour', hour, leader: lastKnownLeader, byColumn })

    for (const event of flagsByHour.get(hour) ?? []) {
      rows.push({ type: 'flag', event, label: flagEventLabel(event) })
    }
  }

  return rows
}
