import { useState, type ComponentType } from 'react';
import AnatomyLabCover from './AnatomyLabCover';
import AnatomyTextRecall from './AnatomyTextRecall';
import { systemsForView } from './anatomylayers';
import { coverDownloadNote } from './anatomyviews';
import type { AnatomyLabProps } from './AnatomyLab.tsx';

/**
 * The initial island for the anatomy lab page (Task 178): the 3D cover plus lightweight text-only name practice. The 3D lab itself (`AnatomyLab.tsx`, its logic, the
 * study tools and the Supabase client) downloads when the student taps "open the anatomy lab", and three.js only after
 * that. Text practice remains keyboard-accessible without opening 3D, as on staging. The lab then opens
 * itself at once (`autoOpen`): one tap, as before.
 */
export default function AnatomyLabOpen(props: AnatomyLabProps) {
  const [Lab, setLab] = useState<ComponentType<AnatomyLabProps> | null>(null);
  const [state, setState] = useState<'cover' | 'loading' | 'error'>('cover');

  const open = () => {
    if (state === 'loading') return;
    setState('loading');
    import('./AnatomyLab.tsx').then(
      (module) => setLab(() => module.default),
      () => setState('error'),
    );
  };

  const wantsFixture = props.fixture && new URLSearchParams(window.location.search).has('fixture');
  const textSystems = systemsForView(props.systems, false, wantsFixture ? props.fixture : null);
  const system = textSystems[0];
  const note = coverDownloadNote(system?.fixture ? null : system?.title ?? null,
    system?.fixture ? undefined : system && props.modelBytes?.[system.key]);
  return (
    <div className="space-y-6">
      {Lab ? <Lab {...props} autoOpen /> : (
        <AnatomyLabCover onOpen={open} busy={state === 'loading'} error={state === 'error'} note={note} />
      )}
      <AnatomyTextRecall systems={textSystems} drafts={props.drafts} />
    </div>
  );
}
