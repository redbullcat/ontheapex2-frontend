// Replay and Live are routed outside the main app shell (see main.tsx) —
// full page navigations, not client-side routes — so this is a plain link,
// not a router back-button. Shared by both so there's always a way back to
// the series/event/session picker without hitting the browser's own back
// button (which may just replay history within the same standalone view).
export function BackLink() {
  return (
    <a className="back-link" href="/">
      ← On The Apex
    </a>
  )
}
