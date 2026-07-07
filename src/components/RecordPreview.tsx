import { useEffect, useRef } from 'react'
import { composeFrame, type FinalizeOptions } from '../hooks/useSvgRecorder'
import { ensureTitleFontLoaded } from '../lib/fonts'

// Live preview inside RecordFinalizeModal — plays the just-finished raw
// recording on a loop through a hidden <video> and continuously redraws it
// through the exact same composeFrame used by the real finalize/re-encode
// pass, so what you see here is what you'll actually get. The video element
// itself is only created once per recording (keyed off `blob`); title/font/
// logo edits are picked up every frame via a ref rather than recreating the
// video, so toggling the logo checkbox or retyping the title doesn't restart
// playback.
export function RecordPreview({
  blob,
  backgroundColor,
  options,
}: {
  blob: Blob
  backgroundColor: string
  options: FinalizeOptions
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const bgRef = useRef(backgroundColor)
  bgRef.current = backgroundColor

  useEffect(() => {
    if (options.title) ensureTitleFontLoaded(options.font)
    // Only re-triggers when the font identity actually changes, not on
    // every keystroke of the title or size tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.font.family, options.font.weight, options.font.italic, options.title])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false }) ?? null
    if (!canvas || !ctx) return

    const video = document.createElement('video')
    video.muted = true
    video.loop = true
    video.playsInline = true
    const url = URL.createObjectURL(blob)
    video.src = url

    let rafId: number | null = null
    let cancelled = false

    video.onloadedmetadata = () => {
      if (cancelled) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      video.play().catch(() => {})
      const draw = () => {
        if (cancelled) return
        composeFrame(ctx, video, video.videoWidth, video.videoHeight, bgRef.current, optionsRef.current)
        rafId = requestAnimationFrame(draw)
      }
      draw()
    }

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      video.pause()
      video.src = ''
      URL.revokeObjectURL(url)
    }
  }, [blob])

  return <canvas className="record-finalize-preview" ref={canvasRef} />
}
