/**
 * Conventional colours for anatomical parts (Christian, 2026-11-27: "use the conventional colors like arteries are red
 * and veins are blue, don't impose our theme colors on them").
 *
 * The convention, as published (looked up, not written from memory):
 *   - red arteries, blue veins, yellow nerves: "The established convention of red for arteries, blue for veins, and
 *     yellow for nerves" (Alberta Medical Association, "Red, blue and yellow: the use of color in anatomical
 *     illustration", 2015, https://www.albertadoctors.org/5683.aspx).
 *   - the colour follows the oxygen in the blood, so the pulmonary vessels are the other way round: pulmonary arteries
 *     blue, pulmonary veins red (DocCheck, "Artery and vein", https://www.doccheck.com/en/detail/photos/6573-artery-and-vein;
 *     Delta Education, "Improving visual learning in anatomy", https://delta-sci.com/blog/improving-visual-anatomy-learning).
 *   - brown muscles, white and beige bones (Delta Education, same page).
 * Organs have no single published colour, so they keep the lab's own neutral model colours.
 *
 * Which part is which is read from the words in the data (content/visuals/anatomy-*.json: each structure's name and
 * group, and its system), never decided here from anatomy. That makes this a DRAFT colouring: a vessel whose name does
 * not say what it is, or a pulmonary vessel named without the word, can come out wrong, and Christian reviews it with
 * the labels. To change a colour, edit the tokens (`--anatomy-*` in src/styles/tokens.css); to change which words mean
 * what, edit the lists below.
 */

export type AnatomyTint = 'artery' | 'vein' | 'nerve' | 'muscle';

/** The colour token for each tint. Bones and organs have none: they use the lab's model colours. */
export const TINT_TOKEN: Record<AnatomyTint, string> = {
  artery: '--anatomy-artery',
  vein: '--anatomy-vein',
  nerve: '--anatomy-nerve',
  muscle: '--anatomy-muscle',
};

const ARTERY_WORDS = /\b(artery|arteries|arterial|aorta|aortic)\b/;
const VEIN_WORDS = /\b(vein|veins|venous|vena cava|venae cavae|vena)\b/;
const NERVE_WORDS = /\b(nerve|nerves|ganglion|ganglia|plexus)\b/;
const PULMONARY_WORDS = /\bpulmonary\b/;

/** The system keys (the end of each, e.g. "anatomy-lungs") that set a colour for everything in them. */
const LUNG_SYSTEM = /(^|-)lungs$/;
const MUSCLE_SYSTEM = /(^|-)muscle$/;
const NERVE_SYSTEM = /(^|-)nerves$/;

/**
 * The conventional tint for one structure, or null to keep the lab's own model colour.
 * `name` and `group` are the structure's own words from the data file; `systemKey` is its system's key.
 */
export function conventionalTint(systemKey: string, name: string, group: string | undefined): AnatomyTint | null {
  const own = name.toLowerCase();
  const words = `${own} ${(group ?? '').toLowerCase()}`;
  // A structure's own name decides before its group's name does.
  const artery = ARTERY_WORDS.test(own) || (!VEIN_WORDS.test(own) && ARTERY_WORDS.test(words));
  const vein = !artery && VEIN_WORDS.test(words);
  if (artery || vein) {
    // The pulmonary vessels carry the other kind of blood, so they take the other colour.
    const pulmonary = PULMONARY_WORDS.test(words) || LUNG_SYSTEM.test(systemKey);
    return artery === pulmonary ? 'vein' : 'artery';
  }
  if (NERVE_WORDS.test(words) || NERVE_SYSTEM.test(systemKey)) return 'nerve';
  if (MUSCLE_SYSTEM.test(systemKey)) return 'muscle';
  return null;
}
