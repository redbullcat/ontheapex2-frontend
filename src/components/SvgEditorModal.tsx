import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  buildEditableSvg,
  discoverToggleGroups,
  GHOST_STYLE_CSS,
  serializeForExport,
  setBackgroundVisible,
  setBodyFont,
  setGroupVisible,
  setTitle,
  downloadSvgString,
  type ToggleGroup,
} from '../lib/ghostSvgTheme'
import {
  SVG_EDITOR_FONT_FAMILIES,
  stylesForSvgEditorFamily,
  type SvgEditorFontFamily,
} from '../lib/svgEditorFonts'
import {
  FALLBACK_DEFAULTS,
  getSvgEditorDefaults,
  hasSvgEditorDefaults,
  saveSvgEditorDefaults,
  type SvgEditorDefaults,
} from '../lib/svgEditorDefaults'

interface Settings {
  titleText: string
  titleFontFamily: SvgEditorFontFamily
  titleFontWeight: number
  titleItalic: boolean
  titleFontSize: number
  bodyFontFamily: SvgEditorFontFamily | null
  hiddenGroups: string[]
  backgroundVisible: boolean
}

function defaultsToSettings(d: SvgEditorDefaults, titleText: string): Settings {
  return { titleText, ...d }
}

function applySettings(svg: SVGSVGElement, baseWidth: number, baseHeight: number, groups: ToggleGroup[], s: Settings) {
  setTitle(svg, baseHeight, baseWidth, s.titleText.trim() ? {
    text: s.titleText,
    fontFamily: s.titleFontFamily,
    fontWeight: s.titleFontWeight,
    italic: s.titleItalic,
    fontSize: s.titleFontSize,
  } : null)
  setBodyFont(svg, s.bodyFontFamily)
  for (const g of groups) setGroupVisible(svg, g.selector, !s.hiddenGroups.includes(g.key))
  setBackgroundVisible(svg, s.backgroundVisible)
}

