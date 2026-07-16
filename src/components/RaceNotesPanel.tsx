import { useEffect, useMemo, useState } from 'react'
import { useRaceNotes } from '../hooks/useRaceNotes'
import { useNotesColumns } from '../hooks/useNotesColumns'
import { createRaceNote, hourBucket, GENERAL_COLUMN_ID, type PendingNoteLink, type RaceNote } from '../lib/raceNotes'
import { buildNotesTimeline } from '../lib/raceNotesGrid'
import { computeFlagTimeline } from '../lib/flagEvents'
import { downloadRaceNotesHtml, downloadRaceNotesMarkdown } from '../lib/raceNotesExport'
import { formatClock } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'
import { buildCarReferenceOptions } from '../lib/carReference'
import { SlashReferenceTextarea } from './SlashReferenceTextarea'
import { NotesShareSettings } from './NotesShareSettings'
import { getSession } from '../lib/session'
import type { RaceLogEntry } from '../api/types'
import type { TypingUser } from '../hooks/useRaceNotes'

interface LapLike {
  car_number: string
  lap_number: number
  elapsed_seconds: number | null
  class: string | null
  team: string | null
  driver_name: string | null
  flag_at_fl: string | null
  lap_time_seconds?: number | null
  is_valid?: boolean
}

export interface CarOption {
  id: string
  label: string
}

function leaderText(leader: { carNumber: string; driverName: string | null } | null): string {
  if (!leader) return '—'
  return `#${leader.carNumber}${leader.driverName ? ` (${leader.driverName})` : ''}`
}

