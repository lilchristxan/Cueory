import { useEffect, useRef, useState } from 'react';
import type { LabScene } from './anatomyscene';

interface Props {
  modelPath: string;
  structureIds: string[];
  title: string;
  credit: string;
}

/**
 * WebGL projections must be based on the canvas's real laid-out dimensions.
 * A background tab can throttle animation frames, so do not use a single rAF
 * as evidence of layout readiness. Timeout is bounded and always cleans up.
 */
export function waitForReviewCanvasLayout(
  canvas: HTMLCanvasElement,
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (canvas.isConnected && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      resolve();
      return;
    }
    let settled = false;
    let observer: ResizeObserver | null = null;
    let timeout = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      window.clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (canvas.isConnected && canvas.clientWidth > 0 && canvas.clientHeight > 0) finish();
    };
    observer = new ResizeObserver(check);
    observer.observe(canvas);
    timeout = window.setTimeout(
      () => finish(new Error('The model picture canvas is not visible or has no size.')),
      timeoutMs,
    );
    check();
  });
}


/** A stalled model request must not permanently hide the picture retry button. */
const MODEL_LOAD_DEADLINE_MS = 20_000;

/**
 * Reject after a bounded delay and always clear the timer. This does not
 * abort GLTFLoader internally: a timed-out renderer is retired immediately,
 * and late results cannot overwrite the next attempt's pictures.
 */
function boundedModelLoad<T>(request: Promise<T>, timeoutMs = MODEL_LOAD_DEADLINE_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The model took too long to load.')), timeoutMs);
  });
  return Promise.race([request, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
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
      // Wait for measured dimensions, not a guessed frame delay: a hidden
      // browser tab may render its first React frame much later than the tap.
      await waitForReviewCanvasLayout(target);
      if (!mounted.current) return;
      // Keep three.js and all GLB downloads out of the unopened review page.
      const { createLabScene, readColors } = await import('./anatomyscene');
      if (!mounted.current) return;
      if (!target.isConnected || target.clientWidth === 0 || target.clientHeight === 0) {
        throw new Error('The picture view became unavailable.');
      }
      scene = createLabScene({
        canvas: target,
        colors: readColors(),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onRender: () => {},
      });
      sceneRef.current = scene;
      const result = await boundedModelLoad(scene.load(modelPath, structureIds));
      if (!mounted.current) return;
      if (!result || result.found.length === 0) throw new Error('No model geometry was available.');

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
      // Error and unmount must both release the GPU resources. If unmount
      // already disposed this scene, do not dispose it a second time.
      if (scene && sceneRef.current === scene) {
        sceneRef.current = null;
        scene.dispose();
      }
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
