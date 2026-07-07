import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { chartRectFor, composeFrame, type FinalizeOptions } from '../hooks/useSvgRecorder'
import { ensureTitleFontLoaded } from '../lib/fonts'
import { curveControlPoint, momentAnchorPx, momentTextPx, MomentPlayer, type RaceMoment } from '../lib/raceMoments'

export interface RecordPreviewHandle {
  seek: (seconds: number) => void
  setPlaying: (playing: boolean) => void
}

// Live preview inside RecordFinalizeModal — plays the just-finished raw
// recording on a loop through a hidden <video> and continuously redraws it
// through the exact same composeFrame used by the real finalize/re-encode
// pass (including baked-in moment pause/animate/resume beats via
// MomentPlayer), so what you see here is what you'll actually get.
//
// When `editingMoment` is set, playback freezes on that moment's own frame
// and a drag-to-position overlay (real DOM elements, not canvas pixels) is
// rendered on top instead — the caption bubble and the arrow's anchor dot
// are independently draggable, and the connecting arrow is recomputed live
// from wherever they currently sit (see raceMoments.ts's curveControlPoint).
export const RecordPreview = forwardRef<
  RecordPreviewHandle,
  {
    blob: Blob
    backgroundColor: string
    options: FinalizeOptions
    editingMoment: RaceMoment | null
    onMomentDrag: (id: string, patch: Partial<Pick<RaceMoment, 'textPos' | 'anchorPos'>>) => void
    // Called continuously while positioning a moment and playback/scrubbing
    // moves away from its current atSeconds — scrubbing or playing *is* how
    // you retime a moment while positioning it, rather than a separate
    // control (see the editing branch in the draw loop below).
    onMomentRetime: (id: string, atSeconds: number) => void
    onTimeUpdate?: (seconds: number, durationSeconds: number) => void
  }
