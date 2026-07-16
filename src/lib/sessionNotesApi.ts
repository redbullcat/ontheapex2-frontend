import { API_BASE, getSession } from './session'
import type { RaceNote } from './raceNotes'

interface NoteWire {
  id: string
  session_key: string
  text: string
  column_id: string
  author_email: string
  author_name: string
  user_local_timestamp: string
  race_local_timestamp: string | null
  elapsed_seconds: number | null
  remaining_seconds: number | null
  overall_leader: RaceNote['overallLeader']
  class_leaders: RaceNote['classLeaders']
  linked_car: RaceNote['linkedCar']
}

function fromWire(n: NoteWire): RaceNote {
  return {
    id: n.id,
    text: n.text,
    columnId: n.column_id,
    authorEmail: n.author_email,
    authorName: n.author_name,
    userLocalTimestamp: n.user_local_timestamp,
    raceLocalTimestamp: n.race_local_timestamp,
    elapsedSeconds: n.elapsed_seconds,
    remainingSeconds: n.remaining_seconds,
    overallLeader: n.overall_leader,
    classLeaders: n.class_leaders ?? [],
    linkedCar: n.linked_car,
  }
}

// Thrown when the session_key hasn't been shared with the current account
// (or shared with anyone at all beyond its first user) — callers fall back
// to local-only notes rather than surfacing this as a hard error.
export class NotesAccessError extends Error {}

function authHeaders(): Record<string, string> {
  const session = getSession()
  return session ? { Authorization: `Bearer ${session.token}` } : {}
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}/api/session-notes${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  })
  if (res.status === 403) throw new NotesAccessError('This session’s notes haven’t been shared with your account')
  return res
}

export async function fetchNotes(sessionKey: string): Promise<RaceNote[]> {
  const res = await request(`/${sessionKey}`)
  if (!res.ok) throw new Error('Failed to load shared notes')
  const data: NoteWire[] = await res.json()
  return data.map(fromWire)
}

export async function createNoteRemote(sessionKey: string, note: RaceNote): Promise<RaceNote> {
  const res = await request(`/${sessionKey}`, {
    method: 'POST',
    body: JSON.stringify({
      id: note.id,
      text: note.text,
      column_id: note.columnId,
      user_local_timestamp: note.userLocalTimestamp,
      race_local_timestamp: note.raceLocalTimestamp,
      elapsed_seconds: note.elapsedSeconds,
      remaining_seconds: note.remainingSeconds,
      overall_leader: note.overallLeader,
      class_leaders: note.classLeaders,
      linked_car: note.linkedCar,
    }),
  })
  if (!res.ok) throw new Error('Failed to save note')
  return fromWire(await res.json())
}

export async function updateNoteRemote(sessionKey: string, noteId: string, text: string): Promise<RaceNote> {
  const res = await request(`/${sessionKey}/${noteId}`, { method: 'PATCH', body: JSON.stringify({ text }) })
  if (!res.ok) throw new Error('Failed to update note')
  return fromWire(await res.json())
}

export async function deleteNoteRemote(sessionKey: string, noteId: string): Promise<void> {
  const res = await request(`/${sessionKey}/${noteId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete note')
}

export interface ShareEntry {
  email: string
  name: string | null
}

export async function fetchShareList(sessionKey: string): Promise<ShareEntry[]> {
  const res = await request(`/${sessionKey}/share`)
  if (!res.ok) throw new Error('Failed to load share settings')
  return res.json()
}

export async function addShareEmail(sessionKey: string, email: string): Promise<ShareEntry[]> {
  const res = await request(`/${sessionKey}/share`, { method: 'POST', body: JSON.stringify({ email }) })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail ?? 'Failed to share notes')
  }
  return res.json()
}

export async function removeShareEmail(sessionKey: string, email: string): Promise<ShareEntry[]> {
  const res = await request(`/${sessionKey}/share/${encodeURIComponent(email)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to update share settings')
  return res.json()
}

export interface UserSearchResult {
  email: string
  name: string
  role: string
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  if (!query.trim()) return []
  const res = await request(`/users/search?q=${encodeURIComponent(query.trim())}`)
  if (!res.ok) return []
  return res.json()
}

export type NotesSocketMessage =
  | { type: 'note_created'; note: NoteWire }
  | { type: 'note_updated'; note: NoteWire }
  | { type: 'note_deleted'; note_id: string }
  | { type: 'share_updated' }
  | { type: 'typing'; email: string; name: string; column_id: string; editing: boolean }

// Thin reconnecting WebSocket wrapper — reconnects with a fixed short delay
// on drop (a race-notes panel is typically open for hours at a stretch, so
// this needs to survive a laptop sleep/wake or a flaky connection without
// the user having to reload the page).
export class NotesSocket {
  private ws: WebSocket | null = null
  private closedByCaller = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sessionKey: string
  private onMessage: (msg: NotesSocketMessage) => void

  constructor(sessionKey: string, onMessage: (msg: NotesSocketMessage) => void) {
    this.sessionKey = sessionKey
    this.onMessage = onMessage
    this.connect()
  }

  private connect() {
    const session = getSession()
    if (!session) return
    const wsBase = API_BASE.replace(/^http/, 'ws')
    const ws = new WebSocket(`${wsBase}/api/session-notes/${this.sessionKey}/ws?token=${encodeURIComponent(session.token)}`)
    this.ws = ws
    ws.onmessage = (event) => {
      try {
        this.onMessage(JSON.parse(event.data))
      } catch {
        // Malformed frame — ignore rather than crash the socket handler.
      }
    }
    ws.onclose = () => {
      if (this.closedByCaller) return
      this.reconnectTimer = setTimeout(() => this.connect(), 2000)
    }
  }

  sendTyping(columnId: string, editing: boolean) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'typing', column_id: columnId, editing }))
    }
  }

  close() {
    this.closedByCaller = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}
