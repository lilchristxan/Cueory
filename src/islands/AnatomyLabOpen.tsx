import { useState, type ComponentType } from 'react';
import AnatomyLabCover from './AnatomyLabCover';
import type { AnatomyLabProps } from './AnatomyLab';

/**
 * The island the anatomy lab page loads (Task 178): only the cover. The lab itself (`AnatomyLab.tsx`, its logic, the
 * study tools and the Supabase client) downloads when the student taps "open the anatomy lab", and three.js only after
 * that, so the page's initial JavaScript stays within its budget (tests/unit/build-output.test.ts). The lab then opens
 * itself at once (`autoOpen`): one tap, as before.
 */
export default function AnatomyLabOpen(props: AnatomyLabProps) {
  const [Lab, setLab] = useState<ComponentType<AnatomyLabProps> | null>(null);
  const [state, setState] = useState<'cover' | 'loading' | 'error'>('cover');

  const open = () => {
    if (state === 'loading') return;
    setState('loading');
    import('./AnatomyLab').then(
      (module) => setLab(() => module.default),
      () => setState('error'),
    );
  };

  if (Lab) return <Lab {...props} autoOpen />;
  return <AnatomyLabCover onOpen={open} busy={state === 'loading'} error={state === 'error'} />;
}
