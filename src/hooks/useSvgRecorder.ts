import { useCallback, useRef, useState } from 'react'

// Records an <svg> element as a video by continuously rasterizing it onto
// an offscreen canvas and feeding that canvas's own MediaStream to a
// MediaRecorder — canvas.captureStream() needs no permission prompt (unlike
// getDisplayMedia/screen-share) and captures nothing but the canvas we
// control, so the output is exactly the chart with no surrounding UI.
// Crucially, this captures the *actual* live-playing chart exactly as it
// renders — not a reconstruction — so it's as smooth as watching it play.
//
// Render at a fixed multiple of the SVG's own displayed size for a
// crisper-than-screen result without needing a separate "resolution" UI.
const RESOLUTION_SCALE = 2
const CAPTURE_FPS = 30

export type RecordAspect = 'landscape' | 'portrait' | 'square' | 'portrait-4-5'

// null (landscape) keeps the original behavior: the whole chart, upscaled
// to a crisper size, same shape as it's displayed on screen. The others
// are real social-video target resolutions — cropping a wide chart down to
// one of these needs a source window narrower than the full chart, which
// is what the tracking logic below computes every frame.
const ASPECT_PRESETS: Record<RecordAspect, { width: number; height: number } | null> = {
  landscape: null,
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  'portrait-4-5': { width: 1080, height: 1350 },
}

// How much of the crop window's width to leave as breathing room past the
// current reveal edge, so the "now" point doesn't sit flush against the
// right border of the frame.
const TRACK_EDGE_PADDING_FRACTION = 0.06

// Finds how far into the chart's own (unscaled) coordinate space the
// reveal animation has currently progressed, by measuring the live
// clip-path rect these charts already use to drive their reveal (see
// ReplayTrendChart.tsx/LapPositionChart.tsx's clipRectRef) — reading its
// on-screen position via getBoundingClientRect handles any margin/axis
// transform the chart applies internally, without this hook needing to
// know any chart-specific layout details.
function findRevealEdgeX(svg: SVGSVGElement, naturalWidth: number): number | null {
  const clipRect = svg.querySelector('clipPath rect')
  if (!clipRect) return null
  const svgBox = svg.getBoundingClientRect()
  if (svgBox.width === 0) return null
  const clipBox = (clipRect as SVGGraphicsElement).getBoundingClientRect()
  const scaleX = naturalWidth / svgBox.width
  return (clipBox.right - svgBox.left) * scaleX
}

// Visual properties a chart's paths/text can pick up from an external
// stylesheet (a CSS class, or a var(--replay-muted)-style custom property)
// rather than an inline attribute — axis ticks and gridlines in particular
// are styled this way. A cloned SVG serialized on its own has no access to
// the page's stylesheets, so left alone these come out as CSS defaults
// (black text, invisible against a dark chart) instead of their real
// themed color. Baking the resolved value in as an inline style before
// serializing fixes that regardless of where the original rule lived.
const INLINE_STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
] as const

function inlineComputedStyles(original: Element, clone: Element) {
  const cs = getComputedStyle(original)
  const declarations = INLINE_STYLE_PROPS.map((prop) => `${prop}:${cs.getPropertyValue(prop)}`).join(';')
  clone.setAttribute('style', `${clone.getAttribute('style') ?? ''};${declarations}`)

  const originalChildren = original.children
  const cloneChildren = clone.children
  for (let i = 0; i < originalChildren.length; i++) {
    inlineComputedStyles(originalChildren[i], cloneChildren[i])
  }
}

