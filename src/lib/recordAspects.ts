import type { RecordAspect } from '../hooks/useSvgRecorder'

// Shared between RecordControls (the picker, before recording) and
// RecordFinalizeModal (the tab bar, after recording) so the two always
// agree on labels.
export const ASPECT_OPTIONS: { value: RecordAspect; label: string; shortLabel: string }[] = [
  { value: 'landscape', label: 'Landscape (16:9)', shortLabel: 'Landscape' },
  { value: 'portrait', label: 'Portrait (9:16) — Reels/Shorts/Stories', shortLabel: 'Portrait 9:16' },
  { value: 'square', label: 'Square (1:1)', shortLabel: 'Square' },
  { value: 'portrait-4-5', label: 'Portrait (4:5) — feed post', shortLabel: 'Portrait 4:5' },
]
