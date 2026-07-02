// Shared categorical slots for class-based coloring, referenced through CSS
// custom properties (--series-1..8, --series-other) so light/dark swap
// happens in one place. See dataviz skill: fixed hue order, never cycled.
export const CLASS_VARS = [
  '--series-1',
  '--series-2',
  '--series-3',
  '--series-4',
  '--series-5',
  '--series-6',
  '--series-7',
  '--series-8',
] as const
export const OTHER_VAR = '--series-other'

export function assignClassVars(classesInOrder: string[]): Map<string, string> {
  const m = new Map<string, string>()
  classesInOrder.forEach((cls, i) => m.set(cls, i < CLASS_VARS.length ? CLASS_VARS[i] : OTHER_VAR))
  return m
}

export const CLASS_COLOR_CSS_VARS = `
  --series-1: #2a78d6;
  --series-2: #1baf7a;
  --series-3: #eda100;
  --series-4: #008300;
  --series-5: #4a3aa7;
  --series-6: #e34948;
  --series-7: #e87ba4;
  --series-8: #eb6834;
  --series-other: #898781;
`

export const CLASS_COLOR_CSS_VARS_DARK = `
  --series-1: #3987e5;
  --series-2: #199e70;
  --series-3: #c98500;
  --series-4: #008300;
  --series-5: #9085e9;
  --series-6: #e66767;
  --series-7: #d55181;
  --series-8: #d95926;
  --series-other: #898781;
`