function NoteItem({
  note,
  laps,
  isRaceSession,
  onSaveText,
  onRequestDelete,
  onTyping,
}: {
  note: RaceNote
  laps: LapLike[]
  isRaceSession: boolean
  onSaveText: (text: string) => void
  onRequestDelete: () => void
  onTyping: (editing: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)

  // Referencing another car while editing uses the field as it stood at
  // this note's own moment, not "now" — editing an old note should still
  // reflect the positions it actually happened at.
  const carRefOptions = useMemo(
    () => buildCarReferenceOptions(laps, note.elapsedSeconds, isRaceSession),
    [laps, note.elapsedSeconds, isRaceSession],
  )

  function startEdit() {
    setDraft(note.text)
    setEditing(true)
  }

  function save() {
    const trimmed = draft.trim()
    if (trimmed) onSaveText(trimmed)
    setEditing(false)
    onTyping(false)
  }

  return (
    <div className="race-note-item">
      <div className="race-note-item-meta">
        <span>{note.elapsedSeconds != null ? formatClock(note.elapsedSeconds) : '—'}</span>
        {note.authorName && (
          <span className="race-note-author" title={note.authorEmail}>
            {note.authorName}
          </span>
        )}
        {note.linkedCar && (
          <span>
            #{note.linkedCar.carNumber} {getTeamDisplayName(note.linkedCar.team)} · L{note.linkedCar.lapNumber} · P
            {note.linkedCar.classPosition}/{note.linkedCar.totalInClass} (class), P{note.linkedCar.position}/{note.linkedCar.totalCars}{' '}
            (overall)
            {note.linkedCar.driverName ? ` · ${note.linkedCar.driverName}` : ''}
          </span>
        )}
        {note.raceLocalTimestamp && <span title="Race's own local time">{new Date(note.raceLocalTimestamp).toLocaleTimeString()}</span>}
        {!editing && (
          <button type="button" className="race-note-edit" onClick={startEdit} title="Edit note">
            ✎
          </button>
        )}
        <button type="button" className="race-note-delete" onClick={onRequestDelete} title="Delete note">
          ✕
        </button>
      </div>
      {editing ? (
        <div className="race-note-edit-form">
          <SlashReferenceTextarea
            className="race-notes-textarea"
            value={draft}
            onChange={(v) => {
              setDraft(v)
              onTyping(true)
            }}
            options={carRefOptions}
            rows={2}
            autoFocus
            onKeyDownCapture={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              if (e.key === 'Escape') {
                setEditing(false)
                onTyping(false)
              }
            }}
          />
          <div className="race-note-edit-actions">
            <button type="button" className="replay-btn" onClick={save} disabled={!draft.trim()}>
              Save
            </button>
            <button
              type="button"
              className="replay-btn"
              onClick={() => {
                setEditing(false)
                onTyping(false)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="race-note-text">{note.text}</div>
      )}
    </div>
  )
}

function typingLabel(users: TypingUser[]): string | null {
  if (users.length === 0) return null
  const names = users.map((u) => u.name)
  if (names.length === 1) return `${names[0]} is typing…`
  return `${names.join(', ')} are typing…`
}

export function RaceNotesPanel({
  sessionKey,
  title,
  laps,
  classes,
  raceLog,
  currentElapsedSeconds,
  currentRemainingSeconds,
  carOptions,
  pendingLink,
  onConsumeLink,
  getRaceLocalTimestamp,
  isRaceSession,
}: {
  sessionKey: string
  title: string
  laps: LapLike[]
  classes: string[]
  // Raw for Live (`data.race_log`), synthesized from lap flag data for
  // Replay (see replay/raceLogSynth.ts) — the authoritative chronological
  // source for flag-period/restart detection (see lib/flagEvents.ts for why
  // this replaced grouping laps by lap_number).
  raceLog: RaceLogEntry[]
  currentElapsedSeconds: number | null
  currentRemainingSeconds: number | null
  carOptions: CarOption[]
  pendingLink: PendingNoteLink | null
  onConsumeLink: () => void
  // The circuit's own wall-clock time at a given elapsed moment — Live
  // derives this from Date.now() adjusted for stream delay, Replay from
  // the nearest lap's recorded `hour` field. Null (rather than omitted)
  // when the caller has no such source at all.
  getRaceLocalTimestamp: (elapsedSeconds: number | null) => string | null
  // Qualifying/practice sessions rank the auto-captured position snapshot by
  // best lap time instead of race progress — see
  // lib/fieldStateAtMoment.ts's own comment for why lap-count/elapsed-time
  // ranking produces nonsense positions outside of an actual race.
  isRaceSession: boolean
}) {
  const { notes, addNote, removeNote, updateNoteText, mode, typingUsers, sendTyping } = useRaceNotes(sessionKey)
  const { columns, addColumn, removeColumn, renameColumn } = useNotesColumns(sessionKey, classes)
  const [text, setText] = useState('')
  const [manualCar, setManualCar] = useState('')
  const [columnId, setColumnId] = useState(GENERAL_COLUMN_ID)
  const [newColumnName, setNewColumnName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [showShareSettings, setShowShareSettings] = useState(false)
  const isLoggedIn = getSession() != null

  const totalDuration =
    currentElapsedSeconds != null && currentRemainingSeconds != null ? currentElapsedSeconds + currentRemainingSeconds : null

  const { cautions, restarts } = useMemo(() => computeFlagTimeline(raceLog), [raceLog])

  const addElapsedCutoff = pendingLink ? pendingLink.elapsedSeconds : currentElapsedSeconds
  const addCarRefOptions = useMemo(
    () => buildCarReferenceOptions(laps, addElapsedCutoff, isRaceSession),
    [laps, addElapsedCutoff, isRaceSession],
  )

  // Suggest a column whenever the linked/selected car changes — matching a
  // column whose label is that car's class, falling back to General. Left
  // freely overridable afterwards via the select below.
  useEffect(() => {
    const carNumber = pendingLink?.carNumber || manualCar
    if (!carNumber) {
      setColumnId(GENERAL_COLUMN_ID)
      return
    }
    const cls = laps.find((l) => l.car_number === carNumber)?.class
    const match = cls && columns.find((c) => c.label.toLowerCase() === cls.toLowerCase())
    setColumnId(match ? match.id : GENERAL_COLUMN_ID)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLink, manualCar])

  function handleAdd() {
    if (!text.trim()) return
    const elapsedCutoff = pendingLink ? pendingLink.elapsedSeconds : currentElapsedSeconds
    const linkedCarNumber = pendingLink ? pendingLink.carNumber : manualCar || null
    const elapsedSeconds = pendingLink ? pendingLink.elapsedSeconds : currentElapsedSeconds
    const remainingSeconds =
      elapsedSeconds != null && totalDuration != null ? Math.max(0, totalDuration - elapsedSeconds) : currentRemainingSeconds

    addNote(
      createRaceNote({
        text: text.trim(),
        laps,
        elapsedCutoff,
        linkedCarNumber,
        elapsedSeconds,
        remainingSeconds,
        raceLocalTimestamp: getRaceLocalTimestamp(elapsedSeconds),
        columnId,
        isRaceSession,
      }),
    )
    setText('')
    setManualCar('')
    sendTyping(columnId, false)
    if (pendingLink) onConsumeLink()
  }

  function handleAddColumn() {
    const name = newColumnName.trim()
    if (!name) return
    addColumn(name)
    setNewColumnName('')
  }

  const timeline = buildNotesTimeline(notes, columns, cautions, restarts, totalDuration)
  const columnCount = columns.length + 1

  return (
    <div className="race-notes-panel">
      <div className="race-notes-columns-manage">
        <span className="race-notes-columns-label">Columns:</span>
        {columns.map((col) => (
          <span className="race-notes-column-chip" key={col.id}>
            <input
              className="race-notes-column-rename"
              value={col.label}
              onChange={(e) => renameColumn(col.id, e.target.value)}
              size={Math.max(3, col.label.length)}
            />
            <button type="button" onClick={() => removeColumn(col.id)} title="Remove column">
              ✕
            </button>
          </span>
        ))}
        <input
          className="race-notes-column-add-input"
          placeholder="+ Add column"
          value={newColumnName}
          onChange={(e) => setNewColumnName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddColumn()
          }}
        />
        <button type="button" className="replay-btn" onClick={handleAddColumn} disabled={!newColumnName.trim()}>
          Add
        </button>
        {isLoggedIn && (
          <button type="button" className="replay-btn race-notes-share-btn" onClick={() => setShowShareSettings(true)}>
            {mode === 'synced' ? 'Shared' : 'Share'}
          </button>
        )}
      </div>

      {typingLabel(typingUsers) && <p className="race-notes-typing-indicator">{typingLabel(typingUsers)}</p>}

      {showShareSettings && (
        <NotesShareSettings sessionKey={sessionKey} onClose={() => setShowShareSettings(false)} />
      )}

      <div className="race-notes-add">
        {pendingLink ? (
          <div className="race-notes-linked-banner">
            <span>
              Linked: <strong>#{pendingLink.carNumber}</strong> · Lap {pendingLink.lapNumber}
              {pendingLink.elapsedSeconds != null && ` · Hour ${hourBucket(pendingLink.elapsedSeconds)} · ${formatClock(pendingLink.elapsedSeconds)}`}
            </span>
            <button type="button" className="replay-btn" onClick={onConsumeLink}>
              Clear link
            </button>
          </div>
        ) : (
          <select className="dashboard-add-select" value={manualCar} onChange={(e) => setManualCar(e.target.value)}>
            <option value="">General note (no car)</option>
            {carOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <select className="dashboard-add-select" value={columnId} onChange={(e) => setColumnId(e.target.value)}>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value={GENERAL_COLUMN_ID}>General</option>
        </select>
        <SlashReferenceTextarea
          className="race-notes-textarea"
          placeholder="What's happening… e.g. left rear puncture at turn 3, trundles back round to the pits. Type / to reference another car."
          value={text}
          onChange={(v) => {
            setText(v)
            sendTyping(columnId, v.length > 0)
          }}
          options={addCarRefOptions}
          rows={2}
          onKeyDownCapture={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd()
          }}
        />
        <button type="button" className="replay-btn" onClick={handleAdd} disabled={!text.trim()}>
          Add note
        </button>
      </div>

      {timeline.length === 0 ? (
        <p className="replay-hint">
          No notes yet — write one above, or click a point on a lap chart's tooltip to link a note to that exact moment.
        </p>
      ) : (
        <div className="race-notes-grid-wrap">
          <table className="race-notes-grid">
            <thead>
              <tr>
                <th>Hour</th>
                <th>Leader</th>
                {columns.map((col) => (
                  <th key={col.id}>{col.label}</th>
                ))}
                <th>General</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((row) =>
                row.type === 'flag' ? (
                  <tr className="race-notes-flag-row" key={row.key}>
                    <td colSpan={columnCount + 2}>{row.label}</td>
                  </tr>
                ) : row.type === 'restart' ? (
                  <tr className="race-notes-restart-row" key={row.key}>
                    <td colSpan={columnCount + 2}>{row.label}</td>
                  </tr>
                ) : (
                  <tr key={row.key}>
                    <td className="race-notes-hour">{row.hour}</td>
                    <td className="race-notes-leader">{leaderText(row.leader)}</td>
                    {columns.map((col) => (
                      <td key={col.id}>
                        {(row.byColumn.get(col.id) ?? []).map((note) => (
                          <NoteItem
                            key={note.id}
                            note={note}
                            laps={laps}
                            isRaceSession={isRaceSession}
                            onSaveText={(newText) => updateNoteText(note.id, newText)}
                            onRequestDelete={() => setPendingDeleteId(note.id)}
                            onTyping={(editing) => sendTyping(note.columnId, editing)}
                          />
                        ))}
                      </td>
                    ))}
                    <td>
                      {(row.byColumn.get(GENERAL_COLUMN_ID) ?? []).map((note) => (
                        <NoteItem
                          key={note.id}
                          note={note}
                          laps={laps}
                          isRaceSession={isRaceSession}
                          onSaveText={(newText) => updateNoteText(note.id, newText)}
                          onRequestDelete={() => setPendingDeleteId(note.id)}
                          onTyping={(editing) => sendTyping(note.columnId, editing)}
                        />
                      ))}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="race-notes-export">
        <button
          type="button"
          className="replay-btn"
          onClick={() => downloadRaceNotesMarkdown(notes, columns, cautions, restarts, totalDuration, title)}
          disabled={notes.length === 0}
        >
          Export Markdown
        </button>
        <button
          type="button"
          className="replay-btn"
          onClick={() => downloadRaceNotesHtml(notes, columns, cautions, restarts, totalDuration, title)}
          disabled={notes.length === 0}
        >
          Export HTML
        </button>
      </div>

      {pendingDeleteId && (
        <div className="race-notes-delete-confirm-backdrop" onClick={() => setPendingDeleteId(null)}>
          <div className="race-notes-delete-confirm" onClick={(e) => e.stopPropagation()}>
            <p>Are you sure you want to delete this note?</p>
            <div className="race-notes-delete-confirm-actions">
              <button
                type="button"
                className="replay-btn race-notes-delete-confirm-danger"
                onClick={() => {
                  removeNote(pendingDeleteId)
                  setPendingDeleteId(null)
                }}
              >
                Delete
              </button>
              <button type="button" className="replay-btn" onClick={() => setPendingDeleteId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
