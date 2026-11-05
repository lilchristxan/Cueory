/**
 * Where a structure sits in the body (Task 178, part B). Pure functions over a system's labels; no three.js, no DOM.
 *
 * Every name here comes from the source file (BodyParts3D's own names): nothing is invented. A label's `group` is the
 * PART-OF concept that heads it in the list, and an optional `parents` field (written by scripts/build-anatomy.mjs on
 * a rebuild) gives the full PART-OF ancestry, root first. Until a rebuild supplies `parents`, the breadcrumb is built
 * by following the `group` chain: a group that is itself a label continues the chain; one that is not is the root
 * (for example "human body").
 */

export interface HierarchyLabel {
  id: string;
  text: string;
  group?: string;
  /** Full PART-OF ancestry, names only, root first, as the source file gives it. */
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
export function breadcrumb(labels: readonly HierarchyLabel[], id: string): string[] {
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
