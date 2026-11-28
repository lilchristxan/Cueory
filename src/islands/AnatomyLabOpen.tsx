import { useMemo, useState, type ComponentType } from 'react';
import AnatomyLabCover from './AnatomyLabCover';
import AnatomyTextRecall from './AnatomyTextRecall';
import { decodeAnatomySystem, type AnatomySystemProp } from './anatomy-island-data';
import { systemsForView } from './anatomylayers';
import { coverDownloadNote } from './anatomyviews';
import type { AnatomyLabProps } from './AnatomyLab.tsx';

type AnatomyLabOpenProps = Omit<AnatomyLabProps, 'systems' | 'fixture'> & {
  systems: AnatomySystemProp[];
  fixture: AnatomySystemProp | null;
};

/**
 * The initial island for the anatomy lab page (Task 178): the 3D cover plus lightweight text-only name practice. The 3D lab itself (`AnatomyLab.tsx`, its logic, the
 * study tools and the Supabase client) downloads when the student taps "open the anatomy lab", and three.js only after
 * that. Text practice remains keyboard-accessible without opening 3D, as on staging. The lab then opens
 * itself at once (`autoOpen`): one tap, as before.
 */
export default function AnatomyLabOpen({ systems: encodedSystems, fixture: encodedFixture, ...props }: AnatomyLabOpenProps) {
  const systems = useMemo(() => encodedSystems.map(decodeAnatomySystem), [encodedSystems]);
  const fixture = useMemo(() => encodedFixture && decodeAnatomySystem(encodedFixture), [encodedFixture]);
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

  const wantsFixture = fixture && new URLSearchParams(window.location.search).has('fixture');
  const textSystems = systemsForView(systems, false, wantsFixture ? fixture : null);
  const system = textSystems[0];
  const note = coverDownloadNote(system?.fixture ? null : system?.title ?? null,
    system?.fixture ? undefined : system && props.modelBytes?.[system.key]);
  return (
    <div className="space-y-6">
      {Lab ? <Lab {...props} systems={systems} fixture={fixture} autoOpen onExit={() => { setLab(null); setState('cover'); }} /> : (
        <AnatomyLabCover onOpen={open} busy={state === 'loading'} error={state === 'error'} note={note} />
      )}
      {/* Name practice that needs no 3D view: kept for devices that cannot draw 3D, folded away until asked for. */}
      <details className="rounded-lg border border-line" data-testid="anatomy-text-practice">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm text-ink-soft">practise names without the 3D view</summary>
        <div className="p-2">
          <AnatomyTextRecall systems={textSystems} drafts={props.drafts} />
        </div>
      </details>
    </div>
  );
}
