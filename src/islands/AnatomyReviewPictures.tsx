import { useEffect, useRef, useState } from 'react';
import type { LabScene } from './anatomyscene';

interface Props {
  modelPath: string;
  structureIds: string[];
  title: string;
  credit: string;
}

/** The site's CSP allows data: pictures but intentionally disallows blob: images. */
function pictureDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not prepare the picture.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:image/png;')) {
        reject(new Error('The picture was not a PNG.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate two actual views of the existing GLB on the student's device, only
 * after an explicit tap. No external renderer, file upload, or new anatomy text.
 * The existing export path embeds the required BodyParts3D credit in each PNG.
 */
export default function AnatomyReviewPictures({ modelPath, structureIds, title, credit }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LabScene | null>(null);
  const mounted = useRef(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pictures, setPictures] = useState<{ front: string; side: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const makePictures = async () => {
    if (state === 'loading' || state === 'ready') return;
    const target = canvas.current;
    if (!target) return;
    setState('loading');
    let scene: LabScene | null = null;
    try {
      // Keep three.js and all GLB downloads out of the unopened review page.
      const { createLabScene, readColors } = await import('./anatomyscene');
      if (!mounted.current) return;
      scene = createLabScene({
        canvas: target,
        colors: readColors(),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onRender: () => {},
      });
      sceneRef.current = scene;
      const result = await scene.load(modelPath, structureIds);
      if (!mounted.current || !result || result.found.length === 0) return;

      const front = await scene.exportPicture({
        size: 'square', title: `${title} — front view`, credit,
        labels: [], transparent: false,
      });
      if (!mounted.current) return;

      // glTF models face +Z by convention. A quarter turn gives a genuine
      // side view from the same loaded model, without fetching another GLB.
      scene.orbit(Math.PI / 2, 0);
      const side = await scene.exportPicture({
        size: 'square', title: `${title} — side view`, credit,
        labels: [], transparent: false,
      });
      if (!mounted.current) return;

      const frontUrl = await pictureDataUrl(front.blob);
      if (!mounted.current) return;
      const sideUrl = await pictureDataUrl(side.blob);
      if (!mounted.current) return;
      setPictures({ front: frontUrl, side: sideUrl });
      setState('ready');
    } catch {
      // WebGL, model decode and PNG export can fail on low-memory phones.
      // The complete source-backed structure list remains available below.
      if (mounted.current) setState('error');
    } finally {
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    }
  };

  return (
    <section aria-labelledby="anatomy-review-pictures" className="space-y-4">
      <h2 id="anatomy-review-pictures" className="text-xl text-ink">Front and side pictures</h2>
      <p className="text-sm text-ink-soft">
        Make both pictures from this draft model on your device. No model is downloaded until you choose to load it.
        These pictures are review evidence, not approval to publish.
      </p>
      {state !== 'ready' && (
        <div className="max-w-sm space-y-3">
          <canvas ref={canvas} aria-hidden="true" tabIndex={-1}
            className="aspect-square w-full rounded-lg border border-line bg-page" />
          {state !== 'loading' && (
            <button type="button" onClick={() => void makePictures()}
              className="min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink">
              {state === 'error' ? 'try making pictures again' : 'make front and side pictures'}
            </button>
          )}
        </div>
      )}
      {state === 'loading' && <p role="status" className="text-sm text-ink">loading the model and making pictures…</p>}
      {state === 'error' && (
        <p role="alert" className="text-sm text-ink">
          the pictures could not be made on this device. you can still review every structure name and source below.
        </p>
      )}
      {pictures && (
        <div className="grid gap-6 md:grid-cols-2">
          {([
            { key: 'front', heading: 'Front', image: pictures.front },
            { key: 'side', heading: 'Side', image: pictures.side },
          ] as const).map(({ key, heading, image }) => (
            <figure key={key} className="min-w-0 space-y-2">
              <h3 className="text-lg text-ink">{heading} view</h3>
              <img src={image} alt={`${title}: ${heading.toLowerCase()} view, model review only`}
                width={1080} height={1080} className="h-auto w-full rounded-lg border border-line" />
              <figcaption className="break-words text-sm text-ink-soft">{credit}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
