// User-flagged "deleted" laps — a lap the timing CSV still reports as a
// normal lap time, but that a steward's decision has actually excluded
// from classification (a sporting infringement, a track-limits deletion,
// etc). Persisted server-side (see app/models/penalty.py's DeletedLap) so
// a flag made on one device/browser is visible everywhere the session is
// viewed from — this module just keeps an in-memory read-through cache so
// the many synchronous isLapDeleted()/getDeletedLapOverride() call sites
// (SessionResultsTable, FastestLapsTable, the starting grid,
// LapPositionChart's 'bestLapSoFar' ranking) don't all need to become async.
//
// Deliberately doesn't remove or hide the lap itself: it still appears
// wherever raw laps are shown (lap charts, sector analysis, etc) — only
// the handful of places that compute a "fastest lap" classification skip it,
// exactly mirroring what a real deletion does: the lap happened, but it
// doesn't count.
import { flagDeletedLap, getDeletedLaps as fetchDeletedLaps, restoreDeletedLap } from '../api/client'
import type { DeletedLapRead } from '../api/types'

export interface DeletedLapOverride {
  id: number
  reason: string
  deletedAt: string
}

const CHANGE_EVENT = 'ota:deleted-laps-changed'

function lapKey(sessionId: number, carNumber: string, lapNumber: number): string {
  return `${sessionId}:${carNumber}:${lapNumber}`
}

let cache: Record<string, DeletedLapOverride> = {}
// Sessions already fetched from the backend, so switching back to a
// session already viewed this visit doesn't refetch every render.
const loadedSessions = new Set<number>()
let allLoaded = false

function fireChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function mergeIn(records: DeletedLapRead[]) {
  for (const r of records) {
    cache[lapKey(r.session_id, r.car_number, r.lap_number)] = { id: r.id, reason: r.reason, deletedAt: r.deleted_at }
  }
}

// Populates the cache for one session — call whenever a session's laps are
// loaded so isLapDeleted/getDeletedLapOverride have data to read for it.
export async function ensureDeletedLapsLoaded(sessionId: number): Promise<void> {
  if (loadedSessions.has(sessionId) || allLoaded) return
  loadedSessions.add(sessionId)
  const records = await fetchDeletedLaps(sessionId)
  mergeIn(records)
  fireChange()
}

// Populates the cache across every session — powers the Settings panel's
// review/undo list, which has no single session in view.
export async function loadAllDeletedLaps(): Promise<void> {
  if (allLoaded) return
  allLoaded = true
  const records = await fetchDeletedLaps()
  mergeIn(records)
  fireChange()
}

export function getDeletedLaps(): Record<string, DeletedLapOverride> {
  return cache
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
  return Object.entries(cache)
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
  return cache[lapKey(sessionId, carNumber, lapNumber)] ?? null
}

export function isLapDeleted(sessionId: number | null | undefined, carNumber: string, lapNumber: number): boolean {
  return getDeletedLapOverride(sessionId, carNumber, lapNumber) !== null
}

export async function setLapDeleted(sessionId: number, carNumber: string, lapNumber: number, reason: string): Promise<void> {
  const record = await flagDeletedLap({ session_id: sessionId, car_number: carNumber, lap_number: lapNumber, reason })
  cache[lapKey(sessionId, carNumber, lapNumber)] = { id: record.id, reason: record.reason, deletedAt: record.deleted_at }
  fireChange()
}

export async function clearLapDeleted(sessionId: number, carNumber: string, lapNumber: number): Promise<void> {
  const key = lapKey(sessionId, carNumber, lapNumber)
  const existing = cache[key]
  if (!existing) return
  delete cache[key]
  fireChange()
  await restoreDeletedLap(existing.id)
}

export function onDeletedLapsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}
