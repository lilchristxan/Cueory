/**
 * The anatomy lab's three.js side (Task 178). This module is imported only after the student taps "open the anatomy
 * lab" (a dynamic import in AnatomyLab.tsx), so nothing from three.js is in the page's first download.
 *
 * Models are .glb files compressed with meshopt (D-58), decoded on the page's own thread: MeshoptDecoder's WebAssembly
 * needs only the CSP's 'wasm-unsafe-eval' (D-49), and its worker mode (blob: workers) is never turned on.
 * Colors come from the brand tokens at runtime (getComputedStyle), so the model follows the Daytime and Evening palettes.
 */
import { spreadBoard } from './anatomyspread';
import * as THREE from 'three';
import { disposeAnatomyMaterials, disposeAnatomyMeshResources, indexAnatomyGroup, summarizeIndexedAnatomyIds } from './anatomymeshindex';
import { withTemporaryMeshAppearance } from './anatomyidpass';
import { createDemandFrameScheduler, remainingIdleDelay } from './anatomyframe';
import { loadModelsOrDispose, uniqueAnatomyModelUrls } from './anatomylazy';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  BEHIND_MARK,
  boxSizeInCameraFrame,
  EXPORT_SIZES,
  cameraForPreset,
  cameraMoveDuration,
  encodeId,
  exportRegion,
  findVisibleAnchors,
  fitDistance,
  focusCamera,
  homePreset,
  labelLines,
  labelRoomFor,
  lerpVec3,
  moveProgress,
  placeLabels,
  pickedStructure,
  pictureTitleLayout,
  postureAngleX,
  preparePictureFonts,
  presetDirection,
  rotateX,
  wrapText,
  type ExportSize,
  type Posture,
  type Rect,
  type Vec3,
  type ViewPreset,
  type VisibilityTarget,
  visibleSelection,
} from './anatomylab';

/** Brand colors the scene and the exported pictures use, read from the tokens in src/styles/tokens.css. */
export interface LabColors {
  page: string;
  surface: string;
  ink: string;
  inkSoft: string;
  line: string;
  model: string;
  modelAlt: string;
  modelSelected: string;
  /** How opaque the other structures are while one is selected. */
  dimAlpha: number;
  /** How opaque a faded structure is (--anatomy-faded-opacity). */
  fadedOpacity: number;
  /** The interface font (--font-body). */
  font: string;
  /** The lab's rim lights (--lab-rim*): color and strength; a strength of 0 means no rim light. */
  rim: string;
  rimStrength: number;
  rimSoft: string;
  rimSoftStrength: number;
  /** The skin's outline (--lab-skin-outline*): color, how tightly it hugs the silhouette, and how strong it is. */
  skinOutline: string;
  skinOutlinePower: number;
  skinOutlineAlpha: number;
}

