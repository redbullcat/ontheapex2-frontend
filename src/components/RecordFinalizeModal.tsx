import { useState } from 'react'
import type { FinalizeOptions } from '../hooks/useSvgRecorder'

// Shown once a recording stops — asks for an optional title and whether to
// include the On The Apex logo, both applied in a quick re-encode pass
// right before the video downloads (see useSvgRecorder's finalizeVideo).
// Deliberately shown *after* recording rather than before: neither choice
// needs to be locked in until you've actually seen how the clip turned out.
export function RecordFinalizeModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (options: FinalizeOptions) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [includeLogo, setIncludeLogo] = useState(true)

  return (
    <div className="record-finalize-backdrop" onClick={onCancel}>
      <div className="record-finalize-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Finish recording</h3>
        <label className="record-finalize-field">
          Title (optional)
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 2026 Spa 6H lap chart — Hypercar"
            autoFocus
          />
        </label>
        <label className="record-finalize-checkbox">
          <input type="checkbox" checked={includeLogo} onChange={(e) => setIncludeLogo(e.target.checked)} />
          Include OTA logo?
        </label>
        <div className="record-finalize-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="record-finalize-primary" onClick={() => onSubmit({ title, includeLogo })}>
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
