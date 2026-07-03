import { useEffect } from 'react'

// index.html ships a single static <title>, so every view (main app, Replay,
// Live) needs to set its own — otherwise every tab just reads "On The Apex"
// regardless of what's actually open, which makes browser tabs/history
// useless for telling sessions apart.
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
  }, [title])
}
