#!/usr/bin/env node
// Exports a Replay panel's animation as a high-resolution video.
//
// Drives the panel exactly the way a pop-out window is driven from the
// main Replay dashboard (see src/dashboard/popout.ts and ReplayApp.tsx's
// PoppedOutPanel): open the same route with ?dashPanel=<kind>, then push
// {current, playing, speed} onto the `replay-clock:{sessionId}`
// BroadcastChannel. Doing it that way (rather than driving the actual
// play button) lets us render every frame on its own with no time
// pressure, so the output is perfectly smooth and can be any resolution,
// regardless of how the chart performs in real-time playback.
//
// Usage:
//   npm install                       # once, pulls in playwright
//   npx playwright install chromium   # once, downloads the browser
//   node scripts/export-replay-video.mjs --session 1657 --out imola-battle.mp4
//
// Common flags (all optional):
//   --panel <kind>       Panel to record (default: lap-position)
//   --car <number>       Car number, for car-scoped panels (e.g. car-pace)
//   --type <sessionType> race|qualifying|practice|test (default: race)
//   --title <string>     Shown in the page's own title bar, cosmetic only
//   --start <seconds>     Race-elapsed start time (default: 0)
//   --end <seconds>       Race-elapsed end time (default: last lap's time)
//   --video-seconds <n>   Output video length in seconds (default: 60)
//   --fps <n>             Output frame rate (default: 30)
//   --width / --height    Output resolution in px (default: 1920x1080)
//   --scale <n>           Device scale factor, for extra crispness (default: 1)
//   --theme <dark|light>  Force a theme (default: whatever the app defaults to)
//   --crf <n>             x264 quality, lower = higher quality/bigger file (default: 16)
//   --keep-frames         Don't delete the intermediate PNG frames
//   --api-base <url>      Backend base URL (default: https://ontheapex-api.fly.dev)
//   --port <n>            Local dev server port (default: 5173)

import { chromium } from 'playwright'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Shelling out to curl instead of using Node's own fetch: curl picks up
// standard proxy env vars (HTTPS_PROXY etc) on every platform without
// extra config, which matters in some sandboxed/corporate network setups
// where Node's fetch doesn't route through the same proxy automatically.
function curlJson(url) {
  const result = spawnSync('curl', ['-fsS', url], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 })
  if (result.status !== 0) throw new Error(`curl ${url} failed: ${result.stderr}`)
  return JSON.parse(result.stdout)
}

function curlOk(url) {
  const result = spawnSync('curl', ['-fsS', '-o', '/dev/null', '-w', '%{http_code}', url], { encoding: 'utf8' })
  return result.status === 0
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      i++
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

if (!args.session) {
  console.error('Usage: node scripts/export-replay-video.mjs --session <id> --out <file.mp4> [options]')
  process.exit(1)
}

const sessionId = String(args.session)
const panel = args.panel ?? 'lap-position'
const carNumber = args.car ?? null
const sessionType = args.type ?? 'race'
const title = args.title ?? 'Replay'
const videoSeconds = Number(args['video-seconds'] ?? 60)
const fps = Number(args.fps ?? 30)
const width = Number(args.width ?? 1920)
const height = Number(args.height ?? 1080)
const scale = Number(args.scale ?? 1)
const theme = args.theme ?? null
const crf = Number(args.crf ?? 16)
const keepFrames = Boolean(args['keep-frames'])
const apiBase = args['api-base'] ?? 'https://ontheapex-api.fly.dev'
const port = Number(args.port ?? 5173)
const outFile = path.resolve(args.out ?? `replay-${sessionId}-${panel}.mp4`)

async function fetchSessionDuration() {
  const pageSize = 5000
  let offset = 0
  let maxTime = 0
  for (;;) {
    const rows = curlJson(`${apiBase}/api/sessions/${sessionId}/laps?limit=${pageSize}&offset=${offset}`)
    for (const row of rows) {
      if (typeof row.elapsed_seconds === 'number' && row.elapsed_seconds > maxTime) maxTime = row.elapsed_seconds
    }
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return maxTime
}

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (curlOk(url)) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error(`dev server didn't come up within ${timeoutMs}ms`))
      setTimeout(attempt, 300)
    }
    attempt()
  })
}

