import { useCallback, useEffect, useState } from 'react'
import type { GridLayoutItem, PanelDef, PanelInstance } from './types'

interface StoredLayout {
  panels: PanelInstance[]
  layout: GridLayoutItem[]
}

function loadStored(key: string): StoredLayout | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredLayout
    if (!Array.isArray(parsed.panels) || !Array.isArray(parsed.layout)) return null
    return parsed
  } catch {
    return null
  }
}

const GRID_COLS = 12

function flowLayout(panels: PanelInstance[], panelDefs: Record<string, PanelDef>): GridLayoutItem[] {
  let x = 0
  let y = 0
  let rowH = 0
  const layout: GridLayoutItem[] = []
  for (const p of panels) {
    const def = panelDefs[p.kind]
    const w = def?.defaultSize.w ?? 6
    const h = def?.defaultSize.h ?? 6
    if (x + w > GRID_COLS) {
      x = 0
      y += rowH
      rowH = 0
    }
    layout.push({ i: p.id, x, y, w, h })
    x += w
    rowH = Math.max(rowH, h)
  }
  return layout
}

// Persists which panels are open and where, per view — a Live dashboard
// and a Replay-of-session-1651 dashboard use different storage keys so
// they don't clobber each other, and each browser/device keeps its own
// arrangement (this is deliberately local, not synced through the
// backend — a saved pit-wall layout is a per-seat preference).
export function useDashboardLayout(storageKey: string, defaultPanels: PanelInstance[], panelDefs: Record<string, PanelDef>) {
  const [state, setState] = useState<StoredLayout>(() => {
    const stored = loadStored(storageKey)
    if (stored && stored.panels.length > 0) return stored
    return { panels: defaultPanels, layout: flowLayout(defaultPanels, panelDefs) }
  })

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  }, [storageKey, state])

  const addPanel = useCallback(
    (kind: string, carNumber?: string) => {
      setState((s) => {
        const id = `${kind}${carNumber ? `:${carNumber}` : ''}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const def = panelDefs[kind]
        const w = def?.defaultSize.w ?? 6
        const h = def?.defaultSize.h ?? 6
        const y = s.layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)
        return {
          panels: [...s.panels, { id, kind, carNumber }],
          layout: [...s.layout, { i: id, x: 0, y, w, h }],
        }
      })
    },
    [panelDefs],
  )

  const removePanel = useCallback((id: string) => {
    setState((s) => ({
      panels: s.panels.filter((p) => p.id !== id),
      layout: s.layout.filter((l) => l.i !== id),
    }))
  }, [])

  // GridLayout calls this any time it recomputes a layout, including with
  // a value-identical-but-new-array-reference result — setting state
  // unconditionally here feeds a new layout reference back down as a prop,
  // which the library treats as another change, calls this again, and so
  // on forever. Only commit when something actually moved/resized.
  const onLayoutChange = useCallback((layout: readonly GridLayoutItem[]) => {
    setState((s) => {
      const changed =
        layout.length !== s.layout.length ||
        layout.some((item, i) => {
          const prev = s.layout[i]
          return !prev || prev.i !== item.i || prev.x !== item.x || prev.y !== item.y || prev.w !== item.w || prev.h !== item.h
        })
      return changed ? { ...s, layout: [...layout] } : s
    })
  }, [])

  const resetLayout = useCallback(() => {
    setState({ panels: defaultPanels, layout: flowLayout(defaultPanels, panelDefs) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { panels: state.panels, layout: state.layout, addPanel, removePanel, onLayoutChange, resetLayout }
}
