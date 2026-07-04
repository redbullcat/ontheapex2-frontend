import { hourBucket, type RaceNote } from './raceNotes'

export interface NotesGridRow {
  hour: number
  // The overall leader as of the last note logged in this hour, carried
  // forward from the previous hour if this hour has no notes of its own —
  // same "leader-tracking column filled in every row regardless of
  // whether anything happened" idea as the Google Doc this replaces.
  leader: { carNumber: string; driverName: string | null } | null
  byClass: Map<string, RaceNote[]>
  general: RaceNote[]
}

// One row per race-elapsed hour (1..the latest hour any note falls in),
// one column per class plus a "General" bucket for notes with no linked
// car — mirrors the table the user described keeping in a Google Doc
// during races (one column per class, a leader column, one row per hour).
export function buildNotesGrid(notes: RaceNote[], classes: string[]): NotesGridRow[] {
  if (notes.length === 0) return []
  const maxHour = Math.max(...notes.map((n) => hourBucket(n.elapsedSeconds)))
  const rows: NotesGridRow[] = []
  let lastKnownLeader: NotesGridRow['leader'] = null

  for (let hour = 1; hour <= maxHour; hour++) {
    const inHour = notes
      .filter((n) => hourBucket(n.elapsedSeconds) === hour)
      .sort((a, b) => (a.elapsedSeconds ?? 0) - (b.elapsedSeconds ?? 0))

    const byClass = new Map<string, RaceNote[]>()
    for (const cls of classes) byClass.set(cls, [])
    const general: RaceNote[] = []

    for (const note of inHour) {
      const cls = note.linkedCar?.cls
      if (cls) {
        if (!byClass.has(cls)) byClass.set(cls, [])
        byClass.get(cls)!.push(note)
      } else {
        general.push(note)
      }
    }

    if (inHour.length > 0) {
      const last = inHour[inHour.length - 1]
      if (last.overallLeader) lastKnownLeader = last.overallLeader
    }

    rows.push({ hour, leader: lastKnownLeader, byClass, general })
  }

  return rows
}
