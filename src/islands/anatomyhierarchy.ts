/**
 * Source hierarchy helpers for the Anatomy Lab (Task 178, part B). Pure functions over labels; no three.js or DOM.
 * BodyParts3D has two distinct relations: PART-OF describes containment; IS-A classifies by kind. Only PART-OF is
 * suitable for a body-location breadcrumb. IS-A paths must not be presented as physical location.
 */

export type HierarchyTree = 'partof' | 'isa';

export interface HierarchyLabel {
  id: string;
  text: string;
  group?: string;
  /** Ancestry names in the declared source tree, root first; the relation is on AnatomySystem.hierarchyTree. */
  parents?: readonly string[];
}

/** Labels by id, and by exact name (the first label with a name wins, so the result is stable). */
function indexLabels(labels: readonly HierarchyLabel[]): { byId: Map<string, HierarchyLabel>; byText: Map<string, HierarchyLabel> } {
  const byId = new Map<string, HierarchyLabel>();
  const byText = new Map<string, HierarchyLabel>();
  for (const label of labels) {
    if (!byId.has(label.id)) byId.set(label.id, label);
    if (!byText.has(label.text)) byText.set(label.text, label);
  }
  return { byId, byText };
}

/**
 * The names from the root of the body down to the structure, the structure's own name last. Prefers the label's
 * `parents` when the file has them; otherwise follows the `group` chain. Unknown id: an empty array. A cycle in the
 * group chain (bad data) stops the walk rather than looping.
 */
export function breadcrumb(labels: readonly HierarchyLabel[], id: string, tree: HierarchyTree = 'partof'): string[] {
  // IS-A ancestors are kinds/classes, not physical locations. Omit this trail instead of mislabeling it.
  if (tree === 'isa') return [];
  const { byId, byText } = indexLabels(labels);
  const label = byId.get(id);
  if (!label) return [];
  if (label.parents && label.parents.length > 0) return [...label.parents, label.text];

  const trail: string[] = [label.text];
  const seen = new Set<string>([label.text]);
  let group = label.group;
  while (group !== undefined && group !== '' && !seen.has(group)) {
    trail.unshift(group);
    seen.add(group);
    group = byText.get(group)?.group;
  }
  return trail;
}

/**
 * The labels whose `group` is the given structure: the structure may be named by id or by its exact name (a root
 * such as "human body" is only a name). File order is kept.
 */
export function children(labels: readonly HierarchyLabel[], nameOrId: string): HierarchyLabel[] {
  const { byId } = indexLabels(labels);
  const name = byId.get(nameOrId)?.text ?? nameOrId;
  return labels.filter((label) => label.group === name && label.id !== nameOrId && label.text !== name);
}

/** The other labels under the same `group`, in file order; a label without a group, or an unknown id, has none. */
export function siblings(labels: readonly HierarchyLabel[], id: string): HierarchyLabel[] {
  const { byId } = indexLabels(labels);
  const label = byId.get(id);
  if (!label || label.group === undefined) return [];
  return labels.filter((other) => other.id !== id && other.group === label.group);
}
