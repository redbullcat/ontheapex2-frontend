// null selection means "all classes". Individual checkboxes narrow it to a
// Set; clicking "All classes" resets back to null rather than toggling.
export type ClassSelection = Set<string> | null

export function resolveClassSelection(selection: ClassSelection, classes: string[]): Set<string> {
  return selection ?? new Set(classes)
}
