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

export function useSvgRecorder(svgRef: React.RefObject<SVGSVGElement | null>, filenameBase: string) {
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

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
      const width = Math.max(1, Math.round(rect.width * RESOLUTION_SCALE))
      const height = Math.max(1, Math.round(rect.height * RESOLUTION_SCALE))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      // A serialized SVG's <image> renders at whatever width/height it
      // declares, not the container's on-screen size — set them explicitly
      // to our target resolution so the rasterized result is crisp rather
      // than a small image stretched up.
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
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
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
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

  const start = useCallback(async () => {
    const svg = svgRef.current
    if (!svg || recorderRef.current) return

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
      a.download = `${filenameBase}.webm`
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
