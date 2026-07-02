interface Option {
  value: string
  label: string
}

export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  narrow,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
  narrow?: boolean
}) {
  return (
    <label className={narrow ? 'field field-narrow' : 'field'}>
      <span className="field-label">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
