// null selection means "everything". Individual chips can be removed to
// narrow it to a Set; resetting goes back to null rather than reconstructing
// the full set by hand. Shared by car and driver filters.
export type EntitySelection = Set<string> | null

export function resolveEntitySelection(selection: EntitySelection, all: string[]): Set<string> {
  return selection ?? new Set(all)
}