>(function RecordPreview({ blob, backgroundColor, options, editingMoment, onMomentDrag, onMomentRetime, onTimeUpdate }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options
  const bgRef = useRef(backgroundColor)
  bgRef.current = backgroundColor
  const editingMomentRef = useRef(editingMoment)
  editingMomentRef.current = editingMoment
  const playingRef = useRef(true)
  const seekTargetRef = useRef<number | null>(null)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  onTimeUpdateRef.current = onTimeUpdate
  const onMomentRetimeRef = useRef(onMomentRetime)
  onMomentRetimeRef.current = onMomentRetime

  useImperativeHandle(ref, () => ({
    seek(seconds) {
      seekTargetRef.current = seconds
    },
    setPlaying(playing) {
      playingRef.current = playing
      if (playing) seekTargetRef.current = null
    },
  }))

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
    videoRef.current = video

    let rafId: number | null = null
    let cancelled = false
    let lastTime = 0
    const momentPlayer = new MomentPlayer()

    video.onloadedmetadata = () => {
      if (cancelled) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      setVideoSize({ width: video.videoWidth, height: video.videoHeight })
      video.play().catch(() => {})

      const draw = () => {
        if (cancelled) return

        // Looped back to the start — moments that already fired should be
        // able to fire again next time round.
        if (video.currentTime < lastTime - 0.5) momentPlayer.reset()
        lastTime = video.currentTime

        const editing = editingMomentRef.current
        if (editing) {
          // Positioning mode starts frozen on the moment's own frame, but
          // scrubbing or pressing play still works here — that's how you
          // retime a moment while positioning it, rather than a separate
          // control. Whatever instant playback/scrubbing lands on becomes
          // the moment's new atSeconds.
          if (seekTargetRef.current !== null) {
            video.currentTime = seekTargetRef.current
            seekTargetRef.current = null
            if (!playingRef.current) video.pause()
          }
          if (playingRef.current) {
            if (video.paused) video.play().catch(() => {})
          } else if (!video.paused) {
            video.pause()
          }
          composeFrame(ctx, video, video.videoWidth, video.videoHeight, bgRef.current, optionsRef.current, null)
          if (Math.abs(video.currentTime - editing.atSeconds) > 0.01) {
            onMomentRetimeRef.current?.(editing.id, video.currentTime)
          }
          onTimeUpdateRef.current?.(video.currentTime, video.duration || 0)
          rafId = requestAnimationFrame(draw)
          return
        }

        if (seekTargetRef.current !== null) {
          video.currentTime = seekTargetRef.current
          seekTargetRef.current = null
          if (!playingRef.current) video.pause()
        }

        const moments = optionsRef.current.moments
        const overlay =
          playingRef.current && moments.length > 0 ? momentPlayer.update(moments, video, performance.now()) : null

        // Reconcile play/pause state *after* the moment player has had a
        // chance to pause the video itself for a hold — otherwise this
        // would immediately un-pause the very hold it just started.
        if (playingRef.current && video.paused && !momentPlayer.isHolding()) {
          video.play().catch(() => {})
        } else if (!playingRef.current && !video.paused) {
          video.pause()
        }

        composeFrame(ctx, video, video.videoWidth, video.videoHeight, bgRef.current, optionsRef.current, overlay)
        onTimeUpdateRef.current?.(video.currentTime, video.duration || 0)
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

  const chartRect = videoSize ? chartRectFor(videoSize.width, videoSize.height, options) : null

  return (
    <div className="record-finalize-preview">
      <div
        className="record-finalize-preview-frame"
        style={videoSize ? { aspectRatio: `${videoSize.width} / ${videoSize.height}` } : undefined}
      >
        <canvas ref={canvasRef} />
        {editingMoment && chartRect && videoSize && (
          <MomentEditor
            moment={editingMoment}
            chartRect={chartRect}
            videoSize={videoSize}
            onDrag={onMomentDrag}
          />
        )}
      </div>
    </div>
  )
})

function MomentEditor({
  moment,
  chartRect,
  videoSize,
  onDrag,
}: {
  moment: RaceMoment
  chartRect: { x: number; y: number; width: number; height: number }
  videoSize: { width: number; height: number }
  onDrag: (id: string, patch: Partial<Pick<RaceMoment, 'textPos' | 'anchorPos'>>) => void
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  // The frame's actual on-screen pixel size — needed to convert the
  // moment's canvas-pixel font size (see raceMoments.ts) into a CSS
  // font-size that visually matches, so the bubble you drag around here is
  // the same size (relative to the chart) as what ends up in the export.
  const [frameSizePx, setFrameSizePx] = useState({ width: 0, height: 0 })
  // The bubble's own rendered size — used to keep it fully inside the
  // frame regardless of where textPos points or how big fontSize makes it
  // (see the matching clamp in raceMoments.ts's drawMomentOverlay, which
  // this mirrors so what's shown here matches the actual export). One
  // render behind the current drag position, which is invisible in
  // practice since only text/fontSize change the bubble's size, not
  // dragging itself.
  const [bubbleSizePx, setBubbleSizePx] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setFrameSizePx({ width: rect.width, height: rect.height })
    })
    ro.observe(frame)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble) return
    const ro = new ResizeObserver(() => {
      const rect = bubble.getBoundingClientRect()
      setBubbleSizePx({ width: rect.width, height: rect.height })
    })
    // Border-box (via getBoundingClientRect, not contentRect) — the
    // clamp below needs the bubble's actual visible box, padding
    // included, not just its inner content area.
    ro.observe(bubble)
    return () => ro.disconnect()
  }, [])

  const anchorPx = momentAnchorPx(chartRect, moment)
  const rawTextPx = momentTextPx(chartRect, moment)
  const displayScale = frameSizePx.height > 0 ? frameSizePx.height / videoSize.height : 1
  const bubbleFontSizePx = Math.max(10, moment.fontSize) * displayScale

  // Clamp the bubble's *displayed* center so its full box stays within the
  // frame, converting the bubble's on-screen size back into canvas-pixel
  // units to clamp in the same coordinate space as textPx itself.
  const margin = 8 / displayScale
  const halfW = bubbleSizePx.width / 2 / displayScale
  const halfH = bubbleSizePx.height / 2 / displayScale
  const textPx = {
    x: Math.min(Math.max(rawTextPx.x, halfW + margin), Math.max(halfW + margin, videoSize.width - halfW - margin)),
    y: Math.min(Math.max(rawTextPx.y, halfH + margin), Math.max(halfH + margin, videoSize.height - halfH - margin)),
  }
  const { cx, cy } = curveControlPoint(textPx.x, textPx.y, anchorPx.x, anchorPx.y)

  function pct(px: number, dim: number) {
    return `${(px / dim) * 100}%`
  }

  function startDrag(e: React.PointerEvent, key: 'textPos' | 'anchorPos') {
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const frame = frameRef.current
      if (!frame) return
      const rect = frame.getBoundingClientRect()
      const frameFracX = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width))
      const frameFracY = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height))
      const canvasPxX = frameFracX * videoSize.width
      const canvasPxY = frameFracY * videoSize.height
      const fx = Math.min(1, Math.max(0, (canvasPxX - chartRect.x) / chartRect.width))
      const fy = Math.min(1, Math.max(0, (canvasPxY - chartRect.y) / chartRect.height))
      onDrag(moment.id, { [key]: { x: fx, y: fy } })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="moment-editor" ref={frameRef}>
      <div className="moment-editor-chip">Positioning</div>
      <svg className="moment-editor-arrow" viewBox={`0 0 ${videoSize.width} ${videoSize.height}`} preserveAspectRatio="none">
        <path d={`M ${textPx.x} ${textPx.y} Q ${cx} ${cy} ${anchorPx.x} ${anchorPx.y}`} />
      </svg>
      <div
        className="moment-editor-bubble"
        ref={bubbleRef}
        style={{
          left: pct(textPx.x, videoSize.width),
          top: pct(textPx.y, videoSize.height),
          fontSize: `${bubbleFontSizePx}px`,
        }}
        onPointerDown={(e) => startDrag(e, 'textPos')}
      >
        {moment.text || 'New moment'}
      </div>
      <div
        className="moment-editor-anchor"
        style={{ left: pct(anchorPx.x, videoSize.width), top: pct(anchorPx.y, videoSize.height) }}
        onPointerDown={(e) => startDrag(e, 'anchorPos')}
      />
    </div>
  )
}
