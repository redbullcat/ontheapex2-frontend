import { useCallback, useEffect, useRef, useState } from 'react'
import type { RaceNote } from '../lib/raceNotes'
import { getSession, onSessionChanged } from '../lib/session'
import {
  NotesAccessError,
  NotesSocket,
  createNoteRemote,
  deleteNoteRemote,
  fetchNotes,
  updateNoteRemote,
  type NotesSocketMessage,
} from '../lib/sessionNotesApi'

function storageKey(sessionKey: string): string {
  return `race-notes:${sessionKey}`
}

function loadNotes(sessionKey: string): RaceNote[] {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionKey))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function upsert(notes: RaceNote[], note: RaceNote): RaceNote[] {
  const idx = notes.findIndex((n) => n.id === note.id)
  if (idx === -1) return [...notes, note]
  const next = notes.slice()
  next[idx] = note
  return next
}

export interface TypingUser {
  email: string
  name: string
  columnId: string
}

const TEXT_SYNC_DEBOUNCE_MS = 500
// How long a typing indicator stays visible after the last ping — a
// stopped-typing ping (editing:false) clears it immediately, this is just
// the fallback for a dropped connection/closed tab that never gets to send
// one.
const TYPING_TIMEOUT_MS = 5000

// Notes are local-only (localStorage, this browser only) unless the viewer
// is logged in AND this session_key has been shared with their account —
// see app/notes/hub.py and the session-notes endpoints on the backend for
// the real-time sync/sharing this upgrades to. Falls back to local-only
// silently (no error shown) if the backend is unreachable or this
// session_key isn't shared with the current account, so notes always work
// even for the many viewers who'll never have an account at all.
export function useRaceNotes(sessionKey: string) {
  const [notes, setNotes] = useState<RaceNote[]>(() => loadNotes(sessionKey))
  const [mode, setMode] = useState<'local' | 'synced'>('local')
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])

  const socketRef = useRef<NotesSocket | null>(null)
  const pendingSyncRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    setNotes(loadNotes(sessionKey))
    setMode('local')
    setTypingUsers([])
  }, [sessionKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(sessionKey), JSON.stringify(notes))
    } catch {
      // Storage full or unavailable (private browsing etc) — notes still
      // work for the rest of this tab's session, just won't persist.
    }
  }, [sessionKey, notes])

  const connect = useCallback(() => {
    if (!getSession()) {
      setMode('local')
      return
    }
    fetchNotes(sessionKey)
      .then((remoteNotes) => {
        setNotes(remoteNotes)
        setMode('synced')
        socketRef.current?.close()
        socketRef.current = new NotesSocket(sessionKey, (msg: NotesSocketMessage) => {
          if (msg.type === 'note_created' || msg.type === 'note_updated') {
            const note = msg.note
            setNotes((prev) =>
              upsert(prev, {
                id: note.id,
                text: note.text,
                columnId: note.column_id,
                authorEmail: note.author_email,
                authorName: note.author_name,
                userLocalTimestamp: note.user_local_timestamp,
                raceLocalTimestamp: note.race_local_timestamp,
                elapsedSeconds: note.elapsed_seconds,
                remainingSeconds: note.remaining_seconds,
                overallLeader: note.overall_leader,
                classLeaders: note.class_leaders ?? [],
                linkedCar: note.linked_car,
              }),
            )
          } else if (msg.type === 'note_deleted') {
            setNotes((prev) => prev.filter((n) => n.id !== msg.note_id))
          } else if (msg.type === 'typing') {
            const key = msg.email
            const existingTimer = typingTimersRef.current.get(key)
            if (existingTimer) clearTimeout(existingTimer)
            if (msg.editing) {
              setTypingUsers((prev) => [
                ...prev.filter((u) => u.email !== key),
                { email: msg.email, name: msg.name, columnId: msg.column_id },
              ])
              typingTimersRef.current.set(
                key,
                setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u.email !== key)), TYPING_TIMEOUT_MS),
              )
            } else {
              typingTimersRef.current.delete(key)
              setTypingUsers((prev) => prev.filter((u) => u.email !== key))
            }
          }
        })
      })
      .catch((err) => {
        if (!(err instanceof NotesAccessError)) {
          // Any other failure (network, backend down) — fall back to
          // whatever's already in localStorage rather than blocking on it.
        }
        setMode('local')
      })
  }, [sessionKey])

  useEffect(() => {
    connect()
    const unsubscribe = onSessionChanged(connect)
    return () => {
      unsubscribe()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [connect])

  const addNote = useCallback(
    (note: RaceNote) => {
      setNotes((prev) => [...prev, note])
      if (mode === 'synced') {
        createNoteRemote(sessionKey, note).catch(() => {
          // Optimistic add stays in local state either way — it'll still
          // get persisted to localStorage, just won't have made it to
          // anyone else viewing this session.
        })
      }
    },
    [mode, sessionKey],
  )

  const removeNote = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id))
      if (mode === 'synced') {
        deleteNoteRemote(sessionKey, id).catch(() => {})
      }
    },
    [mode, sessionKey],
  )

  const updateNoteText = useCallback(
    (id: string, text: string) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)))
      if (mode === 'synced') {
        const timers = pendingSyncRef.current
        const existing = timers.get(id)
        if (existing) clearTimeout(existing)
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id)
            updateNoteRemote(sessionKey, id, text).catch(() => {})
          }, TEXT_SYNC_DEBOUNCE_MS),
        )
      }
    },
    [mode, sessionKey],
  )

  const sendTyping = useCallback((columnId: string, editing: boolean) => {
    socketRef.current?.sendTyping(columnId, editing)
  }, [])

  return { notes, addNote, removeNote, updateNoteText, mode, typingUsers, sendTyping }
}
