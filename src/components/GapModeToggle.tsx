import type { GapMode } from '../lib/gapToLeader'

export function GapModeToggle({ value, onChange }: { value: GapMode; onChange: (v: GapMode) => void }) {
  return (
    <div className="color-mode-toggle" role="radiogroup" aria-label="Gap display">
      {(['ahead', 'leader'] as const).map((m) => (
        <button key={m} type="button" className={value === m ? 'active' : ''} onClick={() => onChange(m)}>
          {m === 'ahead' ? 'Gap to ahead' : 'Gap to leader'}
        </button>
      ))}
    </div>
  )
}
