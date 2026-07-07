import { useEffect, useState } from 'react'

// A plain number input bound directly to a clamped value fights the user
// the moment they try to clear a field to retype it: an empty string reads
// as 0, which the old clamp-on-every-keystroke logic immediately snapped
// back to `min`, so the digit never actually appeared to leave the box.
// Each field keeps its own free-typed text instead, only parsing/clamping
// (and calling onChange) once the user commits — on blur, or Enter.
function RangeField({
  value,
  commit,
}: {
  value: number
  commit: (n: number) => void
}) {
  const [text, setText] = useState(String(value))

  // Follows external changes (Reset button, the other field's clamp, a
  // fresh session load) — but not every keystroke, so typing isn't
  // fought by its own committed value bouncing back mid-edit.
  useEffect(() => {
    setText(String(value))
  }, [value])

  function commitText() {
    const parsed = Number(text)
    commit(Number.isFinite(parsed) && text.trim() !== '' ? parsed : value)
  }

  return (
    <input
      type="number"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commitText}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

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
      <RangeField
        value={value[0]}
        commit={(n) => onChange([Math.max(min, Math.min(value[1], n)), value[1]])}
      />
      <span className="lap-range-dash">–</span>
      <RangeField
        value={value[1]}
        commit={(n) => onChange([value[0], Math.min(max, Math.max(value[0], n))])}
      />
      {(value[0] !== min || value[1] !== max) && (
        <button type="button" className="lap-range-reset" onClick={() => onChange([min, max])}>
          Reset
        </button>
      )}
    </div>
  )
}
