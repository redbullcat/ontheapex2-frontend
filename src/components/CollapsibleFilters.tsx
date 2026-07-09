import { useState, type ReactNode } from 'react'

// Wraps a chart's filter controls (class checkboxes, entity add/remove
// chips, group-by toggles, top-% textboxes, etc.) behind a collapse toggle
// so they don't dominate the page above every chart. `actions` (typically
// export buttons) stay visible in the header regardless of open/closed
// state, since they aren't filters.
export function CollapsibleFilters({
  children,
  actions,
  label = 'Filters',
  defaultOpen = false,
}: {
  children: ReactNode
  actions?: ReactNode
  label?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="collapsible-filters">
      <div className="collapsible-filters-header">
        <button
          type="button"
          className="collapsible-filters-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className={`collapsible-filters-arrow${open ? ' open' : ''}`}>▸</span>
          {label}
        </button>
        {actions}
      </div>
      {open && <div className="collapsible-filters-body">{children}</div>}
    </div>
  )
}
