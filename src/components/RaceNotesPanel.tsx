import { useState } from 'react'
import { useRaceNotes } from '../hooks/useRaceNotes'
import { createRaceNote, hourBucket, type PendingNoteLink, type RaceNote } from '../lib/raceNotes'
import { buildNotesGrid } from '../lib/raceNotesGrid'
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
            {note.linkedCar.position}
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
  const [text, setText] = useState('')
  const [manualCar, setManualCar] = useState('')

  const totalDuration =
    currentElapsedSeconds != null && currentRemainingSeconds != null ? currentElapsedSeconds + currentRemainingSeconds : null

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
      }),
    )
    setText('')
    setManualCar('')
    if (pendingLink) onConsumeLink()
  }

  const grid = buildNotesGrid(notes, classes)
  const allClasses = [...new Set([...classes, ...grid.flatMap((r) => [...r.byClass.keys()])])]

  return (
    <div className="race-notes-panel">
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

      {grid.length === 0 ? (
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
                {allClasses.map((cls) => (
                  <th key={cls}>{cls}</th>
                ))}
                <th>General</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((row) => (
                <tr key={row.hour}>
                  <td className="race-notes-hour">{row.hour}</td>
                  <td className="race-notes-leader">{leaderText(row.leader)}</td>
                  {allClasses.map((cls) => (
                    <td key={cls}>
                      {(row.byClass.get(cls) ?? []).map((note) => (
                        <NoteItem key={note.id} note={note} onDelete={() => removeNote(note.id)} />
                      ))}
                    </td>
                  ))}
                  <td>
                    {row.general.map((note) => (
                      <NoteItem key={note.id} note={note} onDelete={() => removeNote(note.id)} />
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="race-notes-export">
        <button type="button" className="replay-btn" onClick={() => downloadRaceNotesMarkdown(notes, classes, title)} disabled={notes.length === 0}>
          Export Markdown
        </button>
        <button type="button" className="replay-btn" onClick={() => downloadRaceNotesHtml(notes, classes, title)} disabled={notes.length === 0}>
          Export HTML
        </button>
      </div>
    </div>
  )
}
