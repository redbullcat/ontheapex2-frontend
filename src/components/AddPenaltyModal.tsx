import { useState } from 'react'
import { addPenalty } from '../lib/penalties'

// Records a post-session steward decision against a specific car — same
// modal chrome as FlagLapDeletedModal, opened from a "Penalty" button on a
// Results row instead of requiring the session id/car number to be typed
// by hand in Settings (which is still where existing penalties are
// reviewed/removed).
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
  const [saving, setSaving] = useState(false)

  const canSave = penalty.trim() !== '' && reason.trim() !== '' && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    await addPenalty({
      session_id: sessionId,
      car_number: carNumber,
      penalty: penalty.trim(),
      reason: reason.trim(),
      stewards_doc_url: docUrl.trim() || null,
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
