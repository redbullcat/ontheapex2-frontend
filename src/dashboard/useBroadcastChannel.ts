import { useEffect, useRef } from 'react'

// Generic pub/sub over BroadcastChannel — used to keep a popped-out panel
// window in lockstep with the main dashboard tab it came from (e.g. the
// same Replay clock position/speed, or the same Live delay setting)
// instead of drifting on its own. Same-origin tabs/windows only, which is
// exactly the pop-out's scope here.
export function useBroadcastChannel<T>(channelName: string, onMessage?: (data: T) => void): (data: T) => void {
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel
    channel.onmessage = (ev) => cbRef.current?.(ev.data as T)
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [channelName])

  return (data: T) => channelRef.current?.postMessage(data)
}
