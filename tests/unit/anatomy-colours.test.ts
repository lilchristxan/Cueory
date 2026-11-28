import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { conventionalTint, TINT_TOKEN } from '../../src/islands/anatomycolours';

// Made-up names in the style of the data files: this test is about the word rules, not about anatomy.
describe('conventional colours for anatomical parts', () => {
  it('reads artery, vein and nerve from the words in a structure\'s name or group', () => {
    expect(conventionalTint('anatomy-vessels', 'sample artery', 'systemic artery')).toBe('artery');
    expect(conventionalTint('anatomy-vessels', 'sample vein', 'tributary of sample vein')).toBe('vein');
    expect(conventionalTint('anatomy-heart', 'ascending aorta', 'aorta')).toBe('artery');
    expect(conventionalTint('anatomy-heart', 'superior vena cava', 'human body')).toBe('vein');
    expect(conventionalTint('anatomy-digestive', 'sample branch', 'right portal vein')).toBe('vein');
    expect(conventionalTint('anatomy-digestive', 'sample branch', 'left hepatic artery')).toBe('artery');
    expect(conventionalTint('anatomy-nerves', 'sample nerve', 'nerve trunk')).toBe('nerve');
    expect(conventionalTint('anatomy-vessels', 'sample plexus', undefined)).toBe('nerve');
  });

  it('lets a structure\'s own name win over its group\'s name', () => {
    expect(conventionalTint('anatomy-vessels', 'sample vein', 'branch of sample artery')).toBe('vein');
    expect(conventionalTint('anatomy-vessels', 'sample artery', 'tributary of sample vein')).toBe('artery');
  });

  it('gives the pulmonary vessels the other colour, by the word or by the lungs system', () => {
    expect(conventionalTint('anatomy-vessels', 'right pulmonary artery', 'artery')).toBe('vein');
    expect(conventionalTint('anatomy-vessels', 'sample pulmonary vein', 'vein')).toBe('artery');
    expect(conventionalTint('anatomy-lungs', 'sample lobar vein', 'right upper lobar vein')).toBe('artery');
    expect(conventionalTint('anatomy-lungs', 'sample branch', 'intrapulmonary part of right pulmonary artery')).toBe('vein');
  });

  it('colours a whole system where the convention has one, and leaves bones and organs to the model colours', () => {
    expect(conventionalTint('anatomy-muscle', 'sample muscle', 'muscle of hand')).toBe('muscle');
    expect(conventionalTint('anatomy-nerves', 'sample branch', 'segment of neural tree organ')).toBe('nerve');
    expect(conventionalTint('anatomy-skeleton-axial', 'sample bone', 'flat bone')).toBeNull();
    expect(conventionalTint('anatomy-skeleton-limbs', 'sample bone', 'tarsal bone')).toBeNull();
    expect(conventionalTint('anatomy-nervous', 'sample lobe', 'left frontal lobe')).toBeNull();
    expect(conventionalTint('anatomy-kidneys', 'sample organ', 'urinary system')).toBeNull();
    expect(conventionalTint('anatomy-lungs', 'sample segment', 'upper lobe of left lung')).toBeNull();
    // "vein" inside another word is not the word.
    expect(conventionalTint('anatomy-skin', 'sample veined part', undefined)).toBeNull();
  });

  it('has a colour token for every tint, declared once in tokens.css', () => {
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    for (const token of Object.values(TINT_TOKEN)) {
      expect(tokens.match(new RegExp(`${token}:\\s*#[0-9a-f]{6};`, 'g')), token).toHaveLength(1);
    }
  });
});
