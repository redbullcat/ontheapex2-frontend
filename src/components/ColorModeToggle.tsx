export type ColorMode = 'team' | 'class'

// Only meaningful once more than one class is actually on the chart — with a
// single class every line already shares one color, so the toggle is hidden
// by the caller in that case.
export function ColorModeToggle({
  mode,
  onChange,
}: {
  mode: ColorMode
  onChange: (mode: ColorMode) => void
}) {
  return (
    <div className="color-mode-toggle" role="radiogroup" aria-label="Color lines by">
      {(['team', 'class'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={mode === m ? 'active' : ''}
          onClick={() => onChange(m)}
        >
          {m === 'team' ? 'Team' : 'Class'}
        </button>
      ))}
    </div>
  )
}
