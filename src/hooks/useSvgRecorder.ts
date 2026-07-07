import { useCallback, useRef, useState } from 'react'
import logoWhiteRaw from '../assets/logo-white.svg?raw'
import logoBlackRaw from '../assets/logo-black.svg?raw'
import { contrastTextColorForColor } from '../lib/contrastColor'

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

// The logo/title (when included) live in their own reserved strips of the
// *finalized* video rather than painted over the chart — these are how
// much of the frame each strip takes, as a fraction of the raw recording's
// own height. See finalizeVideo.
const LOGO_BAND_FRACTION = 0.09
const TITLE_BAND_FRACTION = 0.16

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

// Where the current reveal position sits within the crop window, as a
// fraction of the window's width — 0.5 keeps the cars centered as the
// window tracks them through the race, rather than pinned to one edge.
const TRACK_POSITION_FRACTION = 0.5

// Finds how far into the chart's own (unscaled) coordinate space the
// reveal animation has currently progressed, by reading a data-reveal-x
// attribute the chart keeps up to date on its own <svg> root every tick
// (see ReplayTrendChart.tsx/LapPositionChart.tsx/GapEvolutionChart.tsx's
// per-tick effects). This deliberately does NOT measure the clip-path
// rect's geometry directly (e.g. via getBoundingClientRect): clipPath
// contents are never laid out or painted the way normal elements are, so
// browsers report their bounding rect as all-zero — the crop window would
// silently never move (exactly the "not tracking the cars" bug this was
// built to fix in the first place).
function findRevealEdgeX(svg: SVGSVGElement): number | null {
  const raw = svg.getAttribute('data-reveal-x')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
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

// --- On The Apex watermark, added at finalize time if requested --------

function svgToDataUri(raw: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image()
  img.src = src
  return img
}

// Both logo files share this viewBox (see src/assets/logo-*.svg).
const LOGO_ASPECT = 1731 / 390
// White-on-transparent for dark chart backgrounds, black-on-transparent
// for light ones — loaded once and reused across every recording rather
// than per-frame.
const logoWhiteImg = loadImage(svgToDataUri(logoWhiteRaw))
const logoBlackImg = loadImage(svgToDataUri(logoBlackRaw))

function isDarkTheme(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Draws the logo inside its own reserved band (from y=bandTop to the
// bottom of the canvas) — never on top of the chart, which is drawn only
// above bandTop (see finalizeVideo).
function drawLogo(ctx: CanvasRenderingContext2D, width: number, bandTop: number, canvasHeight: number) {
  const logoImg = isDarkTheme() ? logoWhiteImg : logoBlackImg
  if (!logoImg.complete || logoImg.naturalWidth === 0) return
  const bandHeight = canvasHeight - bandTop
  let logoHeight = bandHeight * 0.6
  let logoWidth = logoHeight * LOGO_ASPECT
  const maxWidth = width * 0.42
  if (logoWidth > maxWidth) {
    logoWidth = maxWidth
    logoHeight = logoWidth / LOGO_ASPECT
  }
  const x = (width - logoWidth) / 2
  const y = bandTop + (bandHeight - logoHeight) / 2
  ctx.drawImage(logoImg, x, y, logoWidth, logoHeight)
}

// --- Optional title band, added at finalize time if given --------------

function wrapTitleLines(ctx: CanvasRenderingContext2D, title: string, maxWidth: number): string[] {
  const words = title.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

// Draws the title centered inside its own reserved band (y=0 to bandHeight)
// — never on top of the chart, which is placed below this band. Text
// color follows the band's own background (the chart's real background
// color, same as everywhere else) rather than a fixed white, which would
// vanish against a light theme.
function drawTitleInBand(ctx: CanvasRenderingContext2D, title: string, width: number, bandHeight: number, bandBackground: string) {
  const maxFontSize = Math.round(bandHeight * 0.32)
  let fontSize = maxFontSize
  let lines: string[] = []
  // Shrink the font until the wrapped title actually fits the band's
  // height, rather than a fixed size that could overflow a long title.
  for (; fontSize >= 12; fontSize -= 2) {
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`
    lines = wrapTitleLines(ctx, title, width * 0.9)
    const lineHeight = fontSize * 1.3
    if (lines.length * lineHeight <= bandHeight * 0.86) break
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lineHeight = fontSize * 1.3
  const totalTextHeight = lines.length * lineHeight
  const startY = (bandHeight - totalTextHeight) / 2 + lineHeight / 2
  ctx.fillStyle = contrastTextColorForColor(bandBackground)
  lines.forEach((line, i) => ctx.fillText(line, width / 2, startY + i * lineHeight))
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface FinalizeOptions {
  title: string | null
  includeLogo: boolean
}

// Re-encodes an already-recorded clip with an optional title band and/or
// logo added — done as a second pass (replay the recorded blob through a
// <video>, redraw each frame onto a fresh canvas of the same size with the
// original frame uniformly scaled down into whatever space is left plus
// the requested band(s) drawn in, re-capture that) rather than during the
// original recording, since both are only decided *after* recording
// finishes. Scaling uniformly (never stretching) and letterboxing with the
// chart's own background color means the chart itself never looks any
// different, just smaller when a band is added.
function finalizeVideo(sourceBlob: Blob, options: FinalizeOptions, mimeType: string, backgroundColor: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const sourceUrl = URL.createObjectURL(sourceBlob)
    video.src = sourceUrl

    video.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error('Failed to load recorded video for finalizing'))
    }

    video.onloadedmetadata = () => {
      const srcWidth = video.videoWidth
      const srcHeight = video.videoHeight
      const canvas = document.createElement('canvas')
      canvas.width = srcWidth
      canvas.height = srcHeight
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) {
        URL.revokeObjectURL(sourceUrl)
        return reject(new Error('2D canvas context unavailable'))
      }

      const titleBandHeight = options.title ? Math.round(srcHeight * TITLE_BAND_FRACTION) : 0
      const logoBandHeight = options.includeLogo ? Math.round(srcHeight * LOGO_BAND_FRACTION) : 0
      const availableHeight = srcHeight - titleBandHeight - logoBandHeight
      const scale = availableHeight / srcHeight
      const scaledWidth = srcWidth * scale
      const offsetX = (srcWidth - scaledWidth) / 2

      const stream = canvas.captureStream(CAPTURE_FPS)
      const outRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      const outChunks: Blob[] = []
      outRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) outChunks.push(e.data)
      }
      outRecorder.onstop = () => {
        URL.revokeObjectURL(sourceUrl)
        resolve(new Blob(outChunks, { type: mimeType }))
      }

      let rafId: number | null = null
      const drawFrame = () => {
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, srcWidth, srcHeight)
        // The already-recorded frame, uniformly scaled down (never
        // stretched) and placed below the title band / above the logo
        // band, whichever are present.
        ctx.drawImage(video, offsetX, titleBandHeight, scaledWidth, availableHeight)
        if (options.title) drawTitleInBand(ctx, options.title, srcWidth, titleBandHeight, backgroundColor)
        if (options.includeLogo) drawLogo(ctx, srcWidth, titleBandHeight + availableHeight, srcHeight)
        if (!video.ended) rafId = requestAnimationFrame(drawFrame)
      }
      video.onended = () => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        outRecorder.stop()
      }

      outRecorder.start()
      video
        .play()
        .then(drawFrame)
        .catch((err) => {
          URL.revokeObjectURL(sourceUrl)
          reject(err)
        })
    }
  })
}

interface PendingRecording {
  blob: Blob
  mimeType: string
  filename: string
}

export function useSvgRecorder(svgRef: React.RefObject<SVGSVGElement | null>, filenameBase: string) {
  const [recording, setRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [awaitingFinalize, setAwaitingFinalize] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const loopTimerRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const aspectRef = useRef<RecordAspect>('landscape')
  const bgColorRef = useRef('#ffffff')
  const pendingRef = useRef<PendingRecording | null>(null)

  // Renders exactly one frame onto the canvas; resolves once it's actually
  // painted. Used both to pre-warm the canvas before recording starts (so
  // the video doesn't open on a blank/incomplete first frame while the
  // very first async image decode is still in flight) and, in a loop, for
  // every frame while recording. No logo/title here — those are only ever
  // added at finalize time (see finalizeVideo), since whether to include
  // the logo and what the title should be are both asked after the fact.
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
        const edge = findRevealEdgeX(svg)
        if (edge !== null) {
          srcX = Math.min(Math.max(0, edge - srcWidth * TRACK_POSITION_FRACTION), Math.max(0, naturalWidth - srcWidth))
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
      const resolvedBg = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff'
      bgColorRef.current = resolvedBg

      const img = new Image()
      const proceed = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      img.onload = () => {
        // alpha:false already makes every pixel fully opaque, but the fill
        // still matters so the chart's own background shows through
        // wherever the SVG itself is transparent (empty margins etc).
        ctx.fillStyle = resolvedBg
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
    // setTimeout, not requestAnimationFrame: rAF callbacks are throttled to
    // near-zero (often fully paused) by the browser the moment a tab isn't
    // the focused/visible one — which used to mean a recording silently
    // stopped updating (and so came out with a frozen, cut-off-looking
    // tail) the instant you looked away or switched tabs while it ran.
    // setTimeout keeps firing in a background tab, so the recording keeps
    // progressing regardless of whether the tab is actively being watched.
    if (recorderRef.current?.state === 'recording') {
      loopTimerRef.current = window.setTimeout(() => loop(), 1000 / CAPTURE_FPS)
    }
  }, [drawOnce])

  const start = useCallback(async (aspect: RecordAspect = 'landscape') => {
    const svg = svgRef.current
    if (!svg || recorderRef.current) return

    aspectRef.current = aspect
    const canvas = document.createElement('canvas')
    canvasRef.current = canvas
    // Pre-warm: paint a real frame before the recorder (and its capture
    // timer) starts, so the saved video doesn't open on a blank frame
    // while the first async SVG-decode is still in flight.
    await drawOnce()

    const stream = canvas.captureStream(CAPTURE_FPS)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const rawBlob = new Blob(chunksRef.current, { type: mimeType })
      const aspectSuffix = aspectRef.current === 'landscape' ? '' : `_${aspectRef.current}`
      pendingRef.current = { blob: rawBlob, mimeType, filename: `${filenameBase}${aspectSuffix}.webm` }
      // Asked here — after the recording is done, before it's saved —
      // rather than up front, since neither the title nor whether to
      // include the logo need to be decided in advance. See
      // RecordFinalizeModal, rendered by RecordControls when this is true.
      setAwaitingFinalize(true)
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
    if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current)
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
  }, [])

  // Called by RecordFinalizeModal's Cancel — discards the recording
  // entirely rather than downloading it.
  const cancelFinalize = useCallback(() => {
    pendingRef.current = null
    setAwaitingFinalize(false)
  }, [])

  // Called by RecordFinalizeModal's Download button.
  const submitFinalize = useCallback(async (options: FinalizeOptions) => {
    const pending = pendingRef.current
    pendingRef.current = null
    setAwaitingFinalize(false)
    if (!pending) return

    const title = options.title?.trim() || null
    if (!title && !options.includeLogo) {
      downloadBlob(pending.blob, pending.filename)
      return
    }

    setProcessing(true)
    try {
      const finalBlob = await finalizeVideo(pending.blob, { title, includeLogo: options.includeLogo }, pending.mimeType, bgColorRef.current)
      downloadBlob(finalBlob, pending.filename)
    } catch (err) {
      console.error('Failed to finalize video — downloading the plain recording instead', err)
      downloadBlob(pending.blob, pending.filename)
    } finally {
      setProcessing(false)
    }
  }, [])

  return { recording, elapsedSeconds, processing, awaitingFinalize, submitFinalize, cancelFinalize, start, stop }
}
