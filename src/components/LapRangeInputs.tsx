export function LapRangeInputs({
  min,
  max,
  value,
  onChange,
}: {
  min: number
  max: number
  value: [number, number]
  onChange: (next: [number, number]) => void
}) {
  if (min >= max) return null

  return (
    <div className="lap-range">
      <span className="field-label">Laps</span>
      <input
        type="number"
        min={min}
        max={value[1]}
        value={value[0]}
        onChange={(e) => {
          const next = Math.max(min, Math.min(value[1], Number(e.target.value) || min))
          onChange([next, value[1]])
        }}
      />
      <span className="lap-range-dash">–</span>
      <input
        type="number"
        min={value[0]}
        max={max}
        value={value[1]}
        onChange={(e) => {
          const next = Math.min(max, Math.max(value[0], Number(e.target.value) || max))
          onChange([value[0], next])
        }}
      />
      {(value[0] !== min || value[1] !== max) && (
        <button type="button" className="lap-range-reset" onClick={() => onChange([min, max])}>
          Reset
        </button>
      )}
    </div>
  )
}
