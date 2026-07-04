import { useMemo, useState, type ReactNode } from 'react'
import GridLayout, { useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { PanelDef, PanelInstance } from './types'
import { PanelFrame } from './PanelFrame'
import type { useDashboardLayout } from './useDashboardLayout'

export interface CarOption {
  id: string
  label: string
}

// Generic dashboard shell — the drag/resize/persist/add/remove/pop-out
// mechanics are identical between Replay and Live, so this is the one
// place that logic lives. What differs between the two views is *what*
// panels exist and how they're rendered, supplied by the caller via
// `panelDefs`/`renderPanel` (see replay/replayPanels.tsx,
// live/livePanels.tsx) rather than baked in here.
//
// The `useDashboardLayout` call itself lives in the *parent* (ReplayApp/
// LiveNowApp), not in here — CarDetailModal also needs to call `addPanel`
// (its "add to dashboard" buttons), so the layout state has to be shared
// between two independent trees rather than owned privately by this
// component.
export function DashboardGrid({
  panelDefs,
  renderPanel,
  carOptions,
  onPopOut,
  layoutState,
}: {
  panelDefs: Record<string, PanelDef>
  renderPanel: (panel: PanelInstance) => ReactNode
  carOptions: CarOption[]
  onPopOut: (panel: PanelInstance) => void
  layoutState: ReturnType<typeof useDashboardLayout>
}) {
  const { containerRef, width, mounted } = useContainerWidth()
  const { panels, layout, addPanel, removePanel, onLayoutChange, resetLayout } = layoutState
  const [addKind, setAddKind] = useState('')
  const [addCar, setAddCar] = useState('')

  const fieldDefs = useMemo(() => Object.values(panelDefs).filter((d) => d.category === 'field'), [panelDefs])
  const carDefs = useMemo(() => Object.values(panelDefs).filter((d) => d.category === 'car'), [panelDefs])
  const selectedDef = addKind ? panelDefs[addKind] : null

  function handleAdd() {
    if (!selectedDef) return
    if (selectedDef.category === 'car' && !addCar) return
    addPanel(addKind, selectedDef.category === 'car' ? addCar : undefined)
    setAddKind('')
    setAddCar('')
  }

  return (
    <div className="dashboard-root">
      <div className="dashboard-toolbar">
        <select className="dashboard-add-select" value={addKind} onChange={(e) => setAddKind(e.target.value)}>
          <option value="">+ Add panel…</option>
          <optgroup label="Field">
            {fieldDefs.map((d) => (
              <option key={d.kind} value={d.kind}>
                {d.title}
              </option>
            ))}
          </optgroup>
          {carOptions.length > 0 && (
            <optgroup label="Per car">
              {carDefs.map((d) => (
                <option key={d.kind} value={d.kind}>
                  {d.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {selectedDef?.category === 'car' && (
          <select className="dashboard-add-select" value={addCar} onChange={(e) => setAddCar(e.target.value)}>
            <option value="">Choose car…</option>
            {carOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="replay-btn" onClick={handleAdd} disabled={!selectedDef || (selectedDef.category === 'car' && !addCar)}>
          Add
        </button>
        <button type="button" className="replay-btn" onClick={resetLayout}>
          Reset layout
        </button>
      </div>
      <div ref={containerRef} className="dashboard-grid-container">
        {mounted && panels.length === 0 && <p className="replay-hint">No panels open — add one above.</p>}
        {mounted && panels.length > 0 && (
          <GridLayout
            layout={layout}
            width={width}
            gridConfig={{ cols: 12, rowHeight: 32, margin: [10, 10] }}
            dragConfig={{ handle: '.dash-panel-header' }}
            // Committing on the generic onLayoutChange (fired reactively
            // any time the library recomputes, not just from a user
            // gesture) fed a freshly-cloned array back in as the `layout`
            // prop, which the library's compactor didn't always treat as
            // idempotent — an oscillating recompute loop that pegged a CPU
            // core and tripped React's "Maximum update depth exceeded"
            // once render pressure was high enough (e.g. Replay playing).
            // Only commit on the two gesture-end events instead, each of
            // which fires exactly once per actual drag/resize.
            onDragStop={(l) => onLayoutChange(l)}
            onResizeStop={(l) => onLayoutChange(l)}
          >
            {panels.map((p) => {
              const def = panelDefs[p.kind]
              const title = def ? (p.carNumber ? `${def.title} — #${p.carNumber}` : def.title) : p.kind
              return (
                <div key={p.id}>
                  <PanelFrame
                    title={title}
                    onClose={() => removePanel(p.id)}
                    onPopOut={() => onPopOut(p)}
                    hasSettings={def?.hasSettings}
                  >
                    {renderPanel(p)}
                  </PanelFrame>
                </div>
              )
            })}
          </GridLayout>
        )}
      </div>
    </div>
  )
}
