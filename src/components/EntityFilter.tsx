import { resolveEntitySelection, type EntitySelection } from '../lib/entitySelection'

export interface EntityOption {
  id: string
  label: string
}

// Starts showing everything as removable chips (selection === null), rather
// than starting empty and requiring the user to add every car/driver back
// one at a time to reach the same "all" view they began with.
export function EntityFilter({
  items,
  selection,
  onChange,
  addLabel,
  resetLabel,
}: {
  items: EntityOption[]
  selection: EntitySelection
  onChange: (next: EntitySelection) => void
  addLabel: string
  resetLabel: string
}) {
  const active = resolveEntitySelection(selection, items.map((i) => i.id))
  const activeItems = items.filter((i) => active.has(i.id))
  const availableToAdd = items.filter((i) => !active.has(i.id))

  return (
    <div className="entity-filter">
      <label className="field entity-filter-add">
        <span className="field-label">{addLabel}</span>
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return
            const next = new Set(active)
            next.add(e.target.value)
            onChange(next.size === items.length ? null : next)
          }}
        >
          <option value="" disabled>
            Select…
          </option>
          {availableToAdd.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      {selection !== null && (
        <button type="button" className="entity-filter-reset" onClick={() => onChange(null)}>
          {resetLabel}
        </button>
      )}
      <div className="entity-filter-chips">
        {activeItems.map((i) => (
          <button
            key={i.id}
            type="button"
            className="car-picker-chip"
            onClick={() => {
              const next = new Set(active)
              next.delete(i.id)
              onChange(next)
            }}
            title="Remove"
          >
            {i.label} ×
          </button>
        ))}
      </div>
    </div>
  )
}