async function main() {
  const start = Number(args.start ?? 0)
  const end = args.end !== undefined ? Number(args.end) : await fetchSessionDuration()
  if (!(end > start)) throw new Error(`Nothing to record: end (${end}) must be greater than start (${start})`)

  console.log(`Recording session ${sessionId} (${panel}${carNumber ? ` #${carNumber}` : ''}), ${start}s -> ${end}s of race time into ${videoSeconds}s of video at ${fps}fps, ${width}x${height}${scale !== 1 ? ` @${scale}x` : ''}`)

  const externalServerUrl = args['server-url']
  let dev = null
  const baseUrl = externalServerUrl || `http://localhost:${port}`
  if (!externalServerUrl) {
    console.log('Starting local dev server...')
    dev = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], {
      stdio: 'ignore',
      detached: true,
    })
  } else {
    console.log(`Using already-running dev server at ${baseUrl}`)
  }
  try {
    await waitForServer(baseUrl)

    const framesDir = mkdtempSync(path.join(tmpdir(), 'replay-frames-'))
    console.log(`Frames -> ${framesDir}`)

    // Pinned executablePath avoids Playwright trying to fetch/verify a
    // browser build over the network — harmless to omit on a normal
    // machine where `npx playwright install chromium` already put the
    // browser wherever Playwright expects it.
    const pinnedChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
    const browser = await chromium.launch(pinnedChromium ? { executablePath: pinnedChromium } : {})
    try {
      // Picked up automatically if set (e.g. a corporate/sandboxed network) —
      // Chromium doesn't inherit HTTPS_PROXY from the environment the way
      // curl does, so it has to be handed to Playwright explicitly.
      const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: scale,
        ...(proxyUrl ? { proxy: { server: proxyUrl, bypass: 'localhost,127.0.0.1' } } : {}),
      })
      if (theme) {
        await context.addInitScript((t) => window.localStorage.setItem('theme', t), theme)
      }
      const page = await context.newPage()

      const params = new URLSearchParams({ session: sessionId, title, type: sessionType, dashPanel: panel })
      if (carNumber) params.set('dashCar', carNumber)
      await page.goto(`${baseUrl}/replay?${params.toString()}`, { waitUntil: 'networkidle' })

      const panelSelector = '.replay-leaderboard-panel'
      await page.waitForSelector(`${panelSelector} svg`, { timeout: 30000 })

      const frameCount = Math.max(2, Math.round(videoSeconds * fps))
      const channelName = `replay-clock:${sessionId}`

      for (let i = 0; i < frameCount; i++) {
        const t = start + (end - start) * (i / (frameCount - 1))
        await page.evaluate(
          ({ channelName, current }) => {
            new BroadcastChannel(channelName).postMessage({ current, playing: false, speed: 1 })
          },
          { channelName, current: t },
        )
        // Two rAFs: one for React's state update to commit, one for the
        // browser to actually paint it, before we screenshot.
        await page.evaluate(
          () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )
        const frameFile = path.join(framesDir, `frame-${String(i).padStart(6, '0')}.png`)
        await page.locator(panelSelector).screenshot({ path: frameFile })
        if (i % 30 === 0 || i === frameCount - 1) {
          process.stdout.write(`\r  frame ${i + 1}/${frameCount} (t=${t.toFixed(1)}s)`)
        }
      }
      process.stdout.write('\n')
    } finally {
      await browser.close()
    }

    console.log('Encoding video with ffmpeg...')
    const ffmpeg = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-framerate', String(fps),
        '-i', path.join(framesDir, 'frame-%06d.png'),
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'slow',
        '-crf', String(crf),
        outFile,
      ],
      { stdio: 'inherit' },
    )
    if (ffmpeg.status !== 0) throw new Error('ffmpeg failed — is it installed? (brew install ffmpeg / apt install ffmpeg)')

    if (!keepFrames) rmSync(framesDir, { recursive: true, force: true })
    else console.log(`Frames kept at ${framesDir}`)

    console.log(`Done -> ${existsSync(outFile) ? outFile : '(ffmpeg reported success but output file missing?)'}`)
  } finally {
    if (dev) {
      try {
        process.kill(-dev.pid)
      } catch {
        // already exited
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
