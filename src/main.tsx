import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// The Live Timing Replay/Live views intentionally live outside the main app
// shell (their own tab, full browser width — see the wireframe discussion),
// so they're routed here rather than through App's own tab/state system.
// Just a plain pathname check: not enough entry points yet to justify a
// router dependency.
//
// Lazy-loaded rather than statically imported: only one of these four ever
// mounts per page load (decided below, before anything renders), so a
// visitor to any one route no longer downloads the other three's code —
// most significantly App (all ~25 chart components) vs. Replay/Live (which
// pull in react-grid-layout/react-draggable purely for their dashboard
// grid, and were previously shipped to every session-browsing visitor too).
const App = lazy(() => import('./App.tsx'))
const ReplayApp = lazy(() => import('./replay/ReplayApp.tsx').then((m) => ({ default: m.ReplayApp })))
const LiveNowApp = lazy(() => import('./live/LiveNowApp.tsx').then((m) => ({ default: m.LiveNowApp })))
const LiveStagingPage = lazy(() =>
  import('./live/LiveStagingPage.tsx').then((m) => ({ default: m.LiveStagingPage })),
)

const path = window.location.pathname
const isReplay = path === '/replay'
const isLiveNow = path === '/live-now'
const isLiveStaging = path === '/live-staging'

function render() {
  if (isReplay) return <ReplayApp />
  if (isLiveNow) return <LiveNowApp />
  if (isLiveStaging) return <LiveStagingPage />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* null, not a spinner/skeleton — this chunk fetch resolves before the
        very first paint on any reasonable connection, same as the single
        bundle previously had to fully download before anything rendered. */}
    <Suspense fallback={null}>{render()}</Suspense>
  </StrictMode>,
)