export function readColors(root: HTMLElement = document.documentElement): LabColors {
  const style = getComputedStyle(root);
  const get = (name: string) => style.getPropertyValue(name).trim();
  const alpha = Number.parseFloat(get('--model-dim-alpha'));
  const faded = Number.parseFloat(get('--anatomy-faded-opacity'));
  const number = (name: string, fallback: number) => {
    const value = Number.parseFloat(get(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    page: get('--color-page'),
    surface: get('--color-surface'),
    ink: get('--color-ink'),
    inkSoft: get('--color-ink-soft'),
    line: get('--color-line'),
    model: get('--color-model'),
    modelAlt: get('--color-model-alt'),
    modelSelected: get('--color-model-selected'),
    dimAlpha: Number.isFinite(alpha) ? alpha : 0.2,
    fadedOpacity: Number.isFinite(faded) ? faded : 0.35,
    font: get('--font-body') || 'sans-serif',
    rim: get('--lab-rim'),
    rimStrength: number('--lab-rim-strength', 0),
    rimSoft: get('--lab-rim-soft'),
    rimSoftStrength: number('--lab-rim-soft-strength', 0),
    skinOutline: get('--lab-skin-outline'),
    skinOutlinePower: number('--lab-skin-outline-power', 2.6),
    skinOutlineAlpha: number('--lab-skin-outline-alpha', 0.55),
  };
}

/** The picture-export sizes, read from the --export-* tokens (src/styles/tokens.css); pixels at `reference`. */
export interface ExportTokens {
  reference: number;
  title: number;
  label: number;
  credit: number;
  pad: number;
  offset: number;
  gap: number;
  radius: number;
  line: number;
  dash: number;
  dashGap: number;
  dot: number;
  leading: number;
  labelPadX: number;
  labelPadY: number;
  labelRoom: number;
}

const EXPORT_TOKEN_NAMES: Record<keyof ExportTokens, string> = {
  reference: '--export-reference',
  title: '--export-title',
  label: '--export-label',
  credit: '--export-credit',
  pad: '--export-pad',
  offset: '--export-offset',
  gap: '--export-gap',
  radius: '--export-radius',
  line: '--export-line',
  dash: '--export-dash',
  dashGap: '--export-dash-gap',
  dot: '--export-dot',
  leading: '--export-leading',
  labelPadX: '--export-label-pad-x',
  labelPadY: '--export-label-pad-y',
  labelRoom: '--export-label-room',
};

export function readExportTokens(root: HTMLElement = document.documentElement): ExportTokens {
  const style = getComputedStyle(root);
  const out = {} as Record<keyof ExportTokens, number>;
  for (const key of Object.keys(EXPORT_TOKEN_NAMES) as Array<keyof ExportTokens>) {
    const value = Number.parseFloat(style.getPropertyValue(EXPORT_TOKEN_NAMES[key]));
    if (!Number.isFinite(value)) throw new Error(`The picture sizes are missing (${EXPORT_TOKEN_NAMES[key]}).`);
    out[key] = value;
  }
  return out;
}

export interface Appearance {
  hidden: ReadonlySet<string>;
  selected: string | null;
  /** Faded structures: drawn semi-transparent (--anatomy-faded-opacity) but still there to tap and label. */
  faded?: ReadonlySet<string>;
}

export interface LoadResult {
  found: string[];
  missing: string[];
  triangles: number;
}

export interface ProjectedPoint {
  id: string;
  /** A visible point of the structure (its center when that can be seen), in CSS pixels. */
  x: number;
  y: number;
  /** True when no part of it can be seen from the camera: other structures are in front of it. */
  behind: boolean;
}

export interface ExportResult {
  blob: Blob;
  /** Labels asked for that found no room in the picture, so the student is told which names are missing. */
  leftOut: string[];
  /** Labels drawn marked "(behind)": their structure is hidden behind others from this side. */
  behind: string[];
}

export interface ExportRequest {
  size: ExportSize;
  transparent: boolean;
  title: string;
  credit: string;
  /** The labels to draw: structure ids with their official names. */
  labels: ReadonlyArray<{ id: string; text: string }>;
}

export interface LabScene {
  /** Loads one model file, or several that share one coordinate frame (the whole-body view), as one model. */
  load(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null>;
  /** Adds more model files to the loaded view (the whole body's deeper layers); null if a newer load replaced it. */
  add(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null>;
  /** Removes the shown model at once and drops any download still in flight (a system change calls this first). */
  clear(): void;
  setAppearance(appearance: Appearance): void;
  setColors(colors: LabColors): void;
  /** The quiz uses nearest-hit picking so earlier answers do not bias later taps. */
  pick(clientX: number, clientY: number, preferSelected?: boolean): string | null;
  project(ids: readonly string[]): ProjectedPoint[];
  /** Where the structures' centers are on screen, in CSS pixels, without changing which labels the scene tracks. */
  locate(ids: readonly string[]): ProjectedPoint[];
  /** The visible model's box on screen, in CSS pixels, or null when nothing is in front of the camera. */
  extent(): Rect | null;
  orbit(yaw: number, pitch: number): void;
  zoom(factor: number): void;
  resetView(): void;
  /** Looks at the model's center from `direction` (model frame, any length) at the starting distance. */
  viewFrom(direction: readonly [number, number, number]): void;
  /** Turns drag inertia off (reduced motion) or on; follows the device setting while the lab is open. */
  setReducedMotion(reduced: boolean): void;
  /** Starts or stops the model turning slowly by itself. Taking hold of the model stops it (see `onSpinStop`). */
  setSpin(on: boolean): void;
  /** One of the six standard views of the visible model (animated unless reduced motion is on). */
  viewPreset(preset: ViewPreset): void;
  /** Frames one structure's box; false when it is not in the model or is hidden. */
  focusOn(id: string): boolean;
  /** Turns the whole model to stand or lie on its back, then shows it from that posture's home view. */
  setPosture(posture: Posture): void;
  /**
   * The structures drawn as a glowing outline instead of a solid surface (the skin system), while anything else is
   * showing. A selected one is drawn solid; an outlined one is never picked, so a tap reaches what is behind it.
   */
  setOutlined(ids: ReadonlySet<string>): void;
  /** "Spread structures apart": 0 to 1 moves every structure away from the model's middle; 0 puts them back. */
  setSpread(fraction: number): void;
  /** A small picture of the visible model from a preset view, as a data: URL, or null with nothing to draw. */
  thumbnail(preset: ViewPreset, width: number, height: number): string | null;
  /** Where each structure's center falls in such a picture, 0 to 1 across and down; structures not loaded are left out. */
  thumbnailMarks(preset: ViewPreset, width: number, height: number, ids: readonly string[]): Map<string, { x: number; y: number }>;
  /** Every loaded structure's world-space box (min and max corners), for "what is nearby" (Task 178). */
  boundsById(): Map<string, { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }>;
  /** Where the camera is, what it looks at and which way is up, as plain number triples (saved views, compare view). */
  cameraState(): CameraState;
  /** Puts the camera exactly where `state` says, at once (no animation); ignores a state with non-finite numbers. */
  applyCameraState(state: CameraState): void;
  exportPicture(request: ExportRequest): Promise<ExportResult>;
  dispose(): void;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

interface Options {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  colors: LabColors;
  posture?: Posture;
  /** Called after every frame the scene draws, so the labels can follow the camera. */
  onRender: () => void;
  /** Called when the student takes hold of the model while it is turning by itself: the turning has stopped. */
  onSpinStop?: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);
/** The model turning by itself takes this long for one full turn: slow enough to study while it moves. */
const SPIN_TURN_MS = 24_000;
/** A frame that arrives late (a hidden tab coming back) turns the model by no more than this much time. */
const SPIN_MAX_STEP_MS = 100;
/** The orientation thumbnails leave a little room round the model (1 is a tight fit). */
const THUMBNAIL_MARGIN = 1.08;
/** How long the camera must be still before the lab checks which labeled structures it can see. */
const VISIBILITY_IDLE_MS = 120;
/** The ID picture's size: about this many pixels, whatever the view's size (enough to find small visible parts). */
const ID_PICTURE_PIXELS = 360_000;

export function createLabScene({ canvas, reducedMotion, colors: initialColors, posture: initialPosture, onRender, onSpinStop }: Options): LabScene {
  let colors = initialColors;
  let currentReducedMotion = reducedMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color(0, 0, 0), 0); // transparent: the canvas's own bg-page shows through
  // three's constructor sizes the canvas with inline styles; remove them so the page's CSS controls the layout.
  canvas.style.removeProperty('width');
  canvas.style.removeProperty('height');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  scene.add(camera);
  // Less even light than before (ambient 1.4, key 1.8), so surfaces turned away read darker and shapes stand apart;
  // a surface facing the key light still shows its token color (ambient + key ≈ π, Lambert's 1/π).
  scene.add(new THREE.AmbientLight(undefined, 0.85));
  const key = new THREE.DirectionalLight(undefined, 2.3);
  key.position.set(0.6, 0.8, 1);
  camera.add(key); // the light moves with the camera, so the side facing the student is always lit
  // Rim lights: from behind the model, to its left and right, in copper (--lab-rim*). They sit in the camera's frame
  // and aim at the camera's own origin, so whichever way the student turns the model its edges catch the light.
  const rimLight = new THREE.DirectionalLight(undefined, 0);
  rimLight.position.set(-1, 0.35, -2);
  const rimSoftLight = new THREE.DirectionalLight(undefined, 0);
  rimSoftLight.position.set(1, 0.6, -2);
  camera.add(rimLight, rimLight.target, rimSoftLight, rimSoftLight.target);
  const applyRim = () => {
    if (colors.rim) rimLight.color.set(colors.rim);
    if (colors.rimSoft) rimSoftLight.color.set(colors.rimSoft);
    rimLight.intensity = colors.rim ? colors.rimStrength : 0;
    rimSoftLight.intensity = colors.rimSoft ? colors.rimSoftStrength : 0;
  };
  // The skin's outline: bright where the surface turns edge-on to the camera (a fresnel rim), clear in the middle.
  const outlineMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color() }, power: { value: 2.6 }, alpha: { value: 0.55 } },
    vertexShader: `varying float edge; uniform float power;
      void main() {
        vec3 n = normalize(normalMatrix * normal);
        vec3 v = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
        edge = pow(1.0 - abs(dot(n, v)), power);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 color; uniform float alpha; varying float edge;
      void main() {
        gl_FragColor = vec4(color, edge * alpha);
        #include <colorspace_fragment>
      }`,
  });
  let outlined: ReadonlySet<string> = new Set();
  applyRim();

  let needsRender = true;
  // Event handlers can wake the scheduler without keeping a WebGL loop alive while idle.
  let scheduleFrame: () => void = () => {};
  let scheduleVisibility: () => void = () => {};
  // Which labeled structures the camera can see is worked out from an ID picture once the camera has been still for
  // VISIBILITY_IDLE_MS (and after any change to what is shown), not on every frame.
  let visibilityDirty = true;
  let lastMove = 0;
  let labelIds: string[] = [];
  let visibility = new Map<string, { behind: boolean; world: THREE.Vector3 }>();
  const requestRender = () => {
    needsRender = true;
    scheduleFrame();
  };

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.12;
  // Panning is off: it can only be done by right-drag or a two-finger drag, and the lab offers no keyboard or tap
  // alternative for it (AGENTS.md: every dragging gesture needs one). Rotate, zoom and reset all have buttons and keys.
  controls.enablePan = false;
  const onCameraChange = () => {
    lastMove = performance.now();
    visibilityDirty = true;
    requestRender();
    scheduleVisibility();
  };
  /** The model turning by itself (the remote's play button): one slow turn about the upright axis. */
  let spinning = false;
  let lastSpin = 0;
  const onControlsStart = () => {
    move = null;
    if (spinning) {
      spinning = false;
      onSpinStop?.();
    }
  };
  controls.addEventListener('start', onControlsStart);
  controls.addEventListener('change', onCameraChange);

  let root: THREE.Object3D | null = null;
  let spread = 0;
  let meshesById = new Map<string, THREE.Mesh[]>();
  let order: string[] = [];
  let centers = new Map<string, THREE.Vector3>();
  let boxes = new Map<string, THREE.Box3>();
  let unlabeled: THREE.Mesh[] = [];
  let appearance: Appearance = { hidden: new Set(), selected: null };
  const home = { position: new THREE.Vector3(0, 0, 5), target: new THREE.Vector3(), distance: 5 };
  let posture: Posture = initialPosture ?? 'standing';
  let loadId = 0;
  /** A camera move in progress (none with reduced motion: the camera jumps). */
  let move: { from: { position: THREE.Vector3; target: THREE.Vector3 }; to: { position: Vec3; target: Vec3 }; start: number; duration: number } | null = null;

  const resize = () => {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || width;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    visibilityDirty = true;
    requestRender();
  };
  // OrbitControls.update() returns true while damping still moves the camera (three.js r187).
  // Only those moving frames are repeated. Camera changes reset a single delayed visibility check.
  const tick = (time: number): boolean => {
    let moving = controls.enableDamping ? controls.update() : false;
    if (move) {
      const t = moveProgress(time - move.start, move.duration);
      const position = lerpVec3(move.from.position, move.to.position, t);
      const target = lerpVec3(move.from.target, move.to.target, t);
      camera.position.set(position.x, position.y, position.z);
      controls.target.set(target.x, target.y, target.z);
      if (t >= 1) move = null;
      else moving = true;
      camera.lookAt(controls.target);
      onCameraChange();
    }
    if (spinning && !move) {
      const elapsed = lastSpin === 0 ? 0 : Math.min(time - lastSpin, SPIN_MAX_STEP_MS);
      lastSpin = time;
      const offset = camera.position.clone().sub(controls.target).applyAxisAngle(UP, (elapsed / SPIN_TURN_MS) * Math.PI * 2);
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      onCameraChange();
      moving = true;
    }
    if (visibilityDirty && root) {
      // Both timestamps use performance.now(). A delayed frame that fires early
      // must re-arm the visibility check rather than leaving stale occlusion labels.
      const remaining = remainingIdleDelay(performance.now(), lastMove, VISIBILITY_IDLE_MS);
      if (remaining > 0) {
        if (labelIds.length > 0) scheduler.afterIdle(remaining);
      } else {
        visibilityDirty = false;
        if (labelIds.length > 0) {
          const w = canvas.clientWidth || 1;
          const h = canvas.clientHeight || 1;
          visibility = visibilityFor(camera, labelIds, w, h);
          needsRender = true; // redraw so label anchors and behind marks refresh
        } else {
          visibility = new Map();
        }
      }
    }
    if (needsRender) {
      needsRender = false;
      renderer.render(scene, camera);
      onRender();
    }
    return moving;
  };
  const scheduler = createDemandFrameScheduler(tick);
  scheduleFrame = scheduler.request;
  scheduleVisibility = () => {
    if (root && labelIds.length > 0) scheduler.afterIdle(VISIBILITY_IDLE_MS);
  };

  resize(); // schedules one initial frame
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  function disposeModel() {
    if (!root) return;
    // Give every mesh its own material back first, so disposing the model also releases those.
    for (const meshes of meshesById.values()) {
      for (const mesh of meshes) {
        const solid = mesh.userData['solidMaterial'] as THREE.Material | undefined;
        if (solid) mesh.material = solid;
      }
    }
    spread = 0;
    scene.remove(root);
    disposeAnatomyMeshResources(root);
    root = null;
    meshesById = new Map();
    order = [];
    centers = new Map();
    boxes = new Map();
    unlabeled = [];
    visibility = new Map();
    visibilityDirty = true;
    const oldIdMaterials = idMaterials;
    idMaterials = [];
    disposeAnatomyMaterials(oldIdMaterials);
  }

  /** The lab's own solid material for a mesh, kept while the outline material is on it. */
  const solidOf = (mesh: THREE.Mesh) => {
    const saved = mesh.userData['solidMaterial'] as THREE.MeshLambertMaterial | undefined;
    if (saved) return saved;
    mesh.userData['solidMaterial'] = mesh.material;
    return mesh.material as THREE.MeshLambertMaterial;
  };

  function applyAppearance() {
    const { hidden, selected } = appearance;
    const faded = appearance.faded ?? new Set<string>();
    const highlighted = visibleSelection(selected, hidden);
    applyRim();
    if (colors.skinOutline) outlineMaterial.uniforms['color']!.value.set(colors.skinOutline);
    outlineMaterial.uniforms['power']!.value = colors.skinOutlinePower;
    outlineMaterial.uniforms['alpha']!.value = colors.skinOutlineAlpha;
    // The skin is an outline only while something else is showing; alone, it is drawn as a solid model.
    const innerShown = outlined.size > 0 && order.some((id) => !outlined.has(id) && !hidden.has(id));
    order.forEach((id, index) => {
      const isSelected = id === highlighted;
      if (innerShown && outlined.has(id) && !isSelected) {
        for (const mesh of meshesById.get(id) ?? []) {
          solidOf(mesh);
          mesh.visible = !hidden.has(id);
          mesh.material = outlineMaterial;
          mesh.renderOrder = 5;
        }
        return;
      }
      const dim = highlighted !== null && !isSelected;
      // A faded structure stays see-through even while selected; dimming (another one selected) goes further.
      const fade = faded.has(id);
      const opacity = dim ? Math.min(colors.dimAlpha, fade ? colors.fadedOpacity : 1) : fade ? colors.fadedOpacity : 1;
      const color = isSelected ? colors.modelSelected : index % 2 === 0 ? colors.model : colors.modelAlt;
      for (const mesh of meshesById.get(id) ?? []) {
        mesh.visible = !hidden.has(id);
        const material = solidOf(mesh);
        mesh.material = material;
        material.color.set(color);
        material.transparent = opacity < 1;
        material.opacity = opacity;
        material.depthWrite = opacity >= 1;
        material.needsUpdate = true;
        mesh.renderOrder = opacity < 1 ? 1 : 0;
      }
    });
    for (const mesh of unlabeled) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.color.set(colors.model);
      material.transparent = highlighted !== null;
      material.opacity = highlighted !== null ? colors.dimAlpha : 1;
      material.depthWrite = highlighted === null;
      material.needsUpdate = true;
    }
    visibilityDirty = true;
    requestRender();
  }

  // ── The ID picture ─────────────────────────────────────────────────────────────────────────────────────────────
  // Every structure drawn flat in its own color (encodeId), into a small offscreen target without antialiasing, so
  // each pixel says which structure is nearest the camera there. The selected structure is drawn over the others, as
  // the student sees it through the faded ones. Colors are set as linear values and a render target gets no color
  // conversion, so the bytes read back are exactly the codes written.
  let idMaterials: THREE.MeshBasicMaterial[] = [];
  const nothing = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  // For meshes that must not show up in the ID picture and must not hide anything behind them (the skin's outline).
  const seeThrough = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const idTarget = new THREE.WebGLRenderTarget(1, 1);

  function idMaterialFor(index: number): THREE.MeshBasicMaterial {
    let material = idMaterials[index];
    if (!material) {
      const [r, g, b] = encodeId(index);
      material = new THREE.MeshBasicMaterial();
      material.color.setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);
      idMaterials[index] = material;
    }
    return material;
  }

  function renderIds(cam: THREE.Camera, width: number, height: number, into: THREE.WebGLRenderer): Uint8Array {
    // Prepare allocations and renderer state before changing any visible mesh.
    // WebGL failures in setup, rendering, or pixel readback must never leave
    // the flat ID-pass materials attached to the student's actual 3D model.
    const pixels = new Uint8Array(width * height * 4);
    const clear = into.getClearColor(new THREE.Color());
    const clearAlpha = into.getClearAlpha();
    const highlighted = visibleSelection(appearance.selected, appearance.hidden);

    return withTemporaryMeshAppearance(
      (remember) => {
        order.forEach((id, index) => {
          const isSelected = id === highlighted;
          for (const mesh of meshesById.get(id) ?? []) {
            remember(mesh);
            if (mesh.material === outlineMaterial) {
              mesh.material = seeThrough;
              continue;
            }
            const material = idMaterialFor(index);
            material.depthTest = !isSelected;
            mesh.material = material;
            mesh.renderOrder = isSelected ? 10 : 0;
          }
        });
        for (const mesh of unlabeled) {
          remember(mesh);
          mesh.material = nothing;
        }
      },
      () => {
        try {
          idTarget.setSize(width, height);
          into.setRenderTarget(idTarget);
          into.setClearColor(new THREE.Color(0, 0, 0), 1);
          into.clear();
          into.render(scene, cam);
          into.readRenderTargetPixels(idTarget, 0, 0, width, height, pixels);
        } finally {
          // Attempt both renderer-state resets even if one throws. The outer
          // material guard then restores all real meshes regardless.
          try {
            into.setRenderTarget(null);
          } finally {
            into.setClearColor(clear, clearAlpha);
          }
        }
        return pixels;
      },
    );
  }

  /**
   * For each id: whether any of it can be seen from `cam`, and a world point for its label's line: the center when
   * visible there, else a visible point near the middle of what can be seen (placed at the center's depth, so it
   * projects to that pixel and follows the camera closely until the next check).
   */
  function visibilityFor(cam: THREE.Camera, ids: readonly string[], cssWidth: number, cssHeight: number, into = renderer) {
    const k = Math.min(1, ID_PICTURE_PIXELS / Math.max(1, cssWidth * cssHeight)) ** 0.5;
    const w = Math.max(1, Math.round(cssWidth * k));
    const h = Math.max(1, Math.round(cssHeight * k));
    cam.updateMatrixWorld();
    const targets = new Map<string, VisibilityTarget>();
    const depth = new Map<string, number>();
    for (const id of ids) {
      const center = centers.get(id);
      const index = order.indexOf(id);
      if (!center || index < 0 || appearance.hidden.has(id)) continue;
      const p = center.clone().project(cam);
      depth.set(id, p.z);
      targets.set(id, { index, x: ((p.x + 1) / 2) * w - 0.5, y: ((1 - p.y) / 2) * h - 0.5 });
    }
    const out = new Map<string, { behind: boolean; world: THREE.Vector3 }>();
    if (targets.size === 0) return out;
    const found = findVisibleAnchors(renderIds(cam, w, h, into), w, h, targets);
    for (const [id, anchor] of found) {
      const ndc = new THREE.Vector3(((anchor.x + 0.5) / w) * 2 - 1, 1 - ((anchor.y + 0.5) / h) * 2, depth.get(id)!);
      out.set(id, { behind: !anchor.visible, world: anchor.visible ? ndc.unproject(cam) : centers.get(id)!.clone() });
    }
    return out;
  }

  /** The visible model's box in world space (the whole model when everything is hidden), or null with no model. */
  function visibleBox(): THREE.Box3 | null {
    const box = new THREE.Box3();
    for (const [id, meshes] of meshesById) {
      if (appearance.hidden.has(id)) continue;
      for (const mesh of meshes) box.expandByObject(mesh);
    }
    if (box.isEmpty() && root) box.setFromObject(root);
    return box.isEmpty() ? null : box;
  }

  /** Every structure's world box and center, worked out again (after a posture change turns the whole model). */
  function recomputeBounds() {
    root?.updateMatrixWorld(true);
    for (const [id, meshes] of meshesById) {
      const box = new THREE.Box3();
      for (const mesh of meshes) box.expandByObject(mesh);
      centers.set(id, box.getCenter(new THREE.Vector3()));
      boxes.set(id, box);
    }
    visibilityDirty = true;
  }

  function frame() {
    const box = visibleBox();
    if (!box) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = box.getCenter(new THREE.Vector3());
    const homeDir = posture === 'lying' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
    const camSize = boxSizeInCameraFrame(box.getSize(new THREE.Vector3()), homeDir);
    const distance = fitDistance(camSize, camera.fov, camera.aspect);
    // glTF's convention: the front of an asset faces +Z, with +Y up. The lab starts with a front view; a model lying
    // on its back (setPosture) is shown from above.
    home.target.copy(center);
    home.distance = distance;
    const position = cameraForPreset(homePreset(posture), center, distance);
    home.position.set(position.x, position.y, position.z);
    camera.near = Math.max(distance / 200, 1e-3);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.minDistance = sphere.radius * 0.25;
    controls.maxDistance = distance * 6;
  }

  /** Moves the camera to `position`, looking at `target`: at once with reduced motion, else over CAMERA_MOVE_MS. */
  function moveCamera(position: Vec3, target: Vec3) {
    camera.up.copy(UP);
    const duration = cameraMoveDuration(currentReducedMotion);
    if (duration === 0) {
      move = null;
      camera.position.set(position.x, position.y, position.z);
      controls.target.set(target.x, target.y, target.z);
      controls.update();
      requestRender();
      return;
    }
    move = {
      from: { position: camera.position.clone(), target: controls.target.clone() },
      to: { position, target },
      start: performance.now(),
      duration,
    };
    requestRender();
  }

  function resetView() {
    moveCamera(home.position, home.target);
  }

  function viewPreset(preset: ViewPreset) {
    const box = visibleBox();
    if (!box) return;
    const center = box.getCenter(new THREE.Vector3());
    const dir = rotateX(presetDirection(preset), postureAngleX(posture));
    const camSize = boxSizeInCameraFrame(box.getSize(new THREE.Vector3()), dir);
    const distance = fitDistance(camSize, camera.fov, camera.aspect);
    moveCamera(cameraForPreset(preset, center, distance, posture), center);
  }

  function focusOn(id: string): boolean {
    const box = boxes.get(id);
    if (!box || appearance.hidden.has(id) || (meshesById.get(id)?.length ?? 0) === 0) return false;
    const center = box.getCenter(new THREE.Vector3());
    const dir = { x: camera.position.x - controls.target.x, y: camera.position.y - controls.target.y, z: camera.position.z - controls.target.z };
    const camSize = boxSizeInCameraFrame(box.getSize(new THREE.Vector3()), dir);
    const distance = Math.max(controls.minDistance, fitDistance(camSize, camera.fov, camera.aspect));
    moveCamera(focusCamera(camera.position, controls.target, center, distance), center);
    return true;
  }

  function boundsById() {
    const out = new Map<string, { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }>();
    for (const [id, box] of boxes) {
      if ((meshesById.get(id)?.length ?? 0) === 0) continue;
      out.set(id, { min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } });
    }
    return out;
  }

  function cameraState(): CameraState {
    return {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
      up: [camera.up.x, camera.up.y, camera.up.z],
    };
  }

  function applyCameraState(state: CameraState) {
    const triple = (v: readonly number[]) => v.length === 3 && v.every((n) => Number.isFinite(n));
    if (!triple(state.position) || !triple(state.target) || !triple(state.up)) return;
    move = null;
    camera.up.set(state.up[0], state.up[1], state.up[2]);
    camera.position.set(state.position[0], state.position[1], state.position[2]);
    controls.target.set(state.target[0], state.target[1], state.target[2]);
    camera.lookAt(controls.target);
    const distance = camera.position.distanceTo(controls.target);
    if (Number.isFinite(distance) && distance > 0) {
      if (distance < controls.minDistance) controls.minDistance = distance;
      if (distance > controls.maxDistance) controls.maxDistance = distance;
      if (distance * 2 > camera.far) {
        camera.far = distance * 20;
        camera.updateProjectionMatrix();
      }
    }
    controls.update();
    requestRender();
  }

  function viewFrom(direction: readonly [number, number, number]) {
    const rotated = rotateX({ x: direction[0], y: direction[1], z: direction[2] }, postureAngleX(posture));
    const dir = new THREE.Vector3(rotated.x, rotated.y, rotated.z);
    if (dir.lengthSq() < 1e-12) return;
    move = null;
    const distance = home.position.distanceTo(home.target);
    controls.target.copy(home.target);
    camera.position.copy(home.target).add(dir.setLength(distance));
    camera.up.copy(UP);
    controls.update();
    requestRender();
  }

  function setReducedMotion(reduced: boolean) {
    currentReducedMotion = reduced;
    controls.enableDamping = !reduced;
    requestRender();
  }

  function setPosture(next: Posture) {
    posture = next;
    if (!root) return;
    root.rotation.set(postureAngleX(next), 0, 0);
    recomputeBounds();
    frame();
    resetView();
  }

  async function fetchGroup(urls: string | readonly string[]): Promise<THREE.Group> {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    // Repeated shared GLB URLs must not trigger a second physical decode.
    const list = uniqueAnatomyModelUrls(urls);
    // A failed file cannot leave earlier or later decoded meshes in memory.
    // Scene.add has not run yet, so failed initial loads must release all parts.
    const scenes = await loadModelsOrDispose(
      list.map((url) => () => loader.loadAsync(url).then((gltf) => gltf.scene)),
      disposeGroup,
    );
    const group = new THREE.Group();
    for (const part of scenes) group.add(part);
    return group;
  }

  function disposeGroup(group: THREE.Object3D) {
    disposeAnatomyMeshResources(group);
  }

  /** Takes a fetched group into the view: `replace` makes it the whole model, otherwise it joins the current one. */
  function integrate(group: THREE.Group, ids: readonly string[], replace: boolean): LoadResult {
    if (replace || !root) {
      disposeModel();
      root = group;
      scene.add(root);
    } else {
      root.add(group);
    }
    group.updateMatrixWorld(true);
    const { touched, triangles } = indexAnatomyGroup(group, ids, meshesById, unlabeled);
    // An ID already found in an earlier GLB is neither newly added nor missing
    // when another file contributes geometry to the same structure.
    const { added, missing } = summarizeIndexedAnatomyIds(ids, order, meshesById);
    for (const id of missing) if (!order.includes(id)) meshesById.delete(id);
    order = [...order, ...added];
    // Additional GLBs can expand a previously indexed structure's geometry.
    for (const id of touched) {
      const box = new THREE.Box3();
      for (const mesh of meshesById.get(id)!) box.expandByObject(mesh);
      centers.set(id, box.getCenter(new THREE.Vector3()));
      boxes.set(id, box);
    }
    visibilityDirty = true;
    return { found: added, missing, triangles: Math.round(triangles) };
  }

  async function load(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null> {
    const myLoad = ++loadId;
    const group = await fetchGroup(urls);
    if (myLoad !== loadId) {
      // A newer system was picked while this one downloaded: throw this one away.
      disposeGroup(group);
      return null;
    }
    const result = integrate(group, ids, true);
    // Keep initial-load order unique as well. integrate() already deduplicates
    // its result, but reassigning from raw ids here would undo that guarantee.
    order = [...new Set(ids)].filter((id) => (meshesById.get(id)?.length ?? 0) > 0);
    appearance = { hidden: new Set(), selected: null };
    // A new model takes the posture already chosen (its root is fresh, so the turn is applied, not added).
    root!.rotation.set(postureAngleX(posture), 0, 0);
    recomputeBounds();
    applyAppearance();
    frame();
    move = null;
    camera.position.copy(home.position);
    controls.target.copy(home.target);
    camera.up.copy(UP);
    controls.update();
    requestRender();
    return result;
  }

  async function add(urls: string | readonly string[], ids: readonly string[]): Promise<LoadResult | null> {
    const myLoad = loadId;
    const group = await fetchGroup(urls);
    if (myLoad !== loadId || !root) {
      disposeGroup(group);
      return null;
    }
    const result = integrate(group, ids, false);
    // The boxes integrate() worked out used the group's own matrices; with the model turned (lying), work them out
    // again from the world.
    if (posture !== 'standing') recomputeBounds();
    if (spread > 0) applySpread();
    applyAppearance();
    requestRender();
    return result;
  }

  /**
   * Puts every structure back, then slides each toward its own spot on a flat board of tidy rows (anatomyspread.ts):
   * at 100% the open system is laid out part by part, facing the home view; in between it is partway there.
   */
  function applySpread() {
    if (!root) return;
    for (const meshes of meshesById.values()) {
      for (const mesh of meshes) {
        const moved = mesh.userData['spreadOffset'] as THREE.Vector3 | undefined;
        if (moved) {
          mesh.position.sub(moved);
          delete mesh.userData['spreadOffset'];
        }
      }
    }
    recomputeBounds();
    if (spread > 0 && boxes.size > 0) {
      // The board faces the home view: across is X; up is Y standing, and Z for a model lying on its back.
      const up = posture === 'lying' ? 'z' : 'y';
      const depth = posture === 'lying' ? 'y' : 'z';
      const shown = [...meshesById].filter(([id, meshes]) => meshes.length > 0 && boxes.has(id) && !appearance.hidden.has(id));
      const all = new THREE.Box3();
      for (const [id] of shown) all.union(boxes.get(id)!);
      const middle = all.getCenter(new THREE.Vector3());
      const spots = spreadBoard(shown.map(([id]) => {
        const size = boxes.get(id)!.getSize(new THREE.Vector3());
        return { id, width: size.x, height: size[up] };
      }));
      for (const [id, meshes] of shown) {
        const center = centers.get(id);
        const spot = spots.get(id);
        if (!center || !spot) continue;
        const target = new THREE.Vector3();
        target.x = middle.x + spot.u;
        target[up] = middle[up] + (up === 'z' ? -spot.v : spot.v);
        target[depth] = middle[depth];
        const away = target.sub(center).multiplyScalar(spread);
        for (const mesh of meshes) {
          if (!mesh.parent) continue;
          mesh.parent.updateWorldMatrix(true, false);
          const inverse = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(mesh.parent.matrixWorld).invert());
          const local = away.clone().applyMatrix3(inverse);
          mesh.position.add(local);
          mesh.userData['spreadOffset'] = local;
        }
      }
      recomputeBounds();
    }
    requestRender();
  }

  const thumbnailTarget = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  thumbnailTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const thumbnailCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);

  /** Points the spare camera at the visible model from a preset view; null with nothing to draw. */
  function frameThumbnail(preset: ViewPreset, width: number, height: number): THREE.PerspectiveCamera | null {
    const box = visibleBox();
    if (!box || !root || width < 1 || height < 1) return null;
    const center = box.getCenter(new THREE.Vector3());
    const dir = rotateX(presetDirection(preset), postureAngleX(posture));
    const camSize = boxSizeInCameraFrame(box.getSize(new THREE.Vector3()), dir);
    const cam = thumbnailCamera;
    cam.fov = camera.fov;
    cam.aspect = width / height;
    const distance = fitDistance(camSize, cam.fov, cam.aspect) * THUMBNAIL_MARGIN;
    cam.near = Math.max(distance / 200, 1e-3);
    cam.far = distance * 20;
    cam.updateProjectionMatrix();
    const position = cameraForPreset(preset, center, distance, posture);
    cam.position.set(position.x, position.y, position.z);
    cam.up.copy(UP);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    return cam;
  }

  /** Where each structure's center falls in a thumbnail of the visible model (0 to 1 across and down). */
  function thumbnailMarks(preset: ViewPreset, width: number, height: number, ids: readonly string[]) {
    const cam = frameThumbnail(preset, width, height);
    const out = new Map<string, { x: number; y: number }>();
    if (!cam) return out;
    for (const id of ids) {
      const box = boxes.get(id);
      if (!box || (meshesById.get(id)?.length ?? 0) === 0) continue;
      const point = box.getCenter(new THREE.Vector3()).project(cam);
      out.set(id, { x: (point.x + 1) / 2, y: (1 - point.y) / 2 });
    }
    return out;
  }

  function thumbnail(preset: ViewPreset, width: number, height: number): string | null {
    const cam = frameThumbnail(preset, width, height);
    if (!cam) return null;
    // The lights live in the main camera's frame; borrow them so this picture is lit as if it were the view.
    const lights = [key, rimLight, rimLight.target, rimSoftLight, rimSoftLight.target];
    scene.add(cam);
    cam.add(...lights);
    const previousTarget = renderer.getRenderTarget();
    const previousClear = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const pixels = new Uint8Array(width * height * 4);
    try {
      thumbnailTarget.setSize(width, height);
      renderer.setRenderTarget(thumbnailTarget);
      renderer.setClearColor(new THREE.Color(0, 0, 0), 0);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(thumbnailTarget, 0, 0, width, height, pixels);
    } catch {
      return null;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClear, previousAlpha);
      camera.add(...lights);
      scene.remove(cam);
      requestRender();
    }
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    // WebGL rows run bottom to top.
    const image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      image.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
    }
    ctx.putImageData(image, 0, 0);
    return out.toDataURL('image/png');
  }

  const raycaster = new THREE.Raycaster();

  function pick(clientX: number, clientY: number, preferSelected = true): string | null {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const candidates = order.flatMap((id) => (appearance.hidden.has(id) ? [] : meshesById.get(id)!))
      .filter((mesh) => mesh.material !== outlineMaterial);
    const hits = raycaster.intersectObjects(candidates, false)
      .map((hit) => hit.object.userData['structureId'])
      .filter((id): id is string => typeof id === 'string');
    // The selected opaque mesh may be behind another translucent mesh.
    // Only prefer it if the ray actually intersects it; otherwise pick the nearest mesh.
    const selected = preferSelected ? visibleSelection(appearance.selected, appearance.hidden) : null;
    return pickedStructure(hits, selected);
  }

  function projectWith(
    cam: THREE.Camera,
    ids: readonly string[],
    width: number,
    height: number,
    seen: ReadonlyMap<string, { behind: boolean; world: THREE.Vector3 }> = visibility,
  ): ProjectedPoint[] {
    const out: ProjectedPoint[] = [];
    for (const id of ids) {
      const center = centers.get(id);
      if (!center || appearance.hidden.has(id)) continue;
      const known = seen.get(id);
      const p = (known?.world ?? center).clone().project(cam);
      if (p.z < -1 || p.z > 1) continue; // behind the camera or past its far plane
      out.push({ id, x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height, behind: known?.behind ?? false });
    }
    return out;
  }

  function extentWith(cam: THREE.Camera, width: number, height: number): Rect | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const corner = new THREE.Vector3();
    for (const [id, box] of boxes) {
      if (appearance.hidden.has(id)) continue;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        if (corner.z < -1 || corner.z > 1) continue;
        const x = ((corner.x + 1) / 2) * width;
        const y = ((1 - corner.y) / 2) * height;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }

  function orbit(yaw: number, pitch: number) {
    move = null;
    const offset = camera.position.clone().sub(controls.target);
    if (yaw) offset.applyAxisAngle(UP, yaw);
    if (pitch) {
      const axis = offset.clone().cross(UP);
      if (axis.lengthSq() > 1e-9) offset.applyAxisAngle(axis.normalize(), pitch);
    }
    camera.position.copy(controls.target).add(offset);
    controls.update(); // keeps the camera off the poles, like dragging does
    requestRender();
  }

  function zoom(factor: number) {
    move = null;
    const offset = camera.position.clone().sub(controls.target);
    const length = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() * factor));
    camera.position.copy(controls.target).add(offset.setLength(length));
    controls.update();
    requestRender();
  }

  async function exportPicture(request: ExportRequest): Promise<ExportResult> {
    // A system picker click invalidates this picture while fonts may still be loading.
    // Do not allocate another large canvas or GPU renderer for an obsolete model.
    const pictureLoadId = loadId;
    const { width, height } = EXPORT_SIZES[request.size];
    // Type is set for the picture's shorter side (1080 in every size), so a wide picture's labels are no taller than
    // a phone picture's and as many fit down its side.
    const tk = readExportTokens();
    const scale = Math.min(width, height) / tk.reference;
    const titleSize = Math.round(tk.title * scale);
    const labelSize = Math.round(tk.label * scale);
    const creditSize = Math.round(tk.credit * scale);
    const pad = Math.round(tk.pad * scale);
    const font = colors.font;
    if (document.fonts) {
      // Offline or stalled font requests must not hide title, labels, or source credits.
      // Wait briefly, then let Canvas use its browser fallback font.
      await preparePictureFonts(
        [`700 ${titleSize}px ${font}`, `400 ${labelSize}px ${font}`],
        (declaration) => document.fonts.load(declaration),
      );
    }

    // scene.clear() and scene.dispose() advance loadId synchronously.
    if (pictureLoadId !== loadId) throw new Error('The anatomy model changed during picture preparation.');

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the picture.');

    // Measure the saved picture's title before fitting the camera crop.
    // The output canvas has already been allocated and stale-load guards have passed.
    ctx.font = `700 ${titleSize}px ${font}`;
    const titleLayout = pictureTitleLayout(
      request.title, width, pad, titleSize, tk.leading, (value) => ctx.measureText(value).width,
    );
    // The credit's lines decide how much room the bottom band needs.
    ctx.font = `400 ${creditSize}px ${font}`;
    const creditLines = wrapText(request.credit, width - 2 * pad, (s) => ctx.measureText(s).width);
    const creditLineHeight = Math.round(creditSize * tk.leading);
    const top = titleLayout.top;
    const bottom = pad + creditLines.length * creditLineHeight + Math.round(pad / 2);
    const viewHeight = Math.max(1, height - top - bottom);

    // Each label's lines, wrapped to a column's width, with "(behind)" for a structure hidden from this side.
    ctx.font = `400 ${labelSize}px ${font}`;
    const measure = (s: string) => ctx.measureText(s).width;
    const padX = Math.round(labelSize * tk.labelPadX);
    const lineHeight = Math.round(labelSize * tk.leading);
    const boxPadY = Math.round(labelSize * tk.labelPadY);
    const offset = Math.round(tk.offset * scale);
    const margin = Math.round(pad / 2);
    const maxText = Math.round(width * tk.labelRoom);
    const names = new Map(request.labels.map((label) => [label.id, label.text]));
    const ids = [...names.keys()];

    // Same camera position and angle as the student's; the crop is fitted to the visible model and the label columns.
    const screenW = canvas.clientWidth || 1;
    const screenH = canvas.clientHeight || 1;
    const onScreen = visibilityFor(camera, ids, screenW, screenH);
    const screenExtent = extentWith(camera, screenW, screenH);
    const mid = screenExtent ? screenExtent.x + screenExtent.width / 2 : screenW / 2;
    const roughWidths = projectWith(camera, ids, screenW, screenH, onScreen).map((point) => ({
      x: point.x,
      width: labelLines(names.get(point.id)!, point.behind, maxText, measure).width + 2 * padX,
    }));
    const room = labelRoomFor(roughWidths, mid, width, offset + margin);
    const region = exportRegion(screenExtent, { width: screenW, height: screenH }, width / viewHeight, room);
    const shot = camera.clone();
    shot.setViewOffset(screenW, screenH, region.x, region.y, region.width, region.height);
    shot.updateProjectionMatrix();
    shot.updateMatrixWorld();

    // Which labeled structures this picture's camera sees, worked out again at the picture's own crop.
    const seen = visibilityFor(shot, ids, width, viewHeight);
    const lines = new Map<string, ReturnType<typeof labelLines>>();
    const anchors = projectWith(shot, ids, width, viewHeight, seen).map((point) => {
      const text = labelLines(names.get(point.id)!, point.behind, maxText, measure);
      lines.set(point.id, text);
      const count = text.lines.length + (text.mark === 'line' ? 1 : 0);
      return { ...point, width: Math.ceil(text.width) + 2 * padX, height: count * lineHeight + 2 * boxPadY };
    });
    const model = extentWith(shot, width, viewHeight);
    const layout = placeLabels(anchors, {
      width,
      height: viewHeight,
      margin,
      offset,
      gap: Math.round(tk.gap * scale),
      ...(model ? { columns: { left: model.x, right: model.x + model.width } } : {}),
    });
    const projected = new Set(anchors.map((a) => a.id));
    const leftOut = [...ids.filter((id) => !projected.has(id) && !appearance.hidden.has(id)), ...layout.leftOut];

    // Re-render the student's view at the picture's size, in a renderer of its own (so the page's canvas never
    // flickers).
    const glCanvas = document.createElement('canvas');
    const offscreen = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    try {
      offscreen.setPixelRatio(1);
      offscreen.setSize(width, viewHeight, false);
      offscreen.setClearColor(new THREE.Color(0, 0, 0), 0);
      offscreen.render(scene, shot);

      if (!request.transparent) {
        ctx.fillStyle = colors.page;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(glCanvas, 0, top);

      // Labels with leader lines, laid out the same way as on screen. A label whose structure is hidden behind others
      // from this side is marked in words, "(behind)", and with a dashed line, box and hollow dot, never by color alone.
      ctx.font = `400 ${labelSize}px ${font}`;
      ctx.lineWidth = Math.max(2, Math.round(tk.line * scale));
      ctx.textBaseline = 'middle';
      const dash = [Math.round(tk.dash * scale), Math.round(tk.dashGap * scale)];
      const y0 = top;
      for (const label of layout.placed) {
        const text = lines.get(label.id)!;
        ctx.setLineDash(label.behind ? dash : []);
        ctx.strokeStyle = label.behind ? colors.inkSoft : colors.ink;
        ctx.beginPath();
        ctx.moveTo(label.anchorX, label.anchorY + y0);
        ctx.lineTo(label.lineX, label.lineY + y0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(label.anchorX, label.anchorY + y0, Math.max(3, tk.dot * scale), 0, Math.PI * 2);
        if (label.behind) {
          ctx.fillStyle = colors.page;
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = colors.ink;
          ctx.fill();
        }
        ctx.fillStyle = colors.page;
        ctx.strokeStyle = label.behind ? colors.inkSoft : colors.line;
        ctx.beginPath();
        ctx.roundRect(label.x, label.y + y0, label.width, label.height, Math.round(tk.radius * scale));
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        text.lines.forEach((line, i) => {
          const y = label.y + y0 + boxPadY + i * lineHeight + lineHeight / 2;
          ctx.fillStyle = colors.ink;
          ctx.fillText(line, label.x + padX, y);
          if (i === text.lines.length - 1 && text.mark === 'inline') {
            ctx.fillStyle = colors.inkSoft;
            ctx.fillText(BEHIND_MARK, label.x + padX + measure(`${line} `), y);
          }
        });
        if (text.mark === 'line') {
          ctx.fillStyle = colors.inkSoft;
          ctx.fillText(BEHIND_MARK, label.x + padX, label.y + y0 + boxPadY + text.lines.length * lineHeight + lineHeight / 2);
        }
      }

      // The system's title at the top and the credit at the bottom.
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colors.ink;
      ctx.font = `700 ${titleSize}px ${font}`;
      titleLayout.lines.forEach((line, index) => {
        // Bound even a single unbroken title word to the canvas text width.
        ctx.fillText(line, pad, pad + titleSize + index * titleLayout.lineHeight, titleLayout.maxWidth);
      });
      ctx.fillStyle = colors.inkSoft;
      ctx.font = `400 ${creditSize}px ${font}`;
      creditLines.forEach((line, i) => {
        ctx.fillText(line, pad, height - pad - (creditLines.length - 1 - i) * creditLineHeight);
      });
    } finally {
      offscreen.dispose();
      offscreen.forceContextLoss();
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('This browser could not save the picture.'))), 'image/png');
    });
    return { blob, leftOut, behind: layout.placed.filter((label) => label.behind).map((label) => label.id) };
  }

  return {
    load,
    add,
    setAppearance(next) {
      appearance = next;
      applyAppearance();
    },
    setColors(next) {
      colors = next;
      applyAppearance();
    },
    pick,
    project(ids) {
      if (ids.length !== labelIds.length || ids.some((id, i) => id !== labelIds[i])) {
        labelIds = [...ids];
        visibilityDirty = true;
        requestRender();
        scheduleVisibility();
      }
      return projectWith(camera, ids, canvas.clientWidth, canvas.clientHeight);
    },
    locate(ids) {
      return projectWith(camera, ids, canvas.clientWidth, canvas.clientHeight, new Map());
    },
    extent() {
      return extentWith(camera, canvas.clientWidth, canvas.clientHeight);
    },
    orbit,
    zoom,
    resetView,
    viewFrom,
    setReducedMotion,
    setSpin(on) {
      if (on === spinning) return;
      spinning = on;
      lastSpin = 0;
      requestRender();
    },
    viewPreset,
    focusOn,
    setPosture,
    setOutlined(ids) {
      outlined = ids;
      applyAppearance();
    },
    setSpread(fraction) {
      const next = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
      if (next === spread) return;
      spread = next;
      applySpread();
      // The board is far wider than the body: step back (or forward again) so the whole of it stays in view.
      frame();
      resetView();
    },
    thumbnail,
    thumbnailMarks,
    boundsById,
    cameraState,
    applyCameraState,
    exportPicture,
    clear() {
      loadId++;
      move = null;
      disposeModel();
      appearance = { hidden: new Set(), selected: null };
      requestRender();
    },
    dispose() {
      loadId++;
      scheduler.dispose();
      observer.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onCameraChange);
      controls.dispose();
      disposeModel();
      disposeAnatomyMaterials([nothing, seeThrough, outlineMaterial]);
      thumbnailTarget.dispose();
      idTarget.dispose();
      renderer.dispose();
    },
  };
}
