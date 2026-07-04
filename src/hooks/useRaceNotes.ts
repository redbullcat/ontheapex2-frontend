import { useCallback, useEffect, useState } from 'react'
import type { RaceNote } from '../lib/raceNotes'

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

// Notes live in localStorage only for now, scoped per session — no backend
// persistence yet (planned once the app has accounts), so notes are local
// to this browser and lost if site data is cleared.
export function useRaceNotes(sessionKey: string) {
  const [notes, setNotes] = useState<RaceNote[]>(() => loadNotes(sessionKey))

  // Re-read when the session key changes (e.g. a pop-out window opened for
  // a different session id) rather than carrying over the previous
  // session's notes.
  useEffect(() => {
    setNotes(loadNotes(sessionKey))
  }, [sessionKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(sessionKey), JSON.stringify(notes))
    } catch {
      // Storage full or unavailable (private browsing etc) — notes still
      // work for the rest of this tab's session, just won't persist.
    }
  }, [sessionKey, notes])

  const addNote = useCallback((note: RaceNote) => {
    setNotes((prev) => [...prev, note])
  }, [])

  const removeNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const updateNoteText = useCallback((id: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)))
  }, [])

  return { notes, addNote, removeNote, updateNoteText }
}
