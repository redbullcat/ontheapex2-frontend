import { useEffect, useMemo, useState } from 'react'
import { useRaceNotes } from '../hooks/useRaceNotes'
import { useNotesColumns } from '../hooks/useNotesColumns'
import { createRaceNote, hourBucket, GENERAL_COLUMN_ID, type PendingNoteLink, type RaceNote } from '../lib/raceNotes'
import { buildNotesTimeline } from '../lib/raceNotesGrid'
import { computeFlagEvents } from '../lib/flagEvents'
import { downloadRaceNotesHtml, downloadRaceNotesMarkdown } from '../lib/raceNotesExport'
import { formatClock } from '../replay/format'
import { getTeamDisplayName } from '../lib/identityColors'

interface LapLike {
  car_number: string
  lap_number: number
  elapsed_seconds: number | null
  class: string | null
  team: string | null
  driver_name: string | null
  flag_at_fl: string | null
}

export interface CarOption {
  id: string
  label: string
}

function leaderText(leader: { carNumber: string; driverName: string | null } | null): string {
  if (!leader) return '—'
  return `#${leader.carNumber}${leader.driverName ? ` (${leader.driverName})` : ''}`
}

function NoteItem({ note, onDelete }: { note: RaceNote; onDelete: () => void }) {
  return (
    <div className="race-note-item">
      <div className="race-note-item-meta">
        <span>{note.elapsedSeconds != null ? formatClock(note.elapsedSeconds) : '—'}</span>
        {note.linkedCar && (
          <span>
            #{note.linkedCar.carNumber} {getTeamDisplayName(note.linkedCar.team)} · L{note.linkedCar.lapNumber} · P
            {note.linkedCar.classPosition}/{note.linkedCar.totalInClass} (class), P{note.linkedCar.position}/{note.linkedCar.totalCars}{' '}
            (overall)
            {note.linkedCar.driverName ? ` · ${note.linkedCar.driverName}` : ''}
          </span>
        )}
        {note.raceLocalTimestamp && <span title="Race's own local time">{new Date(note.raceLocalTimestamp).toLocaleTimeString()}</span>}
        <button type="button" className="race-note-delete" onClick={onDelete} title="Delete note">
          ✕
        </button>
      </div>
      <div className="race-note-text">{note.text}</div>
    </div>
  )
}

export function RaceNotesPanel({
  sessionKey,
  title,
  laps,
  classes,
  currentElapsedSeconds,
  currentRemainingSeconds,
  carOptions,
  pendingLink,
  onConsumeLink,
  getRaceLocalTimestamp,
}: {
  sessionKey: string
  title: string
  laps: LapLike[]
  classes: string[]
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
}) {
  const { notes, addNote, removeNote } = useRaceNotes(sessionKey)
  const { columns, addColumn, removeColumn, renameColumn } = useNotesColumns(sessionKey, classes)
  const [text, setText] = useState('')
  const [manualCar, setManualCar] = useState('')
  const [columnId, setColumnId] = useState(GENERAL_COLUMN_ID)
  const [newColumnName, setNewColumnName] = useState('')

  const totalDuration =
    currentElapsedSeconds != null && currentRemainingSeconds != null ? currentElapsedSeconds + currentRemainingSeconds : null

  const flagEvents = useMemo(() => computeFlagEvents(laps), [laps])

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
      }),
    )
    setText('')
    setManualCar('')
    if (pendingLink) onConsumeLink()
  }

  function handleAddColumn() {
    const name = newColumnName.trim()
    if (!name) return
    addColumn(name)
    setNewColumnName('')
  }

  const timeline = buildNotesTimeline(notes, columns, flagEvents)
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
      </div>

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
        <textarea
          className="race-notes-textarea"
          placeholder="What's happening… e.g. left rear puncture at turn 3, trundles back round to the pits"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd()
          }}
          rows={2}
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
              {timeline.map((row, i) =>
                row.type === 'flag' ? (
                  <tr className="race-notes-flag-row" key={`flag-${i}`}>
                    <td colSpan={columnCount + 2}>{row.label}</td>
                  </tr>
                ) : (
                  <tr key={`hour-${row.hour}`}>
                    <td className="race-notes-hour">{row.hour}</td>
                    <td className="race-notes-leader">{leaderText(row.leader)}</td>
                    {columns.map((col) => (
                      <td key={col.id}>
                        {(row.byColumn.get(col.id) ?? []).map((note) => (
                          <NoteItem key={note.id} note={note} onDelete={() => removeNote(note.id)} />
                        ))}
                      </td>
                    ))}
                    <td>
                      {(row.byColumn.get(GENERAL_COLUMN_ID) ?? []).map((note) => (
                        <NoteItem key={note.id} note={note} onDelete={() => removeNote(note.id)} />
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
          onClick={() => downloadRaceNotesMarkdown(notes, columns, flagEvents, title)}
          disabled={notes.length === 0}
        >
          Export Markdown
        </button>
        <button
          type="button"
          className="replay-btn"
          onClick={() => downloadRaceNotesHtml(notes, columns, flagEvents, title)}
          disabled={notes.length === 0}
        >
          Export HTML
        </button>
      </div>
    </div>
  )
}
