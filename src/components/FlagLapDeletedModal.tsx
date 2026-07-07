import { useState } from 'react'
import { clearLapDeleted, getDeletedLapOverride, setLapDeleted } from '../lib/lapOverrides'

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

// Lets a user flag a specific lap as deleted (a steward's decision the
// timing CSV itself has no way to represent — e.g. a pole lap struck down
// for an earlier sporting infringement) with a reason, or restore one
// that's already flagged. The lap is never removed from the underlying
// data — see lapOverrides.ts — only excluded from "fastest lap"-style
// classification wherever that's computed.
export function FlagLapDeletedModal({
  sessionId,
  carNumber,
  lapNumber,
  lapTimeSeconds,
  onClose,
}: {
  sessionId: number
  carNumber: string
  lapNumber: number
  lapTimeSeconds: number
  onClose: () => void
}) {
  const existing = getDeletedLapOverride(sessionId, carNumber, lapNumber)
  const [reason, setReason] = useState(existing?.reason ?? '')

  function handleFlag() {
    const trimmed = reason.trim()
    if (!trimmed) return
    setLapDeleted(sessionId, carNumber, lapNumber, trimmed)
    onClose()
  }

  function handleRestore() {
    clearLapDeleted(sessionId, carNumber, lapNumber)
    onClose()
  }

  return (
    <div className="lap-flag-backdrop" onClick={onClose}>
      <div className="lap-flag-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{existing ? 'Update deleted lap' : 'Flag lap as deleted'}</h3>
        <p className="lap-flag-summary">
          #{carNumber} — Lap {lapNumber} — {formatLapTime(lapTimeSeconds)}
        </p>
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
            autoFocus
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
