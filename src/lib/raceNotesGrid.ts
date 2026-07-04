import { GENERAL_COLUMN_ID, hourBucket, type RaceNote } from './raceNotes'
import type { NotesColumn } from '../hooks/useNotesColumns'
import type { FlagEvent, RestartEvent } from './flagEvents'
import { FLAG_LABELS } from './flags'
import { formatClock } from '../replay/format'

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

export interface NotesRestartRow {
  type: 'restart'
  event: RestartEvent
  label: string
}

export type NotesTimelineRow = NotesHourRow | NotesFlagRow | NotesRestartRow

function timeSuffix(elapsedSeconds: number, totalDurationSeconds: number | null): string {
  const remaining = totalDurationSeconds != null ? Math.max(0, totalDurationSeconds - elapsedSeconds) : null
  return ` · Elapsed ${formatClock(elapsedSeconds)}${remaining != null ? ` · Remaining ${formatClock(remaining)}` : ''}`
}

export function flagEventLabel(event: FlagEvent, totalDurationSeconds: number | null): string {
  // The closing entry's lap number belongs to whichever car happened to be
  // the source of that race-log row — in a multi-class field it can land on
  // a lower lap count than the caution's own start (a back-marker class),
  // which would otherwise render as a nonsensical descending range like
  // "Laps 116-94". Only show a range when it's actually ascending; fall back
  // to just the start lap otherwise.
  const lapRange =
    event.endLap != null && event.endLap > event.startLap
      ? `Laps ${event.startLap}–${event.endLap}`
      : `Lap ${event.startLap}${event.endLap == null ? ' (ongoing)' : ''}`
  return `${FLAG_LABELS[event.category]} #${event.occurrence} — ${lapRange}${timeSuffix(event.startElapsedSeconds, totalDurationSeconds)}`
}

export function restartEventLabel(event: RestartEvent, totalDurationSeconds: number | null): string {
  return `Restart — Lap ${event.lapNumber}${timeSuffix(event.elapsedSeconds, totalDurationSeconds)}`
}

// One row per race-elapsed hour (1..the latest hour any note/caution/restart
// falls in) with one cell per configured column, plus a full-width row for
// every FCY/safety-car/red-flag period and every restart-to-green, inserted
// right after the hour they occurred in — mirrors the table the user
// described keeping in a Google Doc during races, extended with automatic
// incident markers.
//
// Within an hour, a caution/restart splits that hour's notes into their own
// rows at the exact point they happened — a note written while the session
// is still under caution lands in a row between the caution's start row and
// its restart row, rather than being lumped into one "Hour N" row alongside
// notes from before/after the caution regardless of when exactly they were
// written.
export function buildNotesTimeline(
  notes: RaceNote[],
  columns: NotesColumn[],
  cautions: FlagEvent[],
  restarts: RestartEvent[],
  totalDurationSeconds: number | null,
): NotesTimelineRow[] {
  const maxNoteHour = notes.length ? Math.max(...notes.map((n) => hourBucket(n.elapsedSeconds))) : 0
  const maxCautionHour = cautions.length ? Math.max(...cautions.map((f) => hourBucket(f.startElapsedSeconds))) : 0
  const maxRestartHour = restarts.length ? Math.max(...restarts.map((r) => hourBucket(r.elapsedSeconds))) : 0
  const maxHour = Math.max(maxNoteHour, maxCautionHour, maxRestartHour)
  if (maxHour === 0) return []

  type Marker = { elapsed: number; kind: 'flag'; event: FlagEvent } | { elapsed: number; kind: 'restart'; event: RestartEvent }
  const markersByHour = new Map<number, Marker[]>()
  const pushMarker = (hour: number, marker: Marker) => {
    const arr = markersByHour.get(hour)
    if (arr) arr.push(marker)
    else markersByHour.set(hour, [marker])
  }
  for (const event of cautions) pushMarker(hourBucket(event.startElapsedSeconds), { elapsed: event.startElapsedSeconds, kind: 'flag', event })
  for (const event of restarts) pushMarker(hourBucket(event.elapsedSeconds), { elapsed: event.elapsedSeconds, kind: 'restart', event })
  for (const arr of markersByHour.values()) arr.sort((a, b) => a.elapsed - b.elapsed)

  function byColumnFor(segmentNotes: RaceNote[]): Map<string, RaceNote[]> {
    const byColumn = new Map<string, RaceNote[]>()
    for (const col of columns) byColumn.set(col.id, [])
    byColumn.set(GENERAL_COLUMN_ID, [])
    for (const note of segmentNotes) {
      const key = byColumn.has(note.columnId) ? note.columnId : GENERAL_COLUMN_ID
      byColumn.get(key)!.push(note)
    }
    return byColumn
  }

  const rows: NotesTimelineRow[] = []
  let lastKnownLeader: NotesHourRow['leader'] = null

  for (let hour = 1; hour <= maxHour; hour++) {
    const inHour = notes
      .filter((n) => hourBucket(n.elapsedSeconds) === hour)
      .sort((a, b) => (a.elapsedSeconds ?? 0) - (b.elapsedSeconds ?? 0))
    const markers = markersByHour.get(hour) ?? []

    let noteCursor = 0
    let isFirstSegment = true

    function emitSegment(segmentNotes: RaceNote[]) {
      // Always emit the hour's first segment (even empty) so every hour
      // still gets at least one row — the leader-tracking convention this
      // grid relies on — but skip emitting an empty row between/after
      // markers, since the marker rows themselves already anchor that point
      // in time and a blank row there would just be clutter.
      if (segmentNotes.length === 0 && !isFirstSegment) return
      if (segmentNotes.length > 0) {
        const last = segmentNotes[segmentNotes.length - 1]
        if (last.overallLeader) lastKnownLeader = last.overallLeader
      }
      rows.push({ type: 'hour', hour, leader: lastKnownLeader, byColumn: byColumnFor(segmentNotes) })
      isFirstSegment = false
    }

    for (const marker of markers) {
      const segment: RaceNote[] = []
      while (noteCursor < inHour.length && (inHour[noteCursor].elapsedSeconds ?? 0) < marker.elapsed) {
        segment.push(inHour[noteCursor])
        noteCursor++
      }
      emitSegment(segment)
      if (marker.kind === 'flag') {
        rows.push({ type: 'flag', event: marker.event, label: flagEventLabel(marker.event, totalDurationSeconds) })
      } else {
        rows.push({ type: 'restart', event: marker.event, label: restartEventLabel(marker.event, totalDurationSeconds) })
      }
    }
    emitSegment(inHour.slice(noteCursor))
  }

  return rows
}
