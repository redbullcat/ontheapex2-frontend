export interface CarOption {
  car_number: string
  label: string
}

export function CarPicker({
  cars,
  selected,
  onChange,
}: {
  cars: CarOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const available = cars.filter((c) => !selected.includes(c.car_number))

  return (
    <div className="car-picker">
      <label className="field car-picker-add">
        <span className="field-label">Add car</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...selected, e.target.value])
          }}
        >
          <option value="" disabled>
            Select…
          </option>
          {available.map((c) => (
            <option key={c.car_number} value={c.car_number}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {selected.length > 0 && (
        <div className="car-picker-chips">
          {selected.map((carNumber) => {
            const car = cars.find((c) => c.car_number === carNumber)
            return (
              <button
                key={carNumber}
                type="button"
                className="car-picker-chip"
                onClick={() => onChange(selected.filter((c) => c !== carNumber))}
                title="Remove"
              >
                {car?.label ?? `#${carNumber}`} ×
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
