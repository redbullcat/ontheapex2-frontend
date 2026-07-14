import { useState } from 'react'
import type { PenaltyConsequence } from '../api/types'
import { addPenalty } from '../lib/penalties'

// Records a post-session steward decision against a specific car — same
// modal chrome as FlagLapDeletedModal, opened from a "Penalty" button on a
// Results row instead of requiring the session id/car number to be typed
// by hand in Settings (which is still where existing penalties are
// reviewed/removed).
//
// `consequence` is what actually feeds ResultsTable/SessionResultsTable's
// classification math — 'penalty'/'reason' below are just the human-
// readable label/badge text, which don't by themselves change anything.
export function AddPenaltyModal({
  sessionId,
  carNumber,
  onClose,
}: {
  sessionId: number
  carNumber: string
  onClose: () => void
}) {
  const [penalty, setPenalty] = useState('')
  const [reason, setReason] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [consequence, setConsequence] = useState<PenaltyConsequence>('none')
  const [timePenaltySeconds, setTimePenaltySeconds] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave =
    penalty.trim() !== '' &&
    reason.trim() !== '' &&
    !saving &&
    (consequence !== 'time' || (timePenaltySeconds.trim() !== '' && Number(timePenaltySeconds) > 0))

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    await addPenalty({
      session_id: sessionId,
      car_number: carNumber,
      penalty: penalty.trim(),
      reason: reason.trim(),
      stewards_doc_url: docUrl.trim() || null,
      consequence,
      time_penalty_seconds: consequence === 'time' ? Number(timePenaltySeconds) : null,
    })
    onClose()
  }

  return (
    <div className="lap-flag-backdrop" onClick={onClose}>
      <div className="lap-flag-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add penalty</h3>
        <p className="lap-flag-summary">#{carNumber}</p>
        <p className="hint">
          Records a stewards' decision (time penalty, drive-through, disqualification, etc) against this car. Shown
          as a badge on its Results row; review or remove it later from Settings.
        </p>
        <label className="lap-flag-field">
          Penalty
          <input
            type="text"
            value={penalty}
            onChange={(e) => setPenalty(e.target.value)}
            placeholder="e.g. 5 second time penalty"
            autoFocus
          />
        </label>
        <label className="lap-flag-field">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Contact with car 50 at T2 (Decision #61)"
            rows={3}
          />
        </label>
        <label className="lap-flag-field">
          Stewards document URL (optional)
          <input type="url" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="lap-flag-field">
          Consequence
          <select value={consequence} onChange={(e) => setConsequence(e.target.value as PenaltyConsequence)}>
            <option value="none">No automatic effect (informational only)</option>
            <option value="time">Time penalty — add seconds to total race time</option>
            <option value="dsq">Disqualification — removed from classification</option>
          </select>
        </label>
        {consequence === 'time' && (
          <label className="lap-flag-field">
            Seconds to add
            <input
              type="number"
              min="0"
              step="1"
              value={timePenaltySeconds}
              onChange={(e) => setTimePenaltySeconds(e.target.value)}
              placeholder="5"
            />
          </label>
        )}
        <p className="hint">
          {consequence === 'none' && 'This penalty is recorded and shown as a badge, but the Results table stays unchanged.'}
          {consequence === 'time' && 'Added to this car’s classification time — its position and gaps in the Results table will update.'}
          {consequence === 'dsq' && 'This car will be removed from the Results table’s classification and listed separately as disqualified.'}
        </p>
        <div className="lap-flag-actions">
          <div className="lap-flag-actions-right">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="lap-flag-primary" disabled={!canSave} onClick={handleSave}>
              Add penalty
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
