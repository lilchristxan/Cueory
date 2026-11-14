/**
 * Founder-only pictures for review sheets. Uses the lab's existing real-model
 * renderer and credited picture export, never unreviewed or generated anatomy.
 * Loading starts only after the reviewer asks for pictures.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { pictureCreditFor, type AnatomySystem } from './anatomylab';
import type { LabScene } from './anatomyscene';

type Status = 'idle' | 'loading' | 'ready' | 'error';
type Pictures = { key: string; front: string; side: string };

/** The current site's strict img-src permits data: but not blob: URLs. */
function imageDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('picture could not be read'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('picture data is unavailable'));
    reader.readAsDataURL(blob);
  });
}

export default function AnatomyReviewPictures({ systems }: { systems: AnatomySystem[] }) {
  const [systemKey, setSystemKey] = useState(systems[0]?.key ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [pictures, setPictures] = useState<Pictures | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LabScene | null>(null);
  const generation = useRef(0);
  const current = systems.find((system) => system.key === systemKey);

  // A new selection or unmount invalidates late model downloads and picture exports.
  const clear = useCallback(() => {
    generation.current += 1;
    sceneRef.current?.dispose();
    sceneRef.current = null;
  }, []);
  useEffect(() => () => clear(), [clear]);

  function choose(event: ChangeEvent<HTMLSelectElement>) {
    clear();
    setPictures(null);
    setStatus('idle');
    setSystemKey(event.target.value);
  }

  async function capture() {
    clear();
    setPictures(null);
    if (!current) return;
    const requested = current;
    const requestId = generation.current;
    setStatus('loading');
    try {
      // Let React expose and size the canvas. A background tab may throttle rAF.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
        window.setTimeout(resolve, 250);
      });
      if (requestId !== generation.current) return;
      const { createLabScene, readColors } = await import('./anatomyscene');
      if (requestId !== generation.current) return;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('canvas not mounted');
      const scene = createLabScene({
        canvas,
        colors: readColors(),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onRender: () => {},
      });
      if (requestId !== generation.current) {
        scene.dispose();
        return;
      }
      sceneRef.current = scene;
      const loaded = await scene.load(requested.model.file, requested.structures.map((item) => item.id));
      if (requestId !== generation.current) return;
      if (!loaded || !loaded.found.length) throw new Error('no matching geometry');
      const shared = {
        size: 'square' as const,
        transparent: false,
        labels: [],
        credit: pictureCreditFor(requested),
      };
      // The model's normal home position is its front (+Z), per the source transform.
      scene.resetView();
      const front = await scene.exportPicture({ ...shared, title: `${requested.title}: front view` });
      if (requestId !== generation.current) return;
      // 90 degrees around the vertical axis gives the same source geometry from the side.
      scene.orbit(Math.PI / 2, 0);
      const side = await scene.exportPicture({ ...shared, title: `${requested.title}: side view` });
      if (requestId !== generation.current) return;
      // Respect the existing strict CSP; never loosen img-src for this review tool.
      const frontUrl = await imageDataUrl(front.blob);
      if (requestId !== generation.current) return;
      const sideUrl = await imageDataUrl(side.blob);
      if (requestId !== generation.current) return;
      setPictures({ key: requested.key, front: frontUrl, side: sideUrl });
      setStatus('ready');
    } catch {
      if (requestId === generation.current) setStatus('error');
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-line p-4" aria-label="model pictures for review">
      <h2 className="text-xl text-ink">front and side model pictures</h2>
      <p className="max-w-prose text-sm text-ink-soft">
        for the founder's draft review only. these pictures use the lab's existing model files and include the source,
        release, licence, and reference-model note. a picture does not approve the model for students.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <label htmlFor="review-picture-system" className="block text-sm text-ink">body system</label>
          <select
            id="review-picture-system"
            value={systemKey}
            onChange={choose}
            className="min-h-11 max-w-full rounded-lg border border-line bg-page p-3 text-ink"
          >
            {systems.map((system) => (
              <option key={system.key} value={system.key}>{system.title} ({system.status})</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line bg-surface px-4 py-3 text-ink"
          onClick={() => void capture()}
          disabled={!current || status === 'loading'}
        >
          make front and side pictures
        </button>
      </div>
      {status === 'loading' && <p role="status" className="text-sm text-ink">loading and drawing both pictures...</p>}
      {status === 'error' && (
        <p role="alert" className="text-sm text-ink">
          the pictures could not be made on this device. check the model in the anatomy lab and try again.
        </p>
      )}
      <canvas
        ref={canvasRef}
        width={420}
        height={420}
        hidden={status === 'idle'}
        aria-label="model view while preparing the review pictures"
        className="aspect-square w-full max-w-prose rounded-lg border border-line bg-page"
      />
      {pictures && pictures.key === systemKey && current && (
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="min-w-0 space-y-2">
            <img src={pictures.front} alt={`Front view of ${current.title}, with BodyParts3D attribution`} className="h-auto w-full rounded-lg border border-line" />
            <figcaption className="text-sm text-ink">front view · {current.title}</figcaption>
          </figure>
          <figure className="min-w-0 space-y-2">
            <img src={pictures.side} alt={`Side view of ${current.title}, with BodyParts3D attribution`} className="h-auto w-full rounded-lg border border-line" />
            <figcaption className="text-sm text-ink">side view · {current.title}</figcaption>
          </figure>
        </div>
      )}
      <p className="text-sm text-ink-soft">
        pictures stay in this tab only. use a screenshot of the pictures and source list for review evidence.
      </p>
    </section>
  );
}
