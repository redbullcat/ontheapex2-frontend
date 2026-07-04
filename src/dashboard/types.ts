// A panel "kind" is a string id (e.g. 'leaderboard', 'car-pace') resolved
// against a view-specific registry (see replay/replayPanels.tsx,
// live/livePanels.tsx) — kept as a plain string here rather than a shared
// enum so Replay and Live can each define their own kinds independently,
// the same way their sidebars/panels already diverge in practice even
// though the mechanics (this file, DashboardGrid, useDashboardLayout) are
// fully shared between them.
export interface PanelDef {
  kind: string
  title: string
  category: 'field' | 'car'
  defaultSize: { w: number; h: number }
  // True when this panel's chart has its own class/car/driver filter
  // controls — shown via a gear icon + popup in the panel's title bar
  // (PanelFrame) instead of dominating the panel's limited width inline.
  hasSettings?: boolean
}

export interface PanelInstance {
  id: string
  kind: string
  // Only set for category:'car' panels — which car this specific panel
  // instance is focused on, since a dashboard can hold e.g. a Pace panel
  // each for two different cars side by side.
  carNumber?: string
}

export interface GridLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}
