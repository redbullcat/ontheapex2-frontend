import { resolveClassSelection, type ClassSelection } from '../lib/classSelection'

export function ClassFilter({
  classes,
  selection,
  onChange,
}: {
  classes: string[]
  selection: ClassSelection
  onChange: (next: ClassSelection) => void
}) {
  if (classes.length <= 1) return null

  const active = resolveClassSelection(selection, classes)

  return (
    <div className="class-filter">
      <label className="class-filter-item">
        <input type="checkbox" checked={selection === null} onChange={() => onChange(null)} />
        <span>All classes</span>
      </label>
      {classes.map((cls) => (
        <label className="class-filter-item" key={cls}>
          <input
            type="checkbox"
            checked={active.has(cls)}
            onChange={() => {
              const next = new Set(active)
              if (next.has(cls)) {
                if (next.size === 1) return // keep at least one class selected
                next.delete(cls)
              } else {
                next.add(cls)
              }
              onChange(next.size === classes.length ? null : next)
            }}
          />
          <span>{cls}</span>
        </label>
      ))}
    </div>
  )
}