export function SvgEditorModal({
  filename,
  initialWidth,
  renderChart,
  onClose,
}: {
  filename: string
  initialWidth: number
  renderChart: (forcedWidth: number, onRendered: (svg: SVGSVGElement) => void) => ReactNode
  onClose: () => void
}) {
  const [chartWidth, setChartWidth] = useState(() => Math.max(320, Math.round(initialWidth) || 800))
  const [widthInput, setWidthInput] = useState(String(chartWidth))

  const initialDefaults = useMemo(() => getSvgEditorDefaults() ?? FALLBACK_DEFAULTS, [])
  const [settings, setSettings] = useState<Settings>(() => defaultsToSettings(initialDefaults, ''))
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const [availableGroups, setAvailableGroups] = useState<ToggleGroup[]>([])
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectionVersion, setSelectionVersion] = useState(0)
  const [overwriteConfirm, setOverwriteConfirm] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle')

  const svgRef = useRef<SVGSVGElement | null>(null)
  const baseSizeRef = useRef({ width: chartWidth, height: 400 })
  const previewHostRef = useRef<HTMLDivElement | null>(null)

  // Stable identity is required: this is handed to an off-screen chart
  // instance as its `onRendered` prop, which sits in that chart's own D3
  // draw-effect dependency array. A fresh function reference every render
  // (e.g. from an inline arrow here) would change that dependency on every
  // SvgEditorModal re-render, re-running the chart's draw effect, which
  // calls this again, which re-renders the modal — an infinite loop.
  const handleRendered = useCallback((liveSvg: SVGSVGElement) => {
    const { svg, width, height } = buildEditableSvg(liveSvg)
    svgRef.current = svg
    baseSizeRef.current = { width, height }
    const groups = discoverToggleGroups(svg)
    setAvailableGroups(groups)
    applySettings(svg, width, height, groups, settingsRef.current)

    const host = previewHostRef.current
    if (host) {
      host.innerHTML = ''
      host.appendChild(svg)
    }
    setSelectedId(null)
  }, [])

  // Any editor setting change mutates the already-mounted preview SVG
  // in place, imperatively — never rebuilds it from the off-screen chart.
  // Rebuilding would lose any text a user hand-edited by clicking an
  // element, since it discards the current DOM in favor of a fresh clone
  // of the (unrelated) off-screen source. Only a real reflow (chart width
  // change, which re-runs the chart's own D3 draw and calls
  // handleRendered again) legitimately needs a fresh clone — labels and
  // positions can genuinely change with the data layout at a new width.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const { width, height } = baseSizeRef.current
    applySettings(svg, width, height, availableGroups, settings)
  }, [settings, availableGroups])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element)?.closest?.('[data-gse-id]')
      if (target && target.tagName.toLowerCase() === 'text') {
        setSelectedId(target.getAttribute('data-gse-id'))
      } else {
        setSelectedId(null)
      }
    }
    const host = previewHostRef.current
    host?.addEventListener('click', onClick)
    return () => host?.removeEventListener('click', onClick)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const commitWidth = () => {
    const n = Math.round(Number(widthInput))
    if (Number.isFinite(n) && n >= 320 && n <= 4000) setChartWidth(n)
    else setWidthInput(String(chartWidth))
  }

  const selectedNode =
    selectedId && svgRef.current ? svgRef.current.querySelector(`[data-gse-id="${selectedId}"]`) : null

  const bumpSelection = () => setSelectionVersion((v) => v + 1)
  void selectionVersion // read for its re-render side-effect only

  const handleDownload = () => {
    if (!svgRef.current) return
    downloadSvgString(serializeForExport(svgRef.current), filename)
  }

  const handleCopy = async () => {
    if (!svgRef.current) return
    try {
      await navigator.clipboard.writeText(serializeForExport(svgRef.current))
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 1800)
    } catch {
      // Clipboard permission denied or unavailable — the download button
      // still works, so this is a silent no-op rather than an error state.
    }
  }

  const doSaveDefaults = () => {
    const { titleText: _titleText, ...persisted } = settings
    void _titleText
    saveSvgEditorDefaults(persisted)
    setOverwriteConfirm(false)
  }

  const handleSaveDefaults = () => {
    if (hasSvgEditorDefaults()) setOverwriteConfirm(true)
    else doSaveDefaults()
  }

  const titleStyleOptions = stylesForSvgEditorFamily(settings.titleFontFamily)

  return (
    <div className="svg-editor-overlay" role="dialog" aria-modal="true">
      <div
        aria-hidden
        style={{ position: 'fixed', left: -99999, top: 0, width: chartWidth, pointerEvents: 'none' }}
      >
        {renderChart(chartWidth, handleRendered)}
      </div>

      <style>{GHOST_STYLE_CSS}</style>

      <div className="svg-editor-modal">
        <div className="svg-editor-header">
          <h2>Edit as SVG</h2>
          <button type="button" className="svg-editor-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="svg-editor-body">
          <div className="svg-editor-sidebar">
            <section>
              <h3>Width</h3>
              <div className="svg-editor-row">
                <input
                  type="range"
                  min={320}
                  max={2400}
                  value={chartWidth}
                  onChange={(e) => {
                    setChartWidth(Number(e.target.value))
                    setWidthInput(e.target.value)
                  }}
                />
                <input
                  type="number"
                  value={widthInput}
                  onChange={(e) => setWidthInput(e.target.value)}
                  onBlur={commitWidth}
                  onKeyDown={(e) => e.key === 'Enter' && commitWidth()}
                />
                <span>px</span>
              </div>
            </section>

            <section>
              <h3>Title</h3>
              <input
                type="text"
                placeholder="Chart title (optional)"
                value={settings.titleText}
                onChange={(e) => setSettings((s) => ({ ...s, titleText: e.target.value }))}
              />
              <div className="svg-editor-row">
                <select
                  value={settings.titleFontFamily}
                  onChange={(e) => setSettings((s) => ({ ...s, titleFontFamily: e.target.value as SvgEditorFontFamily }))}
                >
                  {SVG_EDITOR_FONT_FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select
                  value={`${settings.titleFontWeight}${settings.titleItalic ? '-i' : ''}`}
                  onChange={(e) => {
                    const italic = e.target.value.endsWith('-i')
                    const weight = Number(e.target.value.replace('-i', ''))
                    setSettings((s) => ({ ...s, titleFontWeight: weight, titleItalic: italic }))
                  }}
                >
                  {titleStyleOptions.map((o) => (
                    <option key={`${o.weight}${o.italic ? '-i' : ''}`} value={`${o.weight}${o.italic ? '-i' : ''}`}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={10}
                  max={96}
                  value={settings.titleFontSize}
                  onChange={(e) => setSettings((s) => ({ ...s, titleFontSize: Number(e.target.value) || s.titleFontSize }))}
                />
              </div>
            </section>

            <section>
              <h3>Chart text font</h3>
              <select
                value={settings.bodyFontFamily ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, bodyFontFamily: (e.target.value || null) as SvgEditorFontFamily | null }))
                }
              >
                <option value="">Original</option>
                {SVG_EDITOR_FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <p className="svg-editor-hint">
                To resize an individual label, click it in the preview.
              </p>
            </section>

            {(availableGroups.length > 0 || true) && (
              <section>
                <h3>Chart elements</h3>
                {availableGroups.map((g) => (
                  <label key={g.key} className="svg-editor-checkbox">
                    <input
                      type="checkbox"
                      checked={!settings.hiddenGroups.includes(g.key)}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          hiddenGroups: e.target.checked
                            ? s.hiddenGroups.filter((k) => k !== g.key)
                            : [...s.hiddenGroups, g.key],
                        }))
                      }
                    />
                    {g.label}
                  </label>
                ))}
                <label className="svg-editor-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.backgroundVisible}
                    onChange={(e) => setSettings((s) => ({ ...s, backgroundVisible: e.target.checked }))}
                  />
                  Background
                </label>
                <p className="svg-editor-hint">
                  Chart traces and data marks can't be edited here — remove cars/filters in the app itself.
                </p>
              </section>
            )}

            <section>
              <h3>Theme preview</h3>
              <div className="color-mode-toggle" role="radiogroup" aria-label="Preview theme">
                <button type="button" className={previewTheme === 'light' ? 'active' : ''} onClick={() => setPreviewTheme('light')}>
                  Light
                </button>
                <button type="button" className={previewTheme === 'dark' ? 'active' : ''} onClick={() => setPreviewTheme('dark')}>
                  Dark
                </button>
              </div>
            </section>

            {selectedNode && (
              <section>
                <h3>Selected label</h3>
                <input
                  type="text"
                  value={selectedNode.textContent ?? ''}
                  onChange={(e) => {
                    selectedNode.textContent = e.target.value
                    bumpSelection()
                  }}
                />
                <div className="svg-editor-row">
                  <select
                    value={selectedNode.getAttribute('font-family') ?? ''}
                    onChange={(e) => {
                      selectedNode.setAttribute('font-family', e.target.value)
                      bumpSelection()
                    }}
                  >
                    <option value="">Original</option>
                    {SVG_EDITOR_FONT_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={6}
                    max={96}
                    value={Number(selectedNode.getAttribute('font-size')) || 12}
                    onChange={(e) => {
                      selectedNode.setAttribute('font-size', e.target.value)
                      bumpSelection()
                    }}
                  />
                </div>
              </section>
            )}

            <section className="svg-editor-actions">
              <button type="button" onClick={handleDownload}>
                Download SVG
              </button>
              <button type="button" onClick={handleCopy}>
                {copyStatus === 'copied' ? 'Copied!' : 'Copy SVG code'}
              </button>
              <button type="button" onClick={handleSaveDefaults}>
                Save as default
              </button>
            </section>
          </div>

          <div className={`svg-editor-preview svg-editor-preview-${previewTheme}`} data-theme={previewTheme}>
            <div ref={previewHostRef} className="svg-editor-preview-host" />
          </div>
        </div>
      </div>

      {overwriteConfirm && (
        <div className="svg-editor-confirm-overlay">
          <div className="svg-editor-confirm">
            <p>You already have saved SVG editor defaults. Overwrite them with the current settings?</p>
            <div className="svg-editor-row">
              <button type="button" onClick={() => setOverwriteConfirm(false)}>
                Cancel
              </button>
              <button type="button" onClick={doSaveDefaults}>
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
