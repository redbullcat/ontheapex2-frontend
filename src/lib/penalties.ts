// Post-session steward decisions (time penalties, drive-throughs,
// disqualification, etc) recorded by hand from the stewards' own document —
// neither the timing feed nor the CSV import has any concept of these.
// Persisted server-side (see app/models/penalty.py) so a penalty logged on
// one device is visible everywhere the session/car appears; this module
// keeps an in-memory read-through cache, same pattern as lapOverrides.ts,
// so the Results table's synchronous per-car lookups don't need to be async.
import { createPenalty as createPenaltyApi, deletePenalty as deletePenaltyApi, getPenalties } from '../api/client'
import type { PenaltyConsequence, PenaltyRead } from '../api/types'

const CHANGE_EVENT = 'ota:penalties-changed'

let cache: PenaltyRead[] = []
const loadedSessions = new Set<number>()
let allLoaded = false

function fireChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function mergeIn(records: PenaltyRead[]) {
  const byId = new Map(cache.map((p) => [p.id, p]))
  for (const r of records) byId.set(r.id, r)
  cache = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

// Populates the cache for one session — call whenever a session is opened
// so per-car penalty lookups (Results table badges) have data to read.
export async function ensurePenaltiesLoaded(sessionId: number): Promise<void> {
  if (loadedSessions.has(sessionId) || allLoaded) return
  loadedSessions.add(sessionId)
  const records = await getPenalties(sessionId)
  mergeIn(records)
  fireChange()
}

// Populates the cache across every session — powers the Settings panel's
// review/undo list, which has no single session in view.
export async function loadAllPenalties(): Promise<void> {
  if (allLoaded) return
  allLoaded = true
  const records = await getPenalties()
  mergeIn(records)
  fireChange()
}

// Every currently-recorded penalty, newest first — powers the Settings
// panel's review list.
export function listPenalties(): PenaltyRead[] {
  return cache
}

// Penalties for one car in one session — powers the Results table badge.
export function penaltiesFor(sessionId: number, carNumber: string): PenaltyRead[] {
  return cache.filter((p) => p.session_id === sessionId && p.car_number === carNumber)
}

export async function addPenalty(payload: {
  session_id: number
  car_number: string
  penalty: string
  reason: string
  stewards_doc_url?: string | null
  consequence?: PenaltyConsequence
  time_penalty_seconds?: number | null
}): Promise<void> {
  const record = await createPenaltyApi(payload)
  cache = [record, ...cache]
  fireChange()
}

export async function removePenalty(penaltyId: number): Promise<void> {
  cache = cache.filter((p) => p.id !== penaltyId)
  fireChange()
  await deletePenaltyApi(penaltyId)
}

export function onPenaltiesChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb)
  return () => window.removeEventListener(CHANGE_EVENT, cb)
}
