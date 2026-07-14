import { useEffect, useState } from 'react'
import { clearLapDeleted, getDeletedLapOverride, setLapDeleted } from '../lib/lapOverrides'

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

export interface FlaggableLap {
  lapNumber: number
  lapTimeSeconds: number
}

// Lets a user flag a specific lap as deleted (a steward's decision the
// timing CSV itself has no way to represent — e.g. a pole lap struck down
// for an earlier sporting infringement) with a reason, or restore one
// that's already flagged. The lap is never removed from the underlying
// data — see lapOverrides.ts — only excluded from "fastest lap"-style
// classification wherever that's computed.
//
// `carLaps` is every timed lap of this car available to flag — when a
// caller (ResultsTable, SessionResultsTable) only knows the car's
// *current* fastest lap, flagging it would otherwise silently move the
// "Flag lap" button on to whatever lap is fastest next time it's clicked,
// making it look like a second lap can never be targeted. Showing every
// lap here lets the same open pick any of them, flagged or not.
// CarLapHistoryTable, which already has an unambiguous specific lap per
// row, passes a single-lap array and the picker collapses to plain text.
export function FlagLapDeletedModal({
  sessionId,
  carNumber,
  carLaps,
  initialLapNumber,
  onClose,
}: {
  sessionId: number
  carNumber: string
  carLaps: FlaggableLap[]
  initialLapNumber: number
  onClose: () => void
}) {
  const [lapNumber, setLapNumber] = useState(initialLapNumber)
  const selected = carLaps.find((l) => l.lapNumber === lapNumber) ?? carLaps[0]
  const existing = getDeletedLapOverride(sessionId, carNumber, selected.lapNumber)
  const [reason, setReason] = useState(existing?.reason ?? '')

  // Re-seed the reason field (and pick up whether the newly-selected lap is
  // already flagged) whenever the picker changes which lap is targeted.
  useEffect(() => {
    setReason(getDeletedLapOverride(sessionId, carNumber, selected.lapNumber)?.reason ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.lapNumber])

  async function handleFlag() {
    const trimmed = reason.trim()
    if (!trimmed) return
    await setLapDeleted(sessionId, carNumber, selected.lapNumber, trimmed)
    onClose()
  }

  async function handleRestore() {
    await clearLapDeleted(sessionId, carNumber, selected.lapNumber)
    onClose()
  }

  const sortedLaps = [...carLaps].sort((a, b) => a.lapNumber - b.lapNumber)

  return (
    <div className="lap-flag-backdrop" onClick={onClose}>
      <div className="lap-flag-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{existing ? 'Update deleted lap' : 'Flag lap as deleted'}</h3>
        {sortedLaps.length > 1 ? (
          <label className="lap-flag-field">
            Lap
            <select value={selected.lapNumber} onChange={(e) => setLapNumber(Number(e.target.value))}>
              {sortedLaps.map((l) => {
                const flagged = getDeletedLapOverride(sessionId, carNumber, l.lapNumber) != null
                return (
                  <option key={l.lapNumber} value={l.lapNumber}>
                    Lap {l.lapNumber} — {formatLapTime(l.lapTimeSeconds)}
                    {flagged ? ' (flagged)' : ''}
                  </option>
                )
              })}
            </select>
          </label>
        ) : (
          <p className="lap-flag-summary">
            #{carNumber} — Lap {selected.lapNumber} — {formatLapTime(selected.lapTimeSeconds)}
          </p>
        )}
        <p className="hint">
          The lap stays in the data as-is — this only excludes it from fastest-lap classification (results,
          fastest-laps tables, and the race's starting grid) elsewhere in the app.
        </p>
        <label className="lap-flag-field">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Deleted — sporting infringement (Decision #133)"
            rows={3}
          />
        </label>
        <div className="lap-flag-actions">
          {existing && (
            <button type="button" className="lap-flag-restore" onClick={handleRestore}>
              Restore lap
            </button>
          )}
          <div className="lap-flag-actions-right">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="lap-flag-primary" disabled={!reason.trim()} onClick={handleFlag}>
              {existing ? 'Update' : 'Flag as deleted'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
