import { useState } from 'react'
import { clampDelaySeconds } from './useLiveDelay'

// Fixed bottom-right, out of the way of everything else — a viewer sets
// this once per session (to match their stream's latency) and mostly
// ignores it after that.
export function DelaySettings({ delaySeconds, onChange }: { delaySeconds: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="live-delay-widget">
      {open && (
        <div className="live-delay-popover">
          <p className="live-delay-label">Sync to stream delay</p>
          <div className="live-delay-controls">
            <button type="button" onClick={() => onChange(delaySeconds - 1)} aria-label="Decrease delay by 1 second">
              −
            </button>
            <input
              type="number"
              min={0}
              max={600}
              value={delaySeconds}
              onChange={(e) => onChange(clampDelaySeconds(Number(e.target.value)))}
            />
            <span className="live-delay-unit">sec</span>
            <button type="button" onClick={() => onChange(delaySeconds + 1)} aria-label="Increase delay by 1 second">
              +
            </button>
          </div>
          <p className="live-delay-hint">Data on screen will lag behind live by this many seconds — match it to your stream.</p>
        </div>
      )}
      <button type="button" className="live-delay-toggle" onClick={() => setOpen((o) => !o)}>
        ⏱ {delaySeconds > 0 ? `Delay ${delaySeconds}s` : 'Delay off'}
      </button>
    </div>
  )
}
