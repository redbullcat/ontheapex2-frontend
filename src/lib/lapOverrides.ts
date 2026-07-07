// User-flagged "deleted" laps — a lap the timing CSV still reports as a
// normal lap time, but that a steward's decision has actually excluded
// from classification (a sporting infringement, a track-limits deletion,
// etc). The backend/timing feed has no concept of this, so it's tracked
// entirely client-side and persisted to localStorage, keyed by exactly
// which lap (session + car + lap number) — same pattern as
// identityOverrides.ts's team color/name overrides.
//
// Deliberately doesn't remove or hide the lap itself: it still appears
// wherever raw laps are shown (lap charts, sector analysis, etc) — only
// the handful of places that compute a "fastest lap" classification
// (SessionResultsTable, FastestLapsTable, the starting grid, LapPositionChart's
// 'bestLapSoFar' ranking) skip it, exactly mirroring what a real deletion
// does: the lap happened, but it doesn't count.
export interface DeletedLapOverride {
  reason: string
  deletedAt: string
}

const STORAGE_KEY = 'ota:deletedLaps'
const CHANGE_EVENT = 'ota:deleted-laps-changed'

function lapKey(sessionId: number, carNumber: string, lapNumber: number): string {
  return `${sessionId}:${carNumber}:${lapNumber}`
}

let cache: Record<string, DeletedLapOverride> | null = null

function readFromStorage(): Record<string, DeletedLapOverride> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function getCache(): Record<string, DeletedLapOverride> {
  if (!cache) cache = readFromStorage()
  return cache
}

function writeToStorage(overrides: Record<string, DeletedLapOverride>) {
  cache = overrides
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getDeletedLaps(): Record<string, DeletedLapOverride> {
  return getCache()
}

export interface DeletedLapEntry extends DeletedLapOverride {
  sessionId: number
  carNumber: string
  lapNumber: number
}

// Every currently-flagged lap, across every session — powers the Settings
// panel's review/undo list, since there's otherwise no single screen a
// flag made from a Results table is visible again from.
export function listDeletedLaps(): DeletedLapEntry[] {
  return Object.entries(getCache())
    .map(([key, override]) => {
      const [sessionId, carNumber, lapNumber] = key.split(':')
      return { sessionId: Number(sessionId), carNumber, lapNumber: Number(lapNumber), ...override }
    })
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

export function getDeletedLapOverride(
  sessionId: number | null | undefined,
  carNumber: string,
  lapNumber: number,
): DeletedLapOverride | null {
  if (sessionId == null) return null
  return getCache()[lapKey(sessionId, carNumber, lapNumber)] ?? null
}

export function isLapDeleted(sessionId: number | null | undefined, carNumber: string, lapNumber: number): boolean {
  return getDeletedLapOverride(sessionId, carNumber, lapNumber) !== null
}

export function setLapDeleted(sessionId: number, carNumber: string, lapNumber: number, reason: string) {
  const all = { ...getCache() }
  all[lapKey(sessionId, carNumber, lapNumber)] = { reason, deletedAt: new Date().toISOString() }
  writeToStorage(all)
}

export function clearLapDeleted(sessionId: number, carNumber: string, lapNumber: number) {
  const all = { ...getCache() }
  delete all[lapKey(sessionId, carNumber, lapNumber)]
  writeToStorage(all)
}

export function onDeletedLapsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}