export function useSvgRecorder(svgRef: React.RefObject<SVGSVGElement | null>, filenameBase: string) {
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const aspectRef = useRef<RecordAspect>('landscape')

  // Renders exactly one frame onto the canvas; resolves once it's actually
  // painted. Used both to pre-warm the canvas before recording starts (so
  // the video doesn't open on a blank/incomplete first frame while the
  // very first async image decode is still in flight) and, in a loop, for
  // every frame while recording.
  const drawOnce = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const svg = svgRef.current
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d', { alpha: false }) ?? null
      if (!svg || !canvas || !ctx) return resolve()

      const rect = svg.getBoundingClientRect()
      // The chart's own width/height attributes ARE its coordinate system
      // (no viewBox — see the note on drawImage below), so that's what
      // source crop math needs to work in, not the on-screen CSS size.
      const naturalWidth = Number(svg.getAttribute('width')) || rect.width
      const naturalHeight = Number(svg.getAttribute('height')) || rect.height

      const preset = ASPECT_PRESETS[aspectRef.current]
      let destWidth: number
      let destHeight: number
      let srcX = 0
      let srcY = 0
      let srcWidth = naturalWidth
      let srcHeight = naturalHeight

      if (preset) {
        destWidth = preset.width
        destHeight = preset.height
        // Full chart height, but only as much width as this destination's
        // aspect ratio needs — cropping a wide lap chart down to a tall
        // frame instead of squashing it into an illegible sliver.
        srcHeight = naturalHeight
        srcWidth = Math.min(naturalWidth, srcHeight * (destWidth / destHeight))
        const edge = findRevealEdgeX(svg, naturalWidth)
        if (edge !== null) {
          const padding = srcWidth * TRACK_EDGE_PADDING_FRACTION
          srcX = Math.min(Math.max(0, edge + padding - srcWidth), Math.max(0, naturalWidth - srcWidth))
        }
      } else {
        destWidth = Math.max(1, Math.round(rect.width * RESOLUTION_SCALE))
        destHeight = Math.max(1, Math.round(rect.height * RESOLUTION_SCALE))
      }

      if (canvas.width !== destWidth || canvas.height !== destHeight) {
        canvas.width = destWidth
        canvas.height = destHeight
      }

      // Deliberately NOT overriding the clone's width/height to the scaled
      // canvas size here: these charts size their <svg> in raw pixels with
      // no viewBox, so the width/height attributes ARE the coordinate
      // system every path was drawn in. Forcing them to a bigger number
      // doesn't rescale existing content — it just declares a bigger,
      // mostly-blank canvas around the same small drawing (the "canvas is
      // much bigger than the chart" bug). Leaving them at the SVG's own
      // real size and letting drawImage's source/destination rects below
      // do the crop-and-scale is what actually renders it correctly.
      const clone = svg.cloneNode(true) as SVGSVGElement
      inlineComputedStyles(svg, clone)
      const serialized = new XMLSerializer().serializeToString(clone)
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      // The svg's own immediate parent is the chart's actual themed
      // container in every chart this hook is used from (ReplayTrendChart's
      // .replay-trend-chart, LapPositionChart's .position-chart, etc) —
      // reading it directly here means this hook doesn't need to know any
      // particular chart's class names.
      const bg = getComputedStyle(svg.parentElement ?? svg).backgroundColor

      const img = new Image()
      const proceed = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      img.onload = () => {
        // alpha:false already makes every pixel fully opaque, but the fill
        // still matters so the chart's own background shows through
        // wherever the SVG itself is transparent (empty margins etc).
        ctx.fillStyle = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff'
        ctx.fillRect(0, 0, destWidth, destHeight)
        ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, destWidth, destHeight)
        proceed()
      }
      img.onerror = proceed
      img.src = url
    })
  }, [svgRef])

  const loop = useCallback(async () => {
    await drawOnce()
    if (recorderRef.current?.state === 'recording') rafRef.current = requestAnimationFrame(() => loop())
  }, [drawOnce])

  const start = useCallback(async (aspect: RecordAspect = 'landscape') => {
    const svg = svgRef.current
    if (!svg || recorderRef.current) return

    aspectRef.current = aspect
    const canvas = document.createElement('canvas')
    canvasRef.current = canvas
    // Pre-warm: paint a real frame before the recorder (and its capture
    // timer) starts, so the saved video opens on real content instead of
    // an empty/blank canvas from before the first async image decode.
    await drawOnce()

    const stream = canvas.captureStream(CAPTURE_FPS)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = aspectRef.current === 'landscape' ? `${filenameBase}.webm` : `${filenameBase}_${aspectRef.current}.webm`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }
    recorderRef.current = recorder
    recorder.start()
    setRecording(true)
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 250)
    loop()
  }, [svgRef, filenameBase, drawOnce, loop])

  const stop = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    canvasRef.current = null
    setRecording(false)
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
  }, [])

  return { recording, elapsedSeconds, start, stop }
}
