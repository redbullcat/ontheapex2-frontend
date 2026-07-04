import { useCallback, useEffect, useState } from 'react'

export interface NotesColumn {
  id: string
  label: string
}

function storageKey(sessionKey: string): string {
  return `race-notes-columns:${sessionKey}`
}

function defaultColumns(defaultClasses: string[]): NotesColumn[] {
  return defaultClasses.map((cls) => ({ id: cls, label: cls }))
}

function loadColumns(sessionKey: string, defaultClasses: string[]): NotesColumn[] {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionKey))
    if (!raw) return defaultColumns(defaultClasses)
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultColumns(defaultClasses)
  } catch {
    return defaultColumns(defaultClasses)
  }
}

// The race-notes grid's columns — one per class by default (matching the
// Google Doc layout this feature replaces), but freely add/rename/remove
// from there. Persisted separately from the notes themselves so editing
// columns never touches note data, and scoped per session like notes are.
export function useNotesColumns(sessionKey: string, defaultClasses: string[]) {
  const [columns, setColumns] = useState<NotesColumn[]>(() => loadColumns(sessionKey, defaultClasses))

  useEffect(() => {
    setColumns(loadColumns(sessionKey, defaultClasses))
    // Only re-seed from defaults when the session itself changes, not every
    // time the field's class list re-renders with a new array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(sessionKey), JSON.stringify(columns))
    } catch {
      // Storage full/unavailable — columns still work for this tab session.
    }
  }, [sessionKey, columns])

  const addColumn = useCallback((label: string) => {
    const id = `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setColumns((prev) => [...prev, { id, label }])
  }, [])

  const removeColumn = useCallback((id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const renameColumn = useCallback((id: string, label: string) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)))
  }, [])

  return { columns, addColumn, removeColumn, renameColumn }
}
