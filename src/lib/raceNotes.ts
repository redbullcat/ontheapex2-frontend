import { computeFieldStateAtMoment } from './fieldStateAtMoment'

interface LapLike {
  car_number: string
  lap_number: number
  elapsed_seconds: number | null
  class: string | null
  team: string | null
  driver_name: string | null
}

// Raised by a chart (see LapPositionChart/ReplayTrendChart's "+ Note"
// tooltip button) to ask the race-notes panel to start a new note prefilled
// from a specific point the user clicked on — a lap, for a specific car,
// possibly well in the past relative to "now" (Replay scrubbed back, or a
// past lap on a still-running Live session).
export interface PendingNoteLink {
  carNumber: string
  lapNumber: number
  elapsedSeconds: number | null
}

export interface ClassLeaderSnapshot {
  cls: string
  carNumber: string
  driverName: string | null
}

export interface LinkedCarSnapshot {
  carNumber: string
  team: string | null
  driverName: string | null
  lapNumber: number
  position: number
  classPosition: number
  cls: string | null
  totalCars: number
  totalInClass: number
}

// The one column that always exists and can't be removed — where a note
// lands when it isn't assigned to one of the user's configured columns
// (see hooks/useNotesColumns).
export const GENERAL_COLUMN_ID = 'general'

export interface RaceNote {
  id: string
  text: string
  // Which grid column this note was filed under — defaults to matching the
  // linked car's class if a column with that id exists, else GENERAL_COLUMN_ID.
  columnId: string
  // When the note was actually typed, in the note-taker's own timezone —
  // "my local timestamp" from the spec this was built from.
  userLocalTimestamp: string
  // The real-world wall-clock time the moment itself happened at the
  // circuit — distinct from userLocalTimestamp above, since a note can be
  // written well after the fact (Replay) or slightly behind a viewer's own
  // stream delay (Live). Null when no wall-clock source is available for
  // that moment (caller-supplied — see createRaceNote's raceLocalTimestamp
  // param for how each view derives it).
  raceLocalTimestamp: string | null
  elapsedSeconds: number | null
  remainingSeconds: number | null
  overallLeader: { carNumber: string; driverName: string | null } | null
  classLeaders: ClassLeaderSnapshot[]
  linkedCar: LinkedCarSnapshot | null
}

// Builds the full auto-captured context for a note at a given moment —
// "now" if elapsedCutoff is null (the panel's own +Add note button), or a
// specific past instant if the note was requested from a chart click
// (PendingNoteLink's elapsedSeconds). Race duration isn't known in
// laps/elapsed_seconds terms alone, so `remainingSeconds` is passed in
// separately by the caller (Replay derives it from data.maxTime, Live from
// its own session clock).
export function captureRaceNoteContext(
  laps: LapLike[],
  elapsedCutoff: number | null,
  linkedCarNumber?: string | null,
): { overallLeader: RaceNote['overallLeader']; classLeaders: ClassLeaderSnapshot[]; linkedCar: LinkedCarSnapshot | null } {
  const field = computeFieldStateAtMoment(laps, elapsedCutoff)

  const overallRow = field.find((r) => r.position === 1) ?? null
  const overallLeader = overallRow ? { carNumber: overallRow.car_number, driverName: overallRow.driver_name } : null

  const classLeaders: ClassLeaderSnapshot[] = field
    .filter((r) => r.classPosition === 1)
    .map((r) => ({ cls: r.class ?? 'Unknown', carNumber: r.car_number, driverName: r.driver_name }))
    .sort((a, b) => a.cls.localeCompare(b.cls))

  let linkedCar: LinkedCarSnapshot | null = null
  if (linkedCarNumber) {
    const row = field.find((r) => r.car_number === linkedCarNumber)
    if (row) {
      linkedCar = {
        carNumber: row.car_number,
        team: row.team,
        driverName: row.driver_name,
        lapNumber: row.lapNumber,
        position: row.position,
        classPosition: row.classPosition,
        cls: row.class,
        totalCars: row.totalCars,
        totalInClass: row.totalInClass,
      }
    }
  }

  return { overallLeader, classLeaders, linkedCar }
}

export function createRaceNote(params: {
  text: string
  laps: LapLike[]
  elapsedCutoff: number | null
  linkedCarNumber?: string | null
  elapsedSeconds: number | null
  remainingSeconds: number | null
  // The circuit's own wall-clock time at this moment — Live derives this
  // from Date.now() adjusted for the viewer's stream delay and how long ago
  // a linked lap happened; Replay derives it from the linked lap's own
  // `hour` field (LapRead's recorded real-world timestamp), since a replay
  // session isn't happening in real time at all.
  raceLocalTimestamp: string | null
  columnId: string
}): RaceNote {
  const { overallLeader, classLeaders, linkedCar } = captureRaceNoteContext(params.laps, params.elapsedCutoff, params.linkedCarNumber)
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: params.text,
    columnId: params.columnId,
    userLocalTimestamp: new Date().toISOString(),
    raceLocalTimestamp: params.raceLocalTimestamp,
    elapsedSeconds: params.elapsedSeconds,
    remainingSeconds: params.remainingSeconds,
    overallLeader,
    classLeaders,
    linkedCar,
  }
}

// Race-elapsed hour bucket, 1-indexed to match how sessions are already
// titled around here (e.g. "Spa Race Hour 6") — hour 1 covers elapsed
// seconds [0, 3600), hour 2 covers [3600, 7200), etc.
export function hourBucket(elapsedSeconds: number | null): number {
  if (elapsedSeconds == null || elapsedSeconds < 0) return 1
  return Math.floor(elapsedSeconds / 3600) + 1
}
