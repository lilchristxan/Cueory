import { conventionalTint, TINT_TOKEN } from './anatomycolours';
import { isApplePlatform, shiftTypesZoomKey, shortcutKeyAction, shortcutWheelAction, SHORTCUT_KEY_MAP, type Modifiers, type ShortcutAction } from './anatomyshortcuts';
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createGeneration, createOnDemandLoader, publishAnatomyFile, knownMissingStructureIds, filesForLayer, idsForFiles, initialLayerPlan, firstLayer, layerNeedsReveal, visibilityAfterLayerDownload, lazyPeel, lazyRestore, revealTargetPlan, needsBulkLayerConfirmation, needsSavedViewConsent, showAllPlan, structureLoadNote, type OnDemandLoader } from './anatomylazy';
import type { CameraState, LabColors, LabScene, LoadResult } from './anatomyscene';
import { createAnatomyOpenGate } from './anatomyopen';
import '../styles/anatomy-lab.css';
import AnatomyLabCover from './AnatomyLabCover';
import { breadcrumb, siblings } from './anatomyhierarchy';
import { boxesFromMeshes, expandNearby, nearbyStructures } from './anatomynearby';
import { canSpeak, speak, stop as stopSpeaking } from './anatomyspeech';
import { groupIndex, indexHeading, indexStep, inspectorRows, leaderSegment } from './anatomyinspector';
import { flagMailto } from '../scripts/footer';
import {
  backspace as roundBackspace, currentTarget, hintLetter, nextQuestion,
  roundFinished, setFirstLetters, setNearby, showAnswer, skipQuestion, startRound, typeLetter, type StudyRound,
} from './anatomyround';
import { AnatomyFocusPanel } from './AnatomyFocusPanel';
import { fadedByFocus, focusFromQuery, labelItHref, toggleFocus, toggleFocusGroup } from './anatomyfocus';
import { StudyCells, StudyEntryPanel, StudyRoundSide, usesTouch, type StudyChoice } from './AnatomyStudyRound';
import { site } from '../config/site';
import { createAnatomyStudy, createReviewQueueRequestGuard, createSavedViewsRequestGuard, createStudyIdentityGuard, queueFromQuizMisses, type AnatomyStudyClient, type ReviewQueueRow, type SavedViewRow, type StudyIdentitySnapshot } from './anatomystudy';
import { getSupabase } from './supabaseclient';
import { STRUCTURE_PAGE_SIZE, visibleStructureGroups } from './anatomy-list-window';
import { anatomyTriangleNote } from './anatomybudget';
import {
  KEY_MAP,
  ORIENTATIONS,
  VIEW_PRESETS as NAV_VIEW_PRESETS,
  VIEW_WORDS,
  canvasKeyAction,
  coverDownloadNote,
  focusFromSearch,
  formatDownloadSize,
  initialSystemKey,
  openingSystemFirst,
  linkedStructureId,
  presetDirection,
  tappableIds,
  tappableRound,
  spreadBlocksSaving,
  SPREAD_SAVE_NOTE,
  type ViewPreset,
} from './anatomyviews';
import {
  answerRecallChoice,
  answerRecallTyped,
  nextRecall,
  recallSettled,
  revealRecall,
  startRecall,
  type RecallCatalog,
  type RecallState,
} from './anatomyrecall';
import {
  worksheetBlockReason,
  worksheetCreditLines,
  worksheetFileName,
  worksheetLabels,
  worksheetLeftOutNote,
  worksheetOrder,
  worksheetRows,
  type WorksheetRow,
} from './anatomyworksheet';
import { printGame } from './gameprint';
import {
  WHOLE_BODY_KEY,
  systemsForView,
  type Layer,
  layerShown,
  layersOf,
  unavailableLayersNote,
  nextToPeel,
  nextToRestore,
  toggleLayer,
} from './anatomylayers';
import {
  BODYPARTS3D_CREDIT_LEAD,
  BODYPARTS3D_LICENSE_NAME,
  BODYPARTS3D_LICENSE_URL,
  BODYPARTS3D_REFERENCE_NOTE,
  BODYPARTS3D_REFERENCE_URL,
  BEHIND_MARK,
  DEFAULT_MODE,
  FADED_MARK,
  LAB_MODES,
  TEXT_FALLBACK_BATCH,
  EXPORT_SIZES,
  VIEW_PRESETS,
  answerQuiz,
  anatomyFailureMessage,
  breadcrumbRows,
  canRedo,
  createCompareSync,
  COMPARE_SYNC_MS,
  canUndo,
  createHistory,
  creditFor,
  exportFileName,
  fadeStructure,
  groupStructures,
  hideStructure,
  historyShortcut,
  labelLines,
  labelTextFor,
  labelsThatFit,
  labelsToShow,
  leftOutNote,
  missToRecord,
  modeLabel,
  nameSourceFor,
  nextQuiz,
  queuedForSystem,
  pictureCreditFor,
  placeLabels,
  push,
  recallLegend,
  recallNumbers,
  redo,
  releaseNoteFor,
  onlyThis,
  restoreAll,
  revealQuiz,
  revealedQuizTarget,
  reviewQuizPool,
  savedCamera,
  cameraToModelFrame,
  cameraToWorldFrame,
  savingViewBusy,
  savingViewSettled,
  savingViewStarted,
  structureTree,
  savedVisibility,
  showSiblings,
  startQuiz,
  structureState,
  tapAction,
  textFallbackItems,
  undo,
  visibilityEquals,
  type AnatomySystem,
  type ExportSize,
  type History,
  type LabMode,
  type PlacedLabel,
  type Posture,
  type QuizState,
  type Visibility,
} from './anatomylab';

export interface AnatomyLabProps {
  systems: AnatomySystem[];
  /** The tests' fixture system, shown first and only when the address has ?fixture (never on the live site's build). */
  fixture?: AnatomySystem | null;
  /** True on builds that show drafts: draft systems then carry the "draft · labels waiting for review" note. */
  drafts: boolean;
  /** Each system's model file size in bytes, measured at build time, for the "download" notes. */
  modelBytes?: Readonly<Record<string, number>>;
  /** True when the small cover island (`AnatomyLabOpen.tsx`) already took the tap: open at once instead of showing the cover. */
  autoOpen?: boolean;
  /** Leaves the full-page lab and goes back to the page it was opened from. */
  onExit?: () => void;
}

interface Worksheet {
  systemKey: string;
  title: string;
  /** The numbered picture, as a data: URL (the content security policy allows data: images, not blob: ones). */
  src: string;
  fileName: string;
  rows: WorksheetRow[];
  note: string;
}

/** A saved picture as a data: URL, for an <img> the content security policy allows. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable')));
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsDataURL(blob);
  });
}

type Props = AnatomyLabProps;

type Phase = 'cover' | 'opening' | 'open' | 'error';
type SystemLoad = { state: 'loading' } | { state: 'ready'; systemKey: string; result: LoadResult; publishedFiles: ReadonlySet<string> } | { state: 'error'; message: string };

// Inside the lab's dark frame the buttons are the lab's own pills (src/styles/anatomy-lab.css). The worksheet sits
// outside the frame, on the page's normal colors, so it keeps the plain buttons.
const primaryButton = 'lab-btn lab-btn-primary';
const secondaryButton = 'lab-btn';
const iconButton = 'lab-btn px-3';
const plainPrimaryButton =
  'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-60';
const plainButton =
  'min-h-11 min-w-11 rounded-pill border border-control px-4 py-2 text-sm text-ink aria-pressed:border-button aria-pressed:bg-button aria-pressed:text-on-button disabled:opacity-60';

const STEP = Math.PI / 24; // 7.5° a press
const ZOOM_IN = 0.85;
/** How many nearby structures "show nearby" reveals around the selected one. */
const NEARBY_LIMIT = 8;
/** The lab's spoken names are English (the source file's names). */
const SPEECH_LANG = 'en';
/** The one study-tools client for the page (Task 178, part C): null client (accounts off) or signed out sends nothing. */
const defaultStudy = () => createAnatomyStudy(getSupabase as unknown as () => Promise<AnatomyStudyClient | null>);

type BulkDownloadPrompt =
  | { kind: 'all'; systemKey: string; files: number; restoreFades: boolean }
  | { kind: 'saved-view'; systemKey: string; files: number; view: SavedViewRow; identity: StudyIdentitySnapshot };


/** One Shift-arrow or Shift-wheel step slides the model by this share of the distance to it. */
const PAN_SHARE = 0.08;

/** The modifier keys held during a key press or a wheel step. */
function heldModifiers(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): Modifiers {
  return {
    shift: event.shiftKey,
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    mac: isApplePlatform(navigator.platform ?? '', navigator.userAgent ?? ''),
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A label on the 3D view: its box, and its name's lines (with "(behind)" for a structure hidden from this side). */
type OverlayLabel = PlacedLabel & Pick<ReturnType<typeof labelLines>, 'lines' | 'mark'>;

// Keep the no-label state referentially stable. The scene calls its render callback for the first
// frame even when labels are off; a freshly allocated [] would make React schedule needless work.
const EMPTY_OVERLAY_LABELS: OverlayLabel[] = [];

/** The label box's measurements, read from the same token-backed classes the label is drawn with. */
interface LabelMetrics {
  fontPx: number;
  line: number;
  padX: number;
  padY: number;
  borderX: number;
}

function readLabelMetrics(): LabelMetrics {
  const probe = document.createElement('span');
  probe.className = 'invisible absolute border px-2 py-1 text-sm leading-normal';
  probe.textContent = 'x';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const fontPx = parseFloat(style.fontSize) || 15;
  const metrics = {
    fontPx,
    line: parseFloat(style.lineHeight) || fontPx * 1.5,
    padX: parseFloat(style.paddingLeft) || 0,
    padY: parseFloat(style.paddingTop) || 0,
    borderX: parseFloat(style.borderLeftWidth) || 0,
  };
  probe.remove();
  return metrics;
}

/** The notes under the view about labels: which found no room, and what "(behind)" means. */
function labelNotes(names: ReadonlyMap<string, string>, leftOut: readonly string[], anyBehind: boolean): string[] {
  const notes: string[] = [];
  const missing = leftOutNote(leftOut.map((id) => names.get(id) ?? id));
  if (missing) notes.push(`${missing} turn or zoom the model, or hide some structures, to make room.`);
  if (anyBehind) notes.push(`a label marked ${BEHIND_MARK} names a structure hidden behind others from this view: turn the model to see it.`);
  return notes;
}

/** The label overlay's font, at the size the label's text-sm class resolves to. */
function measureLabel(font: string, fontPx: number): (s: string) => number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return (s) => s.length * (fontPx / 2);
  ctx.font = `400 ${fontPx}px ${font}`;
  return (s) => ctx.measureText(s).width;
}

/**
 * The anatomy lab (Task 178): one body system at a time, its structures listed by their official names, picking in 3D
 * or from the list, labels with leader lines, a "find it" quiz and picture export for Christian's posts and videos.
 * Nothing from three.js loads before the student taps "open the anatomy lab". Rendered client:only.
 */
export default function AnatomyLab({ systems: baseSystems, fixture, drafts, autoOpen = false, modelBytes = {}, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>(autoOpen ? 'opening' : 'cover');
  const [textLimit, setTextLimit] = useState(TEXT_FALLBACK_BATCH);
  const systems = useMemo(() => {
    const wantsFixture = fixture && new URLSearchParams(window.location.search).has('fixture');
    // Build the combined catalog after an open attempt, including when 3D fails and students need the text fallback.
    // It is never duplicated in the unopened page's hydration data. Keep the fixture first.
    return systemsForView(baseSystems, phase === 'open' || phase === 'error', wantsFixture ? fixture : null);
  }, [baseSystems, fixture, phase]);
  // A lesson can link straight to a system and structure: ?system=heart&structure=FMA7204 (src/islands/anatomyviews.ts).
  const focus = useMemo(() => focusFromSearch(window.location.search), []);
  const focusSystemDone = useRef(false);
  const focusStructureDone = useRef(false);
  const [systemKey, setSystemKey] = useState(() => initialSystemKey(openingSystemFirst(systems).map((s) => s.key), focus));
  const activeSystemKeyRef = useRef(systemKey);
  activeSystemKeyRef.current = systemKey;
  const [load, setLoad] = useState<SystemLoad>({ state: 'loading' });
  const loadStateRef = useRef(load.state);
  loadStateRef.current = load.state;
  const [initialRetry, setInitialRetry] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [faded, setFaded] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<History<Visibility>>(() => createHistory({ hidden: new Set(), faded: new Set() }));
  const [mode, setMode] = useState<LabMode>(DEFAULT_MODE);
  const [posture, setPosture] = useState<Posture>('standing');
  const [recallOn, setRecallOn] = useState(false);
  const [recallRevealed, setRecallRevealed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [listLimit, setListLimit] = useState(STRUCTURE_PAGE_SIZE);
  const [labelsOn, setLabelsOn] = useState(false);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [recall, setRecall] = useState<RecallState | null>(null);
  const [round, setRound] = useState<StudyRound | null>(null);
  // The answer cells: a switch or hint hands the keyboard back to them, because typing is handled there.
  const studyCellsRef = useRef<HTMLDivElement>(null);
  // Names stay off the screen (labels, search, list, card) while a name is being recalled or tested.
  const namesHidden = recall !== null || (round !== null && round.mode === 'test' && !roundFinished(round));
  const [typed, setTyped] = useState('');
  const [alone, setAlone] = useState(false);
  const aloneSavedRef = useRef<ReadonlySet<string>>(new Set());
  const [keysOpen, setKeysOpen] = useState(false);
  const keysButtonRef = useRef<HTMLButtonElement>(null);
  const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
  const [worksheetBusy, setWorksheetBusy] = useState(false);
  const [worksheetNote, setWorksheetNote] = useState('');
  const [answersShown, setAnswersShown] = useState(false);
  const worksheetHeadingRef = useRef<HTMLHeadingElement>(null);
  const [transparent, setTransparent] = useState(false);
  const [exporting, setExporting] = useState<ExportSize | null>(null);
  const [exportNote, setExportNote] = useState('');
  const [announce, setAnnounce] = useState('');
  const [labelNote, setLabelNote] = useState<string[]>([]);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [layerError, setLayerError] = useState<{ layer: string; message: string; retry: () => void } | null>(null);
  const [filesLoaded, setFilesLoaded] = useState(0);
  const [bulkPrompt, setBulkPrompt] = useState<BulkDownloadPrompt | null>(null);
  // Study tools (Task 178, integration): the review queue and saved views exist only for a signed-in student.
  const study = useMemo(defaultStudy, []);
  const savedViewsRequestGuard = useMemo(createSavedViewsRequestGuard, []);
  const reviewQueueRequestGuard = useMemo(createReviewQueueRequestGuard, []);
  const identityGuard = useMemo(createStudyIdentityGuard, []);
  // Keep the actual account ID reactive: A -> B must refresh even though both are signed in.
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const signedIn = activeUserId !== null;
  const [reviewRows, setReviewRows] = useState<ReviewQueueRow[]>([]);
  const [savedViews, setSavedViews] = useState<SavedViewRow[]>([]);
  const [viewName, setViewName] = useState('');
  // The systems with a save in flight, so switching systems never leaves the button stuck and never frees it early.
  const [savingViews, setSavingViews] = useState<ReadonlySet<string>>(new Set());
  const [compareKey, setCompareKey] = useState('');
  const [compareState, setCompareState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // The lab's shell: which side panel is open below the desktop width, the "more" drawer, which orientation is
  // showing, the orientation thumbnails (pictures of the loaded model) and "spread structures apart" (0 to 1).
  const [panels, setPanels] = useState({ orientation: false, systems: false, structures: false });
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidesHidden, setSidesHidden] = useState(false);
  const [treeMin, setTreeMin] = useState(false);
  const [remoteMin, setRemoteMin] = useState(false);
  // The model turns by itself until the student stops it (Christian, 2026-11-27).
  const [spinning, setSpinning] = useState(false);
  const [stage, setStage] = useState<'black' | 'white'>('black');
  const moreRef = useRef<HTMLDivElement>(null);
  // The other tools open under the stage; bring them into view so the tap visibly does something on a full-page lab.
  useEffect(() => {
    if (moreOpen) moreRef.current?.scrollIntoView({ block: 'nearest' });
  }, [moreOpen]);
  const [orientation, setOrientation] = useState<ViewPreset | 'free' | null>('front');
  const [thumbs, setThumbs] = useState<Partial<Record<'front' | 'back' | 'left', string>>>({});
  const [spread, setSpread] = useState(0);
  // The study round (Task 178, redesign part 3): learn it / test it over the selected group, or find it.
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const [studyChoice, setStudyChoice] = useState<StudyChoice>('learn');
  const [studyLocation, setStudyLocation] = useState<{ url: string; marks: ReadonlyMap<string, { x: number; y: number }>; word: string | null } | null>(null);
  const studyStartRef = useRef(0);
  const studyGroupRef = useRef<{ name: string; ids: string[] } | null>(null);
  const studySavedHiddenRef = useRef<ReadonlySet<string>>(new Set());
  const [touchKeys] = useState(usesTouch);
  // The ring round the selection and the leader line to the inspector card are moved by hand on every frame.
  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const leaderRef = useRef<SVGLineElement>(null);
  const markedIdRef = useRef<string | null>(null);
  const indexItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const labRef = useRef<HTMLDivElement>(null);
  const speechOn = useMemo(() => canSpeak(), []);
  const generation = useMemo(() => createGeneration(), []);
  // An account change aborts outgoing-user picture exports without cancelling
  // system downloads that are shared public geometry.
  const pictureExportGeneration = useMemo(() => createGeneration(), []);
  const worksheetExportGeneration = useMemo(() => createGeneration(), []);
  const openGate = useMemo(() => createAnatomyOpenGate(), []);
  // Every explicit show/hide choice supersedes the visibility effect of earlier downloads.
  const visibilityIntent = useMemo(() => createGeneration(), []);
  const loaderRef = useRef<OnDemandLoader<LoadResult> | null>(null);

  const fallbackHeadingRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showAllButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAllButtonRef = useRef<HTMLButtonElement>(null);
  const confirmBulkButtonRef = useRef<HTMLButtonElement>(null);
  const savedViewPromptTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sceneRef = useRef<LabScene | null>(null);
  const colorsRef = useRef<LabColors | null>(null);
  const readColorsRef = useRef<(() => LabColors) | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const activePointers = useRef(new Set<number>());
  const nextListFocusId = useRef<string | null>(null);
  const nextListItemRef = useRef<HTMLLIElement | null>(null);
  const labelIdsRef = useRef<string[]>([]);
  const setPlacedRef = useRef<((labels: OverlayLabel[]) => void) | null>(null);
  const labelNoteRef = useRef('');
  const measureRef = useRef<{ font: string; measure: (s: string) => number; metrics: LabelMetrics } | null>(null);
  const compareCanvasRef = useRef<HTMLCanvasElement>(null);
  const compareSceneRef = useRef<LabScene | null>(null);
  // Async comparison loads and camera callbacks must use the latest chosen posture.
  const postureRef = useRef(posture);
  postureRef.current = posture;
  const compareSyncRef = useRef<ReturnType<typeof createCompareSync> | null>(null);

  // A pending phone consent never survives a body-system change.
  useEffect(() => setBulkPrompt(null), [systemKey]);
  useEffect(() => {
    if (bulkPrompt?.systemKey === systemKey) confirmBulkButtonRef.current?.focus();
  }, [bulkPrompt, systemKey]);

  const system = systems.find((s) => s.key === systemKey) ?? systems[0];
  const identitySystemRef = useRef(system);
  identitySystemRef.current = system;
  const names = useMemo(() => new Map(system?.structures.map((s) => [s.id, s.text]) ?? []), [system]);
  const recallCatalog = useMemo<RecallCatalog>(() => ({
    ids: system?.structures.map((s) => s.id) ?? [],
    names,
    groups: new Map(system?.structures.map((s) => [s.id, s.group]) ?? []),
  }), [system, names]);
  // Recall mode's numbers: one per structure in the system's own order, so a number never changes while hiding.
  const numbers = useMemo(() => recallNumbers(system?.structures.map((s) => s.id) ?? []), [system]);
  const recallNumbersRef = useRef<ReadonlyMap<string, number> | null>(null);
  recallNumbersRef.current = recallOn ? numbers : null;
  const found = load.state === 'ready' ? load.result.found : [];
  const foundSet = useMemo(() => new Set(found), [found]);
  const visible = useMemo(() => found.filter((id) => !hidden.has(id)), [found, hidden]);
  const groups = useMemo(() => groupStructures(system?.structures ?? [], query), [system, query]);
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);
  // A group folded shut with its heading's arrow lists no rows, so the groups after it come up without scrolling.
  // A search opens every group again: a match must never hide inside a folded group.
  const [foldedGroups, setFoldedGroups] = useState<ReadonlySet<string>>(new Set());
  // Choose what to focus on (anatomyfocus.ts): the structures picked for label it, and whether picking is on.
  const [picks, setPicks] = useState<string[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [focusFull, setFocusFull] = useState(false);
  const focusReadyRef = useRef(false);
  const knownIds = useMemo(() => new Set(systems.flatMap((s) => s.structures.map((x) => x.id))), [systems]);
  const pickSet = useMemo(() => new Set(picks), [picks]);
  const systemKeyForFolds = system?.key;
  useEffect(() => setFoldedGroups(new Set()), [systemKeyForFolds]);
  const searching = query.trim() !== '';
  const openGroups = useMemo(
    () => groups.filter((group) => searching || group.group === null || !foldedGroups.has(group.group)),
    [groups, foldedGroups, searching],
  );
  const openCount = openGroups.reduce((n, g) => n + g.items.length, 0);
  const listedOpen = useMemo(() => visibleStructureGroups(openGroups, listLimit), [openGroups, listLimit]);
  const listedCount = Math.min(openCount, listLimit);
  // Every group up to the last one with rows on screen, folded ones included as a heading alone.
  const listedGroups = useMemo(() => {
    const rows = new Map(listedOpen.map((group) => [group.group, group.items]));
    const reachedEnd = listedOpen.reduce((n, g) => n + g.items.length, 0) >= openCount;
    const last = listedOpen[listedOpen.length - 1]?.group;
    const result: { group: string | null; items: typeof groups[number]['items']; total: number; folded: boolean }[] = [];
    let pastLast = listedOpen.length === 0;
    for (const group of groups) {
      const items = rows.get(group.group);
      if (items) result.push({ group: group.group, items, total: group.items.length, folded: false });
      else if (!openGroups.includes(group) && (!pastLast || reachedEnd)) result.push({ group: group.group, items: [], total: group.items.length, folded: true });
      if (group.group === last) pastLast = true;
    }
    return result;
  }, [groups, openGroups, listedOpen, openCount]);
  const toggleGroup = (name: string) => setFoldedGroups((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const namedGroups = groups.filter((group) => group.group !== null).map((group) => group.group as string);
  const allFolded = namedGroups.length > 0 && namedGroups.every((name) => foldedGroups.has(name));
  // After expanding, keyboard focus moves to the first new row, even if its 3D file is not loaded yet.
  useEffect(() => {
    if (nextListFocusId.current === null) return;
    nextListItemRef.current?.focus();
    nextListFocusId.current = null;
  }, [listLimit]);
  // The whole-body view fetches a layer's model files only when the student gets to it (src/islands/anatomylazy.ts).
  const lazy = system?.key === WHOLE_BODY_KEY && !!system.model.layerFiles;
  const layers = useMemo(
    () => (lazy ? layersOf(system?.structures ?? []) : layersOf(system?.structures ?? [], foundSet)),
    [lazy, system, foundSet],
  );
  const revealedTarget = revealedQuizTarget(quiz);
  const peelPlan = lazy ? lazyPeel(layers, hidden) : null;
  const toPeel = lazy ? (peelPlan ? peelPlan.show : null) : nextToPeel(layers, hidden);
  const toRestore = lazy ? lazyRestore(layers, hidden) : nextToRestore(layers, hidden);
  const layerGapNote = system?.key === WHOLE_BODY_KEY ? unavailableLayersNote(system.structures) : null;
  const labelIds = useMemo(
    () => {
      if (!labelsOn || quiz || namesHidden) return [];
      // Sizes come from the loaded model; before it is ready there is nothing to measure, and nothing to label.
      const bounds = load.state === 'ready' ? sceneRef.current?.boundsById() : undefined;
      const sizeOf = (id: string) => {
        const box = bounds?.get(id);
        if (!box) return 0;
        return Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
      };
      return bounds ? labelsThatFit(visible, selected, sizeOf) : labelsToShow(visible, selected);
    },
    // The count of found structures changes when model files finish loading, so late layers are measured too.
    [labelsOn, quiz, namesHidden, visible, selected, load.state, found.length],
  );
  labelIdsRef.current = labelIds;

  // ── Labels follow the camera: re-laid out after every frame the scene draws ──────────────────────────────────────
  const updateSelectionMark = useCallback(() => {
    const ring = ringRef.current;
    const line = leaderRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!ring || !line || !stage || !canvas) return;
    const off = () => { ring.removeAttribute('data-on'); line.removeAttribute('data-on'); };
    const id = markedIdRef.current;
    const point = id ? sceneRef.current?.locate([id])[0] : undefined;
    const box = canvas.getBoundingClientRect();
    if (!point || point.x < 0 || point.y < 0 || point.x > box.width || point.y > box.height) { off(); return; }
    const frame = stage.getBoundingClientRect();
    const center = { x: box.left - frame.left + point.x, y: box.top - frame.top + point.y };
    ring.setAttribute('data-on', '');
    const radius = ring.offsetWidth / 2;
    ring.style.transform = `translate(${center.x - radius}px, ${center.y - radius}px)`;
    // The leader only draws where the card floats beside the model (desktop); below that the card sits under it.
    const heading = document.getElementById('anatomy-name-card');
    const card = heading?.closest('section');
    const column = card?.closest<HTMLElement>('[data-testid="anatomy-inspector"]');
    const floating = !!column && getComputedStyle(column).position === 'absolute';
    if (!heading || !card || !floating) { line.removeAttribute('data-on'); return; }
    const cardBox = card.getBoundingClientRect();
    const headingBox = heading.getBoundingClientRect();
    const segment = leaderSegment(center, radius, { x: cardBox.left - frame.left, y: headingBox.top - frame.top + headingBox.height / 2 });
    if (!segment) { line.removeAttribute('data-on'); return; }
    line.setAttribute('x1', String(segment.x1));
    line.setAttribute('y1', String(segment.y1));
    line.setAttribute('x2', String(segment.x2));
    line.setAttribute('y2', String(segment.y2));
    line.setAttribute('data-on', '');
  }, []);
  const updateSelectionMarkRef = useRef(updateSelectionMark);
  updateSelectionMarkRef.current = updateSelectionMark;

  const updateLabels = useCallback(() => {
    updateSelectionMarkRef.current();
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    const ids = labelIdsRef.current;
    const setPlaced = setPlacedRef.current;
    // The compare view follows this camera: copied at most every COMPARE_SYNC_MS, so a drag never doubles the work.
    // A copy that comes inside the window is sent once, trailing, so the comparison ends on the settled camera.
    if (scene) compareSyncRef.current?.request();
    if (!setPlaced) return;
    // Always tell the scene which labels are wanted (none too), so it checks what the camera sees only when needed.
    const points = scene && canvas ? scene.project(ids) : [];
    const showNotes = (notes: string[]) => {
      const key = notes.join('\n');
      if (key !== labelNoteRef.current) {
        labelNoteRef.current = key;
        setLabelNote(notes);
      }
    };
    if (!scene || !canvas || ids.length === 0) {
      setPlaced(EMPTY_OVERLAY_LABELS);
      showNotes([]);
      return;
    }
    const font = colorsRef.current?.font ?? 'sans-serif';
    if (measureRef.current?.font !== font) {
      const metrics = readLabelMetrics();
      measureRef.current = { font, measure: measureLabel(font, metrics.fontPx), metrics };
    }
    const { measure, metrics } = measureRef.current;
    const maxText = Math.min(240, Math.max(120, canvas.clientWidth * 0.42));
    const text = new Map<string, ReturnType<typeof labelLines>>();
    const anchors = points.map((point) => {
      const lines = labelLines(labelTextFor(point.id, names, recallNumbersRef.current), point.behind, maxText, measure);
      text.set(point.id, lines);
      const count = lines.lines.length + (lines.mark === 'line' ? 1 : 0);
      return {
        ...point,
        width: Math.ceil(lines.width) + 2 * (metrics.padX + metrics.borderX) + 2,
        height: Math.ceil(count * metrics.line + 2 * metrics.padY),
      };
    });
    const model = scene.extent();
    const layout = placeLabels(anchors, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      offset: 16,
      ...(model ? { columns: { left: model.x, right: model.x + model.width } } : {}),
    });
    setPlaced(layout.placed.map((label) => ({ ...label, lines: text.get(label.id)!.lines, mark: text.get(label.id)!.mark })));
    // Labels off the edge of the view count as left out too, so a missing name is never silent.
    const projected = new Set(points.map((point) => point.id));
    const leftOut = [...ids.filter((id) => !projected.has(id)), ...layout.leftOut];
    showNotes(labelNotes(names, leftOut, layout.placed.some((label) => label.behind)));
  }, [names]);
  const updateLabelsRef = useRef(updateLabels);
  updateLabelsRef.current = updateLabels;
  useEffect(() => updateLabels(), [labelIds, updateLabels, recallOn]);

  // ── Open: load three.js and the scene module only now ─────────────────────────────────────────────────────────────
  const open = useCallback(async () => {
    // A double tap must not start two competing WebGL scenes. An unmount invalidates the
    // ticket before either the dynamic import or the next animation frame can finish.
    const attempt = openGate.begin();
    if (attempt === null) return;
    setBulkPrompt(null);
    setPosture('standing');
    postureRef.current = 'standing';
    // A retry must not expose the previous system's ready state before its new GLB starts.
    setLoad({ state: 'loading' });
    setSelected(null);
    setQuiz(null);
    setRecall(null);
    // The old model's study round has nothing to ask about any more.
    setRound(null);
    setStudyLocation(null);
    studyGroupRef.current = null;
    setAlone(false);
    setPending(new Set());
    setLayerError(null);
    setFilesLoaded(0);
    setExporting(null);
    setExportNote('');
    setLabelNote([]);
    setAnnounce('');
    setPhase('opening');
    try {
      const { createLabScene, readColors } = await import('./anatomyscene');
      if (!openGate.current(attempt)) return;
      // Wait a frame so React has put the canvas on the page (the timeout covers background tabs, which get no frames).
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
        setTimeout(resolve, 250);
      });
      if (!openGate.current(attempt)) return;
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('The 3D view could not start.');
      // The lab's own element, so its dark-look tokens (src/styles/tokens.css) apply in Light as in Evening.
      const getColors = () => readColors(labRef.current ?? undefined);
      const nextColors = getColors();
      const nextScene = createLabScene({
        canvas,
        reducedMotion: prefersReducedMotion(),
        onSpinStop: () => setSpinning(false),
        colors: nextColors,
        posture: postureRef.current,
        onRender: () => updateLabelsRef.current(),
      });
      if (!openGate.current(attempt)) {
        nextScene.dispose();
        return;
      }
      readColorsRef.current = getColors;
      colorsRef.current = nextColors;
      sceneRef.current = nextScene;
      setPhase('open');
    } catch {
      if (!openGate.current(attempt)) return;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      // The original WebGL or network exception may contain internal paths and URLs.
      setPhase('error');
    } finally {
      openGate.finish(attempt);
    }
  }, [openGate]);

  // ── Load the chosen system (and only it); the scene disposes the previous one ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'open' || !system) return;
    const scene = sceneRef.current;
    if (!scene) return;
    let current = true;
    // Drop the previous system's model and any layer still downloading before anything else (loading state follows).
    loaderRef.current?.retire();
    loaderRef.current = null;
    generation.bump();
    // A system-picker click invalidates this initial load before React effect cleanup runs.
    const initialLoadToken = generation.token();
    visibilityIntent.bump();
    setExporting(null);
    setExportNote('');
    scene.clear();
    setSpread(0);
    setOrientation('front');
    setLoad({ state: 'loading' });
    setSelected(null);
    setQuiz(null);
    setRecall(null);
    // The old model's study round has nothing to ask about any more.
    setRound(null);
    setStudyLocation(null);
    studyGroupRef.current = null;
    setAlone(false);
    setPending(new Set());
    setLayerError(null);
    loaderRef.current = null;
    const wholeLayers = system.key === WHOLE_BODY_KEY && system.model.layerFiles ? layersOf(system.structures) : null;
    // Files can hold structures in several layers. Map all of their IDs now, while showing only the first layer.
    const initial = wholeLayers ? initialLayerPlan(system, wholeLayers) : null;
    setHidden(initial?.hidden ?? new Set());
    // A new model starts a fresh visibility history: nothing to undo back into the previous system.
    setFaded(new Set());
    setHistory(createHistory({ hidden: initial?.hidden ?? new Set(), faded: new Set() }));
    // Requested files are not counted until the first model batch succeeds.
    setFilesLoaded(0);
    scene
      .load(initial?.files ?? (system.model.files ?? system.model.file), initial?.ids ?? system.structures.map((s) => s.id))
      .then((result) => {
        if (!current || !generation.isCurrent(initialLoadToken) || !result) return;
        if (initial) {
          // Apply the first-layer visibility before the React ready-state effect runs.
          scene.setAppearance({ hidden: initial.hidden, selected: null });
          const loader = createOnDemandLoader<LoadResult>(
            (url) => {
              const ids = idsForFiles(system, wholeLayers!, [url]);
              return scene.add(url, ids).then((r) => {
                if (!r || !current || !generation.isCurrent(initialLoadToken)) {
                  throw new Error('The view changed while this layer downloaded.');
                }
                return r;
              });
            },
            (url, result) => {
              // Commit the file URL and found IDs together. A slow, unrelated
              // GLB must not hide an already verified missing-structure note.
              setFilesLoaded((count) => count + 1);
              setLoad((prev) => prev.state !== 'ready'
                ? prev
                : { state: 'ready', systemKey: prev.systemKey, ...publishAnatomyFile(prev, url, result) });
            },
            () => {
              // The downloaded model is valid. Surface a recoverable list
              // problem rather than reporting a false network/model failure.
              setLayerError({
                layer: 'structure list',
                message: 'a model loaded, but its names could not be updated. reload the system to recover.',
                retry: () => setInitialRetry((count) => count + 1),
              });
            },
          );
          for (const url of initial.files) loader.markLoaded(url);
          loaderRef.current = loader;
          setFilesLoaded(loader.loadedCount());
        } else {
          // Eager model counts are also based on completed, not requested, files.
          setFilesLoaded((system.model.files ?? [system.model.file]).length);
        }
        // The initial GLBs become published only after scene.load succeeds.
        setLoad({ state: 'ready', systemKey: system.key, result, publishedFiles: new Set(initial?.files ?? (system.model.files ?? [system.model.file])) });
        setAnnounce(`${system.title}: ${result.found.length} structures loaded.`);
      })
      .catch((err: unknown) => {
        // An obsolete GLB rejection must not show a failure for the newly chosen system.
        if (!current || !generation.isCurrent(initialLoadToken)) return;
        setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      current = false;
      loaderRef.current?.retire();
    };
  }, [phase, system, initialRetry]);

  /** Shows a layer, fetching its model files first if the student has not got to it yet; `then` hides another after. */
  const reveal = useCallback(
    (layer: Layer, hideAfter?: Layer) => {
      const loader = loaderRef.current;
      if (!system || !loader) return;
      const run = () => {
        const intent = visibilityIntent.token();
        setLayerError(null);
        setPending((p) => new Set(p).add(layer.id));
        loader
          .ensure(filesForLayer(system, layer.id))
          .then(() => {
            if (loader.isRetired()) return; // the system changed while this layer downloaded
            // Geometry and structure counts always update. An older download must not
            // overwrite a newer "show only this", hide or layer choice.
            setHidden((h) => visibilityAfterLayerDownload(
              h, layer.ids, hideAfter?.ids ?? [], visibilityIntent.isCurrent(intent),
            ));
            if (visibilityIntent.isCurrent(intent)) {
              setAnnounce(hideAfter ? `peeled away ${hideAfter.id}, showing ${layer.id}` : `${layer.id} loaded and shown`);
            }
          })
          .catch((err: unknown) => {
            if (loader.isRetired()) return;
            // Completed files were already published individually, even if this batch failed.
            if (visibilityIntent.isCurrent(intent)) {
              setLayerError({
                layer: layer.id,
                message: anatomyFailureMessage('layer', err),
                retry: () => { visibilityIntent.bump(); run(); },
              });
            }
          })
          .finally(() => loader.isRetired() || setPending((p) => new Set([...p].filter((id) => id !== layer.id))));
      };
      run();
    },
    [system, visibilityIntent],
  );

  /** Show every structure; in the lazy whole-body view, layers not fetched yet are fetched, then shown. */
  const showAllNow = (restoreFades = false) => {
    visibilityIntent.bump();
    if (restoreFades) {
      setFaded(new Set());
      setAnnounce('restoring all structures. remaining layers may still be loading.');
    }
    const loader = loaderRef.current;
    if (!lazy || !system || !loader) {
      setHidden(new Set());
      return;
    }
    const plan = showAllPlan(layers, hidden, (id) => filesForLayer(system, id), (url) => loader.isLoaded(url));
    setHidden((h) => {
      const next = new Set(h);
      for (const id of plan.unhide) next.delete(id);
      return next;
    });
    for (const layer of plan.fetch) reveal(layer);
  };

  /** Require consent for bulk whole-body GLB downloads on phones. */
  const showAll = (restoreFades = false) => {
    const loader = loaderRef.current;
    if (lazy && system && loader) {
      const plan = showAllPlan(layers, hidden, (id) => filesForLayer(system, id), (url) => loader.isLoaded(url));
      const missingFiles = new Set(
        plan.fetch.flatMap((layer) => filesForLayer(system, layer.id).filter((url) => !loader.isLoaded(url))),
      );
      const narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
      if (needsBulkLayerConfirmation(narrow, missingFiles.size)) {
        setBulkPrompt({ kind: 'all', systemKey: system.key, files: missingFiles.size, restoreFades });
        return;
      }
    }
    setBulkPrompt(null);
    showAllNow(restoreFades);
  };

  const finishBulkPrompt = (confirm: boolean) => {
    const prompt = bulkPrompt;
    const valid = prompt?.systemKey === system?.key && load.state === 'ready'
      && loaderRef.current !== null && !loaderRef.current.isRetired();
    setBulkPrompt(null);
    if (confirm && valid && prompt) {
      if (prompt.kind === 'all') showAllNow(prompt.restoreFades);
      else if (identityGuard.isCurrent(prompt.identity) && activeUserId === prompt.identity.userId
          && savedViews.some((view) => view.id === prompt.view.id && view.system_key === prompt.systemKey)) {
        // Recalculate which files remain uncached after consent. Public model
        // files can only have been added to the cache while the dialog was open.
        openView(prompt.view, true);
      }
    }
    if (prompt?.kind === 'saved-view') {
      savedViewPromptTriggerRef.current?.focus();
      savedViewPromptTriggerRef.current = null;
    } else if (prompt?.kind === 'all' && prompt.restoreFades) restoreAllButtonRef.current?.focus();
    else showAllButtonRef.current?.focus();
  };

  // Once the correct target is found or revealed, it must remain visible and selected.
  // A learner can hide a structure before answering, or later hide its whole layer.
  useEffect(() => {
    if (!revealedTarget) return;
    setHidden((current) => {
      if (!current.has(revealedTarget)) return current;
      const next = new Set(current);
      next.delete(revealedTarget);
      return next;
    });
    setSelected((current) => (current === revealedTarget ? current : revealedTarget));
  }, [revealedTarget, hidden, selected]);

  useEffect(() => {
    if (load.state !== 'ready') return;
    // Choosing what to focus on fades everything not chosen; it does not touch the student's own faded set or its undo.
    const shownFaded = focusMode && system ? new Set([...faded, ...fadedByFocus(system.structures.map((s) => s.id), picks)]) : faded;
    sceneRef.current?.setAppearance({ hidden, selected, faded: shownFaded });
  }, [hidden, selected, faded, load, focusMode, picks, system]);

  // The choice comes from the address (a link from label it), once the ids are known.
  useEffect(() => {
    if (focusReadyRef.current || knownIds.size === 0) return;
    focusReadyRef.current = true;
    const linked = focusFromQuery(window.location.search, knownIds);
    if (linked.length > 0) {
      setPicks(linked);
      setFocusMode(true);
    }
  }, [knownIds]);

  // A linked system that only exists once the lab is open (the whole body) is chosen as soon as it appears.
  useEffect(() => {
    if (focusSystemDone.current || !focus.system) return;
    if (systemKey === focus.system) {
      focusSystemDone.current = true;
    } else if (systems.some((s) => s.key === focus.system)) {
      focusSystemDone.current = true;
      setSystemKey(focus.system);
    } else if (phase === 'open' || phase === 'error') {
      focusSystemDone.current = true; // this build doesn't have it: stay on the first system
    }
  }, [focus, systems, systemKey, phase]);

  // A linked structure is selected once, when its system's model is ready and really contains it.
  useEffect(() => {
    if (focusStructureDone.current || !focus.structure || load.state !== 'ready' || !system) return;
    const id = linkedStructureId(focus, system.key, load.systemKey, load.result.found);
    if (!id) return;
    focusStructureDone.current = true;
    setHidden((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSelected(id);
    setAnnounce(`selected ${names.get(id) ?? id}`);
  }, [focus, load, system, names]);

  // "name it": the asked structure is the highlighted one, and stays showing (alone, if the student asked for that).
  const recallTarget = recall?.target ?? null;
  useEffect(() => {
    if (!recallTarget || !system) return;
    setSelected(recallTarget);
    setHidden((current) => {
      if (alone) {
        const only = onlyThis(system.structures.map((s) => s.id), recallTarget);
        return only.size === current.size && [...only].every((id) => current.has(id)) ? current : only;
      }
      if (!current.has(recallTarget)) return current;
      const next = new Set(current);
      next.delete(recallTarget);
      return next;
    });
  }, [recallTarget, alone, system, hidden]);

  // Reduced motion follows the device setting while the lab is open: no drag inertia when it is on.
  useEffect(() => {
    if (phase !== 'open') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => sceneRef.current?.setReducedMotion(mq.matches);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [phase]);

  // A worksheet belongs to the system it was made from.
  useEffect(() => {
    setWorksheet(null);
    setWorksheetNote('');
    setWorksheetBusy(false);
  }, [systemKey, phase]);
  useEffect(() => {
    if (worksheet) worksheetHeadingRef.current?.focus();
  }, [worksheet]);

  // ── Visibility history: every change to hidden or faded is recorded; undo and redo put a recorded state back ──────
  // `push` ignores a state equal to the present one, so an undo (which sets hidden and faded to the present) records
  // nothing, and a new model's reset (history and sets changed together) records nothing either.
  // Delayed outgoing visibility effects must not add A's appearance to B's undo history.
  const identityResetPendingRef = useRef<Visibility | null>(null);
  useEffect(() => {
    const baseline = identityResetPendingRef.current;
    if (baseline) {
      if (visibilityEquals(baseline, { hidden, faded })) identityResetPendingRef.current = null;
      return;
    }
    setHistory((h) => push(h, { hidden, faded }, visibilityEquals));
  }, [hidden, faded]);

  const applyHistory = (next: History<Visibility>, what: 'undo' | 'redo') => {
    if (next === history) return;
    visibilityIntent.bump();
    setHistory(next);
    setHidden(next.present.hidden);
    setFaded(next.present.faded);
    setAnnounce(`${what === 'undo' ? 'undid' : 'redid'} the last change: ${next.present.hidden.size} hidden, ${next.present.faded.size} faded.`);
  };
  const undoVisibility = () => applyHistory(undo(history), 'undo');
  const redoVisibility = () => applyHistory(redo(history), 'redo');

  /** The lab's own shortcuts while focus is inside it: Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z redoes (not in text fields). */
  const onLabKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const inTextField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    const action = historyShortcut(e, inTextField);
    if (!action || load.state !== 'ready') return;
    e.preventDefault();
    if (action === 'undo') undoVisibility();
    else redoVisibility();
  };

  /** One student-made change to what is shown, faded or hidden (recorded in the history by the effect above). */
  const changeVisibility = (change: (current: Visibility) => Visibility) => {
    visibilityIntent.bump();
    const next = change({ hidden, faded });
    setHidden(next.hidden);
    setFaded(next.faded);
  };

  // ── Study tools: who is signed in, their review queue and saved views for this system ─────────────────────────────
  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | null = null;
    const applyIdentity = (userId: string | null) => {
      if (!live || !identityGuard.update(userId)) return;
      // Supabase broadcasts auth changes to other tabs using the same origin. Clear personal data in this tab
      // immediately and retire every in-flight operation before exposing the next identity.
      savedViewsRequestGuard.invalidate();
      reviewQueueRequestGuard.invalidate();
      // The outgoing account's saved view may have changed far more than the
      // saved-view list. Erase its appearance, navigation and export state.
      visibilityIntent.bump();
      const latest = identitySystemRef.current;
      const first = latest?.key === WHOLE_BODY_KEY && latest.model.layerFiles
        ? initialLayerPlan(latest, layersOf(latest.structures)) : null;
      const baseline: Visibility = { hidden: first?.hidden ?? new Set<string>(), faded: new Set<string>() };
      identityResetPendingRef.current = baseline;
      setHistory(createHistory(baseline));
      setHidden(baseline.hidden);
      setFaded(baseline.faded);
      setSelected(null);
      setQuiz(null);
      setRound(null);
      setStudyLocation(null);
      studyGroupRef.current = null;
      setRecallOn(false);
      setRecallRevealed(false);
      // Newer staging's name-it and printable worksheet are also applied presentation.
      setRecall(null);
      setTyped('');
      setAlone(false);
      aloneSavedRef.current = new Set<string>();
      setWorksheet(null);
      setWorksheetBusy(false);
      setWorksheetNote('');
      setAnswersShown(false);
      setKeysOpen(false);
      setMode(DEFAULT_MODE);
      setLabelsOn(false);
      setTransparent(false);
      setTextLimit(TEXT_FALLBACK_BATCH);
      setPending(new Set());
      setLayerError(null);
      setBulkPrompt(null);
      savedViewPromptTriggerRef.current = null;
      setCompareKey('');
      setCompareState('idle');
      setPosture('standing');
      sceneRef.current?.setPosture('standing');
      pictureExportGeneration.bump();
      worksheetExportGeneration.bump();
      setExportNote('');
      setExporting(null);
      setLabelNote([]);
      sceneRef.current?.resetView();
      setQuery('');
      setListLimit(STRUCTURE_PAGE_SIZE);
      nextListFocusId.current = null;
      nextListItemRef.current = null;
      setActiveUserId(userId);
      setReviewRows([]);
      setSavedViews([]);
      setViewName('');
      setSavingViews(new Set());
      setAnnounce('');
    };
    void getSupabase().then((client) => {
      if (!live || !client) {
        applyIdentity(null);
        return;
      }
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        applyIdentity(typeof session?.user?.id === 'string' ? session.user.id : null);
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch(() => applyIdentity(null));
    return () => {
      live = false;
      unsubscribe?.();
      identityGuard.update(null);
      savedViewsRequestGuard.invalidate();
      reviewQueueRequestGuard.invalidate();
    };
  }, [identityGuard, savedViewsRequestGuard, reviewQueueRequestGuard, visibilityIntent, pictureExportGeneration, worksheetExportGeneration]);

  const studyReady = signedIn && load.state === 'ready';
  const refreshReviewQueue = useCallback(() => {
    const identity = identityGuard.snapshot();
    if (!activeUserId || identity.userId !== activeUserId) return;
    const request = reviewQueueRequestGuard.begin();
    void study.reviewQueue(identity.userId).then((outcome) => {
      if (!identityGuard.isCurrent(identity) || !reviewQueueRequestGuard.isCurrent(request)) return;
      if (outcome.ok) setReviewRows(outcome.value);
      else setAnnounce(outcome.message);
    }).catch(() => {
      if (identityGuard.isCurrent(identity) && reviewQueueRequestGuard.isCurrent(request)) {
        setAnnounce('could not load your review queue. please try again.');
      }
    });
  }, [activeUserId, study, identityGuard, reviewQueueRequestGuard]);
  const refreshSavedViews = useCallback((key: string) => {
    const identity = identityGuard.snapshot();
    if (!activeUserId || identity.userId !== activeUserId) return;
    const request = savedViewsRequestGuard.begin(key);
    void study.views(key, identity.userId).then((outcome) => {
      if (!identityGuard.isCurrent(identity) || !savedViewsRequestGuard.isCurrent(request, activeSystemKeyRef.current)) return;
      if (outcome.ok) setSavedViews(outcome.value);
      else setAnnounce(outcome.message);
    }).catch(() => {
      if (identityGuard.isCurrent(identity) && savedViewsRequestGuard.isCurrent(request, activeSystemKeyRef.current)) {
        setAnnounce('could not load saved views. please try again.');
      }
    });
  }, [activeUserId, study, savedViewsRequestGuard, identityGuard]);
  useEffect(() => {
    // Clear old-system rows before the next request. Cleanup retires pending reads on switch or unmount.
    savedViewsRequestGuard.invalidate();
    reviewQueueRequestGuard.invalidate();
    setSavedViews([]);
    if (!studyReady || !system) return;
    refreshReviewQueue();
    refreshSavedViews(system.key);
    return () => {
      savedViewsRequestGuard.invalidate();
      reviewQueueRequestGuard.invalidate();
    };
  }, [studyReady, activeUserId, system?.key, refreshReviewQueue, refreshSavedViews, savedViewsRequestGuard, reviewQueueRequestGuard]);

  /** Records one missed structure (Task 178 decision: at the moment of the first wrong pick or "show me"). */
  const recordMiss = useCallback((structureId: string) => {
    const identity = identityGuard.snapshot();
    if (!activeUserId || identity.userId !== activeUserId || !system) return;
    void study.recordMisses(system.key, queueFromQuizMisses([{ target: structureId, feedback: { kind: 'shown' } }]), identity.userId)
      .then((outcome) => {
        if (!identityGuard.isCurrent(identity)) return;
        if (!outcome.ok) setAnnounce(outcome.message);
        else if (outcome.value > 0) refreshReviewQueue();
      })
      .catch(() => {
        // A network failure should never break the quiz, but the learner must know the miss was not saved.
        if (identityGuard.isCurrent(identity)) setAnnounce('could not save that missed structure. please try again.');
      });
  }, [activeUserId, system, study, refreshReviewQueue, identityGuard]);

  // ── Speech: a selection change or unmount stops a name still being said ──────────────────────────────────────────
  useEffect(() => {
    if (!speechOn) return;
    return () => stopSpeaking();
  }, [selected, speechOn]);

  // ── Compare view (Task 178): a second scene with another system, following this camera; disposed on close ─────────
  const compareSystem = useMemo(
    () => (system?.key !== WHOLE_BODY_KEY && compareKey && compareKey !== system?.key && compareKey !== WHOLE_BODY_KEY
      ? systems.find((s) => s.key === compareKey) ?? null : null),
    [compareKey, system?.key, systems],
  );
  useEffect(() => {
    if (phase !== 'open' || !compareSystem) {
      setCompareState('idle');
      return;
    }
    const canvas = compareCanvasRef.current;
    const colors = colorsRef.current;
    if (!canvas || !colors) return;
    let live = true;
    let scene: LabScene | null = null;
    setCompareState('loading');
    import('./anatomyscene')
      .then(({ createLabScene }) => {
        if (!live) return;
        scene = createLabScene({ canvas, reducedMotion: prefersReducedMotion(), colors, posture: postureRef.current, onRender: () => {} });
        compareSceneRef.current = scene;
        compareSyncRef.current = createCompareSync(() => {
          const main = sceneRef.current;
          const other = compareSceneRef.current;
          if (main && other && other === scene) {
            // Posture rotates the model root, not the camera. Keep both aligned.
            other.setPosture(postureRef.current);
            other.applyCameraState(main.cameraState());
          }
        });
        return scene
          .load(compareSystem.model.files ?? compareSystem.model.file, compareSystem.structures.map((s) => s.id))
          .then((result) => {
            if (!live || !result || !scene) return;
            const main = sceneRef.current;
            if (main) {
              scene.setPosture(postureRef.current);
              scene.applyCameraState(main.cameraState());
            }
            setCompareState('ready');
            setAnnounce(`comparing with ${compareSystem.title}: ${result.found.length} structures loaded.`);
          });
      })
      .catch(() => {
        if (live) setCompareState('error');
      });
    return () => {
      live = false;
      compareSyncRef.current?.cancel();
      compareSyncRef.current = null;
      compareSceneRef.current = null;
      scene?.dispose();
      scene = null;
    };
  }, [phase, compareSystem]);

  // Mobile GPUs can lose their WebGL context after the viewer opens.
  // Retire asynchronous work and preserve the accessible text catalog.
  useEffect(() => {
    if (phase !== 'open') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onContextLost = (event: Event) => {
      event.preventDefault();
      activePointers.current.clear();
      pointerRef.current = null;
      generation.bump(); // Cancel stale GLB results and in-flight PNG downloads.
      visibilityIntent.bump();
      loaderRef.current?.retire();
      loaderRef.current = null;
      const lostScene = sceneRef.current;
      sceneRef.current = null;
      const lostCompare = compareSceneRef.current;
      compareSceneRef.current = null;
      try {
        lostScene?.dispose();
        lostCompare?.dispose();
      } catch {
        // A lost GPU resource can throw during disposal; text access must survive.
      }
      setCompareKey('');
      setLoad({ state: 'loading' });
      setSelected(null);
      setQuiz(null);
      setRecall(null);
      setRound(null);
      setStudyLocation(null);
      studyGroupRef.current = null;
      setAlone(false);
      setPending(new Set());
      setLayerError(null);
      setFilesLoaded(0);
      setExporting(null);
      setExportNote('');
      setLabelNote([]);
      setBulkPrompt(null);
      setPosture('standing');
      postureRef.current = 'standing';
      setPhase('error');
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    return () => canvas.removeEventListener('webglcontextlost', onContextLost);
  }, [phase, generation, visibilityIntent]);

  useEffect(() => {
    // Invalidate pending lazy imports and releases on actual unmount.
    // React's development-only effect replay may mount the same island twice.
    openGate.mount();
    return () => {
      openGate.unmount();
      loaderRef.current?.retire();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      compareSceneRef.current?.dispose();
      compareSceneRef.current = null;
      if (speechOn) stopSpeaking();
    };
  }, [openGate, speechOn]);

  // The cover island already took the tap: open on mount (after the gate's mount effect above).
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (autoOpen) void openRef.current();
  }, [autoOpen]);

  useEffect(() => {
    if (phase === 'open') canvasRef.current?.focus();
    if (phase === 'error') fallbackHeadingRef.current?.focus();
  }, [phase]);

  // The skin system is drawn as a glowing outline while anything else is showing (src/islands/anatomyscene.ts).
  const skinIds = useMemo(
    () => new Set((system?.structures ?? []).filter((structure) => structure.layer === 'skin').map((structure) => structure.id)),
    [system],
  );
  const modelReady = load.state === 'ready';
  useEffect(() => {
    if (modelReady) sceneRef.current?.setOutlined(skinIds);
  }, [modelReady, skinIds]);

  // The orientation panel's three pictures are the loaded model itself, seen from each preset (no image files).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!modelReady || !scene) return;
    const next: Partial<Record<'front' | 'back' | 'left', string>> = {};
    for (const o of ORIENTATIONS) {
      const url = scene.thumbnail(o.id, 136, 216);
      if (url) next[o.id] = url;
    }
    setThumbs(next);
  }, [modelReady, systemKey]);

  const spinReady = load.state === 'ready';
  // A real body system starts out turning; the test shapes (?fixture), the whole body and reduced motion start still.
  const spinSystemKey = system?.key;
  const spinFixture = system?.fixture === true;
  useEffect(() => {
    if (!spinReady) return;
    // The whole body is the heaviest model by far: drawing it again every frame would drain a phone, so it starts still.
    const on = !spinFixture && !prefersReducedMotion() && spinSystemKey !== WHOLE_BODY_KEY;
    setSpinning(on);
    sceneRef.current?.setSpin(on);
    if (on) setOrientation('free');
  }, [spinReady, spinSystemKey, spinFixture]);
  // Conventional colours (red arteries, blue veins, yellow nerves, brown muscles): read from each structure's own
  // words, coloured from the tokens, and sent to the scene whenever the model, its loaded files or the stage change.
  const tintStructures = system?.structures;
  const tintSystemKey = system?.key;
  useEffect(() => {
    const scene = sceneRef.current;
    const lab = labRef.current;
    if (!scene || !lab || !spinReady || !tintStructures || !tintSystemKey) return;
    const style = getComputedStyle(lab);
    const tints = new Map<string, string>();
    for (const structure of tintStructures) {
      // The whole body mixes systems: there a structure's layer stands in for its system.
      const key = tintSystemKey === WHOLE_BODY_KEY ? (structure.layer ?? '') : tintSystemKey;
      const tint = conventionalTint(key, structure.text, structure.group);
      const colour = tint ? style.getPropertyValue(TINT_TOKEN[tint]).trim() : '';
      if (colour) tints.set(structure.id, colour);
    }
    scene.setTints(tints);
  }, [spinReady, tintStructures, tintSystemKey, found.length, stage]);
  // Studying a structure needs a still model: selecting one, a quiz, a round or name it stops the turning.
  const studying = Boolean(selected || quiz || round || recall);
  useEffect(() => {
    if (!studying) return;
    setSpinning(false);
    sceneRef.current?.setSpin(false);
  }, [studying]);
  // The stage colour changes the model's colours (dark parts on white), so the scene reads its tokens again.
  useEffect(() => {
    const read = readColorsRef.current;
    if (!read) return;
    colorsRef.current = read();
    sceneRef.current?.setColors(colorsRef.current);
    compareSceneRef.current?.setColors(colorsRef.current);
  }, [stage]);

  // ── Theme and accessible text sizing ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'open') return;
    const refresh = () => {
      const read = readColorsRef.current;
      if (!read) return;
      // Label widths and heights are measured using a temporary text-sm element.
      // Theme tokens, larger device text, browser zoom or a newly loaded font
      // can change those metrics without changing the canvas itself.
      measureRef.current = null;
      colorsRef.current = read();
      sceneRef.current?.setColors(colorsRef.current);
      compareSceneRef.current?.setColors(colorsRef.current);
    };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', refresh);
    window.addEventListener('resize', refresh);
    document.fonts?.addEventListener?.('loadingdone', refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => {
      mq.removeEventListener('change', refresh);
      window.removeEventListener('resize', refresh);
      document.fonts?.removeEventListener?.('loadingdone', refresh);
      observer.disconnect();
    };
  }, [phase]);

  // ── Picking ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const pickStructure = useCallback(
    (id: string | null) => {
      // "name it" asks about the highlighted structure: a tap must not move the highlight (or announce a name).
      if (recall || round) return;
      if (focusMode && !quiz) {
        if (!id) return;
        const next = toggleFocus(picks, id);
        setPicks(next.ids);
        setFocusFull(next.full);
        setSelected(id);
        setAnnounce(`${names.get(id) ?? id} ${next.ids.includes(id) ? 'chosen' : 'not chosen'}. ${next.ids.length} chosen.`);
        return;
      }
      if (quiz && quiz.target) {
        if (!id) return;
        // Once the answer is shown or found, further clicks must not move the highlight off the target.
        if (quiz.feedback?.kind === 'shown' || quiz.feedback?.kind === 'right') return;
        const next = answerQuiz(quiz, id);
        setQuiz(next);
        setSelected(id);
        const missed = missToRecord(quiz, next);
        if (missed) recordMiss(missed);
        return;
      }
      setSelected((current) => (id === null ? null : current === id ? current : id));
      if (id) setAnnounce(`selected ${names.get(id) ?? id}`);
    },
    [quiz, recall, round, names, recordMiss, focusMode, picks],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointers.current.add(e.pointerId);
    pointerRef.current =
      activePointers.current.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false } : null;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = pointerRef.current;
    if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) {
      if (!p.moved) setOrientation('free');
      p.moved = true;
    }
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    const p = pointerRef.current;
    pointerRef.current = null;
    // OrbitControls may handle secondary mouse gestures, but only a primary
    // mouse click, touch contact or pen-tip release can select a structure.
    if (!p || p.id !== e.pointerId || p.moved || e.button !== 0) return;
    // In quizzes, choose the nearest hit rather than favoring a previous selection.
    if (recall || round) return;
    const id = sceneRef.current?.pick(e.clientX, e.clientY, quiz === null) ?? null;
    if (id && tapAction(mode, quiz !== null && quiz.target !== null) === 'hide') {
      // Hide mode: the tap hides the structure and selects nothing. Undo brings it back.
      changeVisibility((v) => hideStructure(v, id));
      setAnnounce(`hid ${names.get(id) ?? id}. undo brings it back.`);
      return;
    }
    pickStructure(id);
  };
  const onPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    pointerRef.current = null;
  };

  /** Carries out a modifier shortcut from a key or the wheel. */
  const runShortcut = (action: ShortcutAction) => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (action.kind === 'zoom') {
      stopSpin();
      scene.zoom(action.direction === 'in' ? ZOOM_IN : 1 / ZOOM_IN);
    } else if (action.kind === 'pan') {
      stopSpin();
      scene.pan(action.direction === 'left' ? -PAN_SHARE : PAN_SHARE);
    } else {
      turn(action.yaw, action.pitch);
    }
  };
  const runShortcutRef = useRef(runShortcut);
  runShortcutRef.current = runShortcut;
  // The wheel with a modifier held, over the 3D view. Heard before the view's own wheel zoom, and stopped there, so a
  // step is never both a shortcut and a zoom; the plain wheel is left alone.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || phase !== 'open') return;
    const onWheel = (event: WheelEvent) => {
      if (loadStateRef.current !== 'ready') return;
      // With Shift held some browsers report the wheel sideways.
      const action = shortcutWheelAction(event.deltaY || event.deltaX, heldModifiers(event), STEP);
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      runShortcutRef.current(action);
    };
    canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => canvas.removeEventListener('wheel', onWheel, { capture: true });
  }, [phase]);

  const onCanvasKey = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    // The old scene can exist while the newly selected GLB is still loading.
    // Keyboard camera controls must follow the same readiness gate as buttons.
    if (!scene || load.state !== 'ready') return;
    // A modifier held: the shortcuts (anatomyshortcuts.ts). Anything else with a modifier is the browser's own.
    const shortcut = shortcutKeyAction(e.key, heldModifiers(e), STEP);
    if (shortcut) {
      runShortcut(shortcut);
      e.preventDefault();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || (e.shiftKey && !shiftTypesZoomKey(e.key, heldModifiers(e)))) return;
    const action = canvasKeyAction(e.key, STEP, ZOOM_IN);
    if (!action) return;
    if (action.kind === 'orbit') turn(action.yaw, action.pitch);
    else if (action.kind === 'zoom') scene.zoom(action.factor);
    else if (action.kind === 'reset') resetToHome();
    else showView(action.preset);
    e.preventDefault();
  };

  const stopSpin = () => {
    setSpinning(false);
    sceneRef.current?.setSpin(false);
  };
  const toggleSpin = () => {
    const on = !spinning;
    setSpinning(on);
    sceneRef.current?.setSpin(on);
    if (on) setOrientation('free');
    setAnnounce(on ? 'the model is turning. press pause to stop it.' : 'the model stopped turning.');
  };
  const pickStage = (next: 'black' | 'white') => {
    // Kept for this visit only: saving it on the device would need a line on the privacy page first.
    setStage(next);
    setAnnounce(`${next} background.`);
  };
  const showView = (requested: ViewPreset) => {
    stopSpin();
    // Pressing "lateral" again turns to the opposite side.
    const preset = requested === 'left' && orientation === 'left' ? 'right' : requested;
    sceneRef.current?.viewFrom(presetDirection(preset));
    setOrientation(preset);
    setAnnounce(`${NAV_VIEW_PRESETS.find((p) => p.id === preset)?.label ?? preset} view`);
  };
  /** Turning the model by a button or a key leaves the preset views: "free rotate" is what is showing. */
  const turn = (yaw: number, pitch: number) => {
    stopSpin();
    sceneRef.current?.orbit(yaw, pitch);
    setOrientation('free');
  };
  const resetToHome = () => {
    stopSpin();
    sceneRef.current?.resetView();
    setOrientation(posture === 'lying' ? null : 'front');
  };
  const changeSpread = (fraction: number) => {
    if (fraction > 0) stopSpin();
    setSpread(fraction);
    sceneRef.current?.setSpread(fraction);
  };
  /** Opens a body system: everything that belongs to the old one is dropped in this one update. */
  const pickSystem = (key: string) => {
    if (key === system.key) return;
    nextListFocusId.current = null;
    setListLimit(STRUCTURE_PAGE_SIZE);
    // A search for one system must not make the next system appear to have no structures.
    setQuery('');
    // Invalidate the old picture and any pending layer-visibility intent now,
    // before React's passive load-effect cleanup can run.
    generation.bump();
    visibilityIntent.bump();
    loaderRef.current?.retire();
    loaderRef.current = null;
    // Invalidate an in-flight initial GLB and clear the old 3D geometry
    // immediately. A late result cannot repopulate the previous scene.
    sceneRef.current?.clear();
    // Clear the previous body's transient feedback in this click update.
    // The passive loading effect runs later and must not show stale progress,
    // retry controls, export feedback or label notes under the new title.
    setLoad({ state: 'loading' });
    setSelected(null);
    setCompareKey('');
    setQuiz(null);
    setRecall(null);
    // A study round belongs to the old system's group: its ids would hide everything in the new one.
    setRound(null);
    setStudyLocation(null);
    studyGroupRef.current = null;
    setAlone(false);
    setPending(new Set());
    setLayerError(null);
    setFilesLoaded(0);
    setExporting(null);
    setExportNote('');
    setLabelNote([]);
    setAnnounce('');
    setSpread(0);
    setOrientation('front');
    setThumbs({});
    activeSystemKeyRef.current = key;
    savedViewsRequestGuard.invalidate();
    reviewQueueRequestGuard.invalidate();
    setSavedViews([]);
    setSystemKey(key);
  };

  // While a round runs, the round is the single source of truth for what is selected and what is showing: the asked
  // structure is selected and visible, and only its group (plus "show nearby") is showing. Anything else that changes
  // the selection or the visibility (clear selection, a layer toggle, peeling, isolate or hide) is put straight back.
  const studyTargetNow = round ? currentTarget(round) : null;
  const studyNearbyNow = round?.nearby ?? false;
  const studySeqNow = round?.seq ?? 0;
  const studyActive = round !== null;
  const studyFrameKeyRef = useRef('');
  useEffect(() => {
    const group = studyGroupRef.current;
    const scene = sceneRef.current;
    if (!studyActive || !group || !system) {
      studyFrameKeyRef.current = '';
      return;
    }
    if (studyTargetNow && selected !== studyTargetNow) setSelected(studyTargetNow);
    const keep = new Set(group.ids);
    const base = new Set(system.structures.map((structure) => structure.id).filter((id) => !keep.has(id)));
    let wanted = base;
    if (studyNearbyNow && studyTargetNow && scene) {
      const boxes = boxesFromMeshes([...scene.boundsById()].map(([id, box]) => ({ id, box })));
      const near = nearbyStructures(boxes, studyTargetNow, NEARBY_LIMIT).map((n) => n.id);
      wanted = expandNearby(base, near);
    }
    if (studyTargetNow && wanted.has(studyTargetNow)) {
      wanted = new Set(wanted);
      wanted.delete(studyTargetNow);
    }
    const same = wanted.size === hidden.size && [...wanted].every((id) => hidden.has(id));
    if (!same) {
      visibilityIntent.bump();
      setHidden(wanted);
    }
    // Frame what is left showing, once per question (not each time something drifts and is put back).
    const frameKey = `${studySeqNow}|${studyTargetNow}|${studyNearbyNow}`;
    if (scene && studyFrameKeyRef.current !== frameKey) {
      studyFrameKeyRef.current = frameKey;
      window.requestAnimationFrame(() => sceneRef.current?.viewPreset(orientationRef.current === 'back' || orientationRef.current === 'left' ? orientationRef.current : 'front'));
    }
  }, [studyActive, studyTargetNow, studyNearbyNow, studySeqNow, system, hidden, selected, visibilityIntent]);

  // The ring and leader follow the selection while it can be seen and no test is hiding its name.
  const markedId = modelReady && selected !== null && foundSet.has(selected) && !hidden.has(selected) && !quiz && !recall ? selected : null;
  useEffect(() => {
    markedIdRef.current = markedId;
    updateSelectionMarkRef.current();
  }, [markedId, panels, moreOpen, compareSystem, spread]);

  // ── Quiz ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const quizPool = useMemo(() => tappableIds(visible, skinIds), [visible, skinIds]);
  const toggleQuiz = () => {
    stopStudy();
    if (quiz) {
      setQuiz(null);
      setRecall(null);
      setAlone(false);
      setSelected(null);
      return;
    }
    stopRecall();
    setSelected(null);
    setQuiz(startQuiz(quizPool, Math.random));
  };

  // ── "name it" (recall) ────────────────────────────────────────────────────────────────────────────────────────────
  const stopRecall = () => {
    if (!recall) return;
    if (alone) {
      visibilityIntent.bump();
      setHidden(aloneSavedRef.current);
    }
    setAlone(false);
    setRecall(null);
    setTyped('');
    setSelected(null);
  };
  const toggleRecall = () => {
    stopStudy();
    if (recall) {
      stopRecall();
      return;
    }
    setQuiz(null);
    setLabelsOn(false);
    setTyped('');
    setRecall(startRecall(visible, recallCatalog, Math.random));
  };
  const toggleAlone = () => {
    if (!recall?.target) return;
    visibilityIntent.bump();
    if (alone) setHidden(aloneSavedRef.current);
    else aloneSavedRef.current = hidden;
    setAlone(!alone);
  };

  // ── Worksheet ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const makeWorksheet = async () => {
    const scene = sceneRef.current;
    if (!scene || !system || worksheetBusy) return;
    const blocked = worksheetBlockReason(visible.length);
    if (blocked) {
      setWorksheetNote(blocked);
      return;
    }
    const mine = worksheetExportGeneration.token();
    const systemToken = generation.token();
    const forSystem = system;
    setWorksheetBusy(true);
    setWorksheetNote('');
    try {
      const order = worksheetOrder(visible, scene.locate(visible));
      const { blob, leftOut } = await scene.exportPicture({
        size: 'square',
        transparent: false,
        title: forSystem.title,
        credit: pictureCreditFor(forSystem),
        labels: worksheetLabels(order),
      });
      if (!worksheetExportGeneration.isCurrent(mine) || !generation.isCurrent(systemToken)) return;
      const src = await blobToDataUrl(blob);
      if (!worksheetExportGeneration.isCurrent(mine) || !generation.isCurrent(systemToken)) return;
      setAnswersShown(false);
      setWorksheet({
        systemKey: forSystem.key,
        title: forSystem.title,
        src,
        fileName: worksheetFileName(forSystem.key),
        rows: worksheetRows(order, leftOut, names),
        note: worksheetLeftOutNote(order, leftOut),
      });
    } catch {
      if (worksheetExportGeneration.isCurrent(mine) && generation.isCurrent(systemToken)) setWorksheetNote('could not make the worksheet. please try again.');
    } finally {
      if (worksheetExportGeneration.isCurrent(mine) && generation.isCurrent(systemToken)) setWorksheetBusy(false);
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const exportPicture = async (size: ExportSize) => {
    const scene = sceneRef.current;
    if (!scene || !system) return;
    const mine = pictureExportGeneration.token();
    const systemToken = generation.token();
    setExporting(size);
    setExportNote('');
    try {
      // The labels on screen, or else the selected structure's name.
      const ids = labelIds.length ? labelIds : selected && !hidden.has(selected) ? [selected] : [];
      const { blob, leftOut, behind } = await scene.exportPicture({
        size,
        transparent,
        title: system.title,
        credit: pictureCreditFor(system),
        labels: ids.map((id) => ({ id, text: labelTextFor(id, names, recallOn && labelsOn ? numbers : null) })),
      });
      if (!pictureExportGeneration.isCurrent(mine) || !generation.isCurrent(systemToken)) return;
      const fileName = exportFileName(system.key, selected && !hidden.has(selected) ? (names.get(selected) ?? null) : null, size);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExportNote([`saved ${fileName}.`, ...labelNotes(names, leftOut, behind.length > 0)].join(' '));
    } catch (err) {
      if (!pictureExportGeneration.isCurrent(mine) || !generation.isCurrent(systemToken)) return;
      setExportNote(anatomyFailureMessage('picture', err));
    } finally {
      if (pictureExportGeneration.isCurrent(mine) && generation.isCurrent(systemToken)) setExporting(null);
    }
  };

  if (!system) return <p className="text-ink-soft">no body systems yet.</p>;

  if (phase === 'cover') return <AnatomyLabCover onOpen={() => void open()} note={coverDownloadNote(system.fixture ? null : system.title, system.fixture ? undefined : modelBytes[system.key])} />;

  if (phase === 'error') {
    const rows = textFallbackItems(groups, textLimit);
    return (
      <div className="space-y-6">
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <div role="alert">
            <h2 ref={fallbackHeadingRef} tabIndex={-1} className="text-lg text-ink">
              the 3D anatomy lab could not open.
            </h2>
          </div>
          <p className="text-sm text-ink-soft">you can still search the original structure names below.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={plainButton} onClick={() => void open()}>try 3D again</button>
            <a href="/learn" className="inline-flex min-h-11 items-center text-sm underline">browse the lessons</a>
          </div>
        </div>

        {systems.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm text-ink-soft">body system</legend>
            <div className="flex flex-wrap gap-2">
              {systems.map((choice) => (
                <button key={choice.key} type="button" className={plainButton}
                  aria-pressed={choice.key === system.key}
                  onClick={() => { activeSystemKeyRef.current = choice.key; savedViewsRequestGuard.invalidate(); setSavedViews([]); setSystemKey(choice.key); setQuery(''); setTextLimit(TEXT_FALLBACK_BATCH); }}>
                  {choice.title}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <section aria-labelledby="anatomy-text-fallback-heading" className="space-y-3">
          <h2 id="anatomy-text-fallback-heading" className="text-lg text-ink">structure names: {system.title}</h2>
          {drafts && system.status === 'draft' && (
            <p className="rounded-md border border-line px-3 py-2 text-sm text-ink">
              draft · labels waiting for review
            </p>
          )}
          <p className="text-sm text-ink-soft">{nameSourceFor(system)}</p>
          <div className="space-y-1 text-sm text-ink-soft" data-testid="anatomy-fallback-attribution">
            <p>
              {system.fixture ? (
                creditFor(system)
              ) : (
                <>
                  {BODYPARTS3D_CREDIT_LEAD}{' '}
                  <a className="underline" href={BODYPARTS3D_LICENSE_URL} rel="license noopener">
                    {BODYPARTS3D_LICENSE_NAME}
                  </a>
                </>
              )}
            </p>
            <p>{releaseNoteFor(system)}</p>
            {!system.fixture && (
              <p>{BODYPARTS3D_REFERENCE_NOTE}{' '}
                <a className="underline" href={BODYPARTS3D_REFERENCE_URL} rel="noopener noreferrer">source details</a>
              </p>
            )}
          </div>
          <label className="block text-sm text-ink" htmlFor="anatomy-fallback-search">find a structure by name or source ID</label>
          <input id="anatomy-fallback-search" type="search" value={query} autoComplete="off"
            onChange={(event) => { setQuery(event.target.value); setTextLimit(TEXT_FALLBACK_BATCH); }}
            className="min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink"
          />
          <p role="status" className="text-sm text-ink-soft">
            showing {rows.length} of {shownCount} matching structures
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-soft">no structure names or source IDs match this search.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((item) => (
                <li key={item.id} className="rounded-md border border-line px-3 py-2 text-sm text-ink">
                  {item.text}
                  {item.group && <span className="block text-ink-soft">{item.group}</span>}
                </li>
              ))}
            </ul>
          )}
          {rows.length < shownCount && (
            <button type="button" className={plainButton}
              onClick={() => setTextLimit((limit) => limit + TEXT_FALLBACK_BATCH)}>
              show {Math.min(TEXT_FALLBACK_BATCH, shownCount - rows.length)} more structures
            </button>
          )}
        </section>
      </div>
    );
  }

  const selectedName = selected ? (names.get(selected) ?? selected) : null;
  const selectedStructure = selected ? system.structures.find((s) => s.id === selected) : undefined;
  const selectedTree = structureTree(system, selectedStructure);
  const selectedGroup = selectedTree === 'partof' ? selectedStructure?.group : undefined;
  const budget = load.state === 'ready' ? anatomyTriangleNote(load.result.triangles, filesLoaded, lazy) : null;
  const ready = load.state === 'ready';
  // Only files whose meshes and IDs were committed to this exact ready state
  // can verify missing structures. Other pending layers leave known statuses.
  const fileIntegratedForStatus = (url: string) =>
    load.state === 'ready' && load.publishedFiles.has(url);
  const missingCount = !ready
    ? 0
    : lazy
      ? knownMissingStructureIds(
          system.structures,
          foundSet,
          (layerId) => filesForLayer(system, layerId),
          system.model.files ?? [system.model.file],
          fileIntegratedForStatus,
          system.model.fileIds,
        ).length
      : load.result.missing.length;
  const targetName = quiz?.target ? (names.get(quiz.target) ?? quiz.target) : null;

  const legend = recallOn && labelsOn && !quiz ? recallLegend(labelIds, numbers, names, recallRevealed) : [];
  const canFocus = ready && selected !== null && foundSet.has(selected) && !hidden.has(selected);

  // ── Study tools on the name card and around it (Task 178, integration) ───────────────────────────────────────────
  const selectedIndex = selected && selectedStructure
    ? groupIndex(system.structures, selected, selectedStructure.group, (structure) => structureTree(system, structure) === selectedTree)
    : null;
  const crumbs = selected
    ? breadcrumbRows(breadcrumb(system.structures, selected, selectedTree), system.structures, selected)
    : [];
  const siblingList = selected ? siblings(system.structures, selected) : [];
  const queued = queuedForSystem(reviewRows, system.key);
  const currentSavedViews = savedViews.filter((view) => view.system_key === system.key);
  const reviewPool = reviewQuizPool(queued, foundSet);
  // The whole body is never a comparison: it is several models at once, past the per-model budget twice over.
  const compareOptions = system.key === WHOLE_BODY_KEY ? [] : systems.filter((s) => s.key !== system.key && s.key !== WHOLE_BODY_KEY && !s.model.layerFiles);

  // ── Study round (learn it / test it / find it over the selected group) ───────────────────────────────────────────
  const groupIds = selectedIndex ? selectedIndex.items.map((item) => item.id).filter((id) => foundSet.has(id)) : [];
  const allBut = (keep: readonly string[]) => {
    const kept = new Set(keep);
    return new Set(system.structures.map((structure) => structure.id).filter((id) => !kept.has(id)));
  };
  const stopStudy = () => {
    if (!round) return;
    visibilityIntent.bump();
    setHidden(studySavedHiddenRef.current);
    setRound(null);
    setStudyLocation(null);
    studyGroupRef.current = null;
    setSelected(null);
  };
  const beginStudy = () => {
    const scene = sceneRef.current;
    if (!scene || !ready || !selectedIndex || groupIds.length === 0) return;
    setAnnounce('');
    if (studyChoice === 'find') {
      // The same "find it" as everywhere else, over this group: only structures a tap can reach are asked.
      const shown = [...new Set([...visible, ...groupIds])];
      const reachable = new Set(tappableIds(shown, skinIds));
      const pool = groupIds.filter((id) => reachable.has(id));
      if (pool.length === 0) {
        setAnnounce('these structures cannot be tapped while other structures are showing. hide the others to practise them.');
        return;
      }
      stopRecall();
      changeVisibility((v) => ({ hidden: expandNearby(v.hidden, pool), faded: v.faded }));
      setSelected(null);
      setQuiz(startQuiz(pool, Math.random));
      setAnnounce(`find it: ${pool.length} structures from this group.`);
      return;
    }
    stopRecall();
    setQuiz(null);
    setLabelsOn(false);
    // The location picture is taken now, with everything the student was looking at, before the group is set apart.
    const preset = orientation === 'back' || orientation === 'left' ? orientation : 'front';
    const url = scene.thumbnail(preset, 136, 216);
    setStudyLocation(url ? { url, marks: scene.thumbnailMarks(preset, 136, 216, groupIds), word: VIEW_WORDS[preset] } : null);
    studySavedHiddenRef.current = hidden;
    studyGroupRef.current = { name: selectedIndex.group, ids: groupIds };
    visibilityIntent.bump();
    setHidden(allBut(groupIds));
    // A made worksheet lists the names: it cannot stay open under a test.
    if (studyChoice === 'test') setWorksheet(null);
    studyStartRef.current = Date.now();
    setRound(startRound(studyChoice, groupIds));
  };
  const studyTarget = round ? currentTarget(round) : null;
  const officialOf = (id: string) => names.get(id) ?? id;
  const studyStep = (change: (current: StudyRound, id: string) => StudyRound) =>
    setRound((current) => {
      const id = current ? currentTarget(current) : null;
      return current && id ? change(current, id) : current;
    });
  const againStudy = () => {
    const group = studyGroupRef.current;
    if (!group || !round) return;
    studyStartRef.current = Date.now();
    setRound(startRound(round.mode, group.ids));
  };

  /** Reveals the structures nearest the selected one (by box centers), as one undoable change. */
  const showNearby = () => {
    const scene = sceneRef.current;
    if (!scene || !selected || !ready) return;
    const boxes = boxesFromMeshes([...scene.boundsById()].map(([id, box]) => ({ id, box })));
    const near = nearbyStructures(boxes, selected, NEARBY_LIMIT).map((n) => n.id);
    if (near.length === 0) {
      setAnnounce('no other structures are loaded to show nearby.');
      return;
    }
    changeVisibility((v) => ({ hidden: expandNearby(v.hidden, near), faded: v.faded }));
    setAnnounce(`showed ${near.length} nearby structures.`);
  };

  const sayIt = () => {
    if (!selectedName) return;
    if (!speak(selectedName, { lang: SPEECH_LANG })) setAnnounce('this browser could not say the name.');
  };

  const clearMiss = (structureId: string) => {
    const identity = identityGuard.snapshot();
    if (!activeUserId || identity.userId !== activeUserId) return;
    const key = system.key;
    void study.clearMiss(key, structureId, identity.userId).then((outcome) => {
      if (!identityGuard.isCurrent(identity)) return;
      if (!outcome.ok) {
        setAnnounce(outcome.message);
        return;
      }
      // Retire reads started before the server-side clear: they could otherwise restore the deleted row.
      reviewQueueRequestGuard.invalidate();
      setReviewRows((rows) => rows.filter((row) => !(row.system_key === key && row.structure_id === structureId)));
      refreshReviewQueue();
      setAnnounce(`${names.get(structureId) ?? structureId} left your review queue.`);
    }).catch(() => {
      if (identityGuard.isCurrent(identity)) setAnnounce('something went wrong — please try again.');
    });
  };

  /** A "find it" round over the review queue only: every queued structure is shown first, then asked about. */
  const startReviewQuiz = () => {
    if (reviewPool.length === 0 || !ready) return;
    stopStudy();
    // The queue is shown first, so the skin is an outline (and cannot be tapped) if anything else is showing then.
    const round = tappableRound(reviewPool, [...new Set([...visible, ...reviewPool])], skinIds);
    if (round.length === 0) {
      setAnnounce('the structures in your review queue cannot be tapped while other structures are showing. hide the others to practise them.');
      return;
    }
    stopRecall();
    changeVisibility((v) => ({ hidden: expandNearby(v.hidden, reviewPool), faded: v.faded }));
    setSelected(null);
    setQuiz(startQuiz(round, Math.random));
    setAnnounce(`find it: ${round.length} structures from your review queue.`);
  };

  const saveView = () => {
    const scene = sceneRef.current;
    if (!scene || !ready || savingViewBusy(savingViews, system.key)) return;
    if (spreadBlocksSaving(spread)) { setAnnounce(SPREAD_SAVE_NOTE); return; }
    const key = system.key;
    const identity = identityGuard.snapshot();
    if (!activeUserId || identity.userId !== activeUserId) return;
    const name = viewName.trim();
    setSavingViews((current) => savingViewStarted(current, key));
    const modelCamera = cameraToModelFrame(scene.cameraState(), posture);
    void study.saveView({ systemKey: key, name, camera: modelCamera, hidden, faded, selected }, identity.userId)
      .then((outcome) => {
        if (!identityGuard.isCurrent(identity) || activeSystemKeyRef.current !== key) return;
        if (!outcome.ok) {
          setAnnounce(outcome.message);
          return;
        }
        setViewName('');
        setAnnounce(`saved the view "${name}".`);
        refreshSavedViews(key);
      })
      .catch(() => {
        if (identityGuard.isCurrent(identity) && activeSystemKeyRef.current === key) setAnnounce('something went wrong — please try again.');
      })
      .finally(() => {
        if (identityGuard.isCurrent(identity)) setSavingViews((current) => savingViewSettled(current, key));
      });
  };

  const openView = (view: SavedViewRow, confirmed = false) => {
    const scene = sceneRef.current;
    const identity = identityGuard.snapshot();
    if (!scene || !ready || view.system_key !== system.key || !identityGuard.isCurrent(identity)
        || identity.userId !== activeUserId || !savedViews.some((saved) => saved.id === view.id)) return;
    const camera = savedCamera(view.camera);
    if (!camera) {
      setAnnounce('this view could not be read. delete it and save it again.');
      return;
    }
    // Keep saved visibility and selection for source-valid IDs even if their
    // lazy meshes have not downloaded. Geometry publication is separate.
    const eligibleIds = lazy ? new Set(system.structures.map((structure) => structure.id)) : foundSet;
    const restored = savedVisibility(view, eligibleIds);
    const selectedId = view.selected && eligibleIds.has(view.selected) ? view.selected : null;
    const loader = lazy ? loaderRef.current : null;
    // Exact manifest ownership avoids fetching unrelated organs in the same layer.
    const visibleIds = new Set(system.structures
      .filter((structure) => eligibleIds.has(structure.id) && !restored.hidden.has(structure.id))
      .map((structure) => structure.id));
    const missingFiles = loader && system.model.fileIds
      ? (system.model.files ?? []).filter((url) =>
          !loader.isLoaded(url) && (system.model.fileIds?.[url] ?? []).some((id) => visibleIds.has(id)))
      : [];
    // An absent file ownership manifest is not permission to guess which
    // whole-body files should be downloaded.
    if (loader && !system.model.fileIds) {
      setAnnounce('this saved view needs a verified model file list before its layers can load.');
      return;
    }
    const narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
    if (loader && !confirmed && needsSavedViewConsent(narrow, missingFiles)) {
      // A specific saved view's uncached files are the consent scope; cancel
      // keeps the old visibility, camera, selection and undo history intact.
      savedViewPromptTriggerRef.current = document.activeElement instanceof HTMLButtonElement
        ? document.activeElement : null;
      setBulkPrompt({ kind: 'saved-view', systemKey: system.key, files: missingFiles.length, view, identity });
      return;
    }
    stopStudy();
    stopRecall();
    setQuiz(null);
    changeVisibility(() => restored);
    setSelected(selectedId);
    // A saved view is always the assembled arrangement, so bring the structures back together first.
    changeSpread(0);
    scene.applyCameraState(cameraToWorldFrame(camera, posture));
    if (!loader || missingFiles.length === 0) {
      setAnnounce(`opened the view "${view.name}".`);
      return;
    }
    const intent = visibilityIntent.token();
    const systemToken = generation.token();
    setPending((current) => new Set([...current, 'saved view']));
    setLayerError(null);
    setAnnounce(`opening the view "${view.name}" and loading its model files.`);
    void loader.ensure(missingFiles).then(() => {
      if (loader.isRetired() || !generation.isCurrent(systemToken) || !visibilityIntent.isCurrent(intent)) return;
      setAnnounce(`opened the view "${view.name}".`);
    }).catch((error: unknown) => {
      if (loader.isRetired() || !generation.isCurrent(systemToken) || !visibilityIntent.isCurrent(intent)) return;
      setLayerError({ layer: 'saved view', message: anatomyFailureMessage('layer', error), retry: () => openView(view) });
      setAnnounce('some saved-view models could not load. try opening the saved view again.');
    }).finally(() => {
      if (!loader.isRetired() && generation.isCurrent(systemToken)) {
        setPending((current) => new Set([...current].filter((id) => id !== 'saved view')));
      }
    });
  };

  const deleteView = (view: SavedViewRow) => {
    const key = system.key;
    const identity = identityGuard.snapshot();
    if (!activeUserId || identity.userId !== activeUserId || view.system_key !== key) return;
    void study.deleteView(view.id, identity.userId).then((outcome) => {
      if (!identityGuard.isCurrent(identity) || activeSystemKeyRef.current !== key) return;
      if (!outcome.ok) {
        setAnnounce(outcome.message);
        return;
      }
      savedViewsRequestGuard.invalidate();
      setSavedViews((views) => views.filter((v) => !(v.id === view.id && v.system_key === key)));
      refreshSavedViews(key);
      setAnnounce(`deleted the view "${view.name}".`);
    }).catch(() => {
      if (identityGuard.isCurrent(identity) && activeSystemKeyRef.current === key) setAnnounce('something went wrong — please try again.');
    });
  };

  // The draft note and the model's credit: at the bottom of the body systems box and in the ? pop-up (Christian, 2026-11-27).
  const creditLines = (
    <>
          {drafts && system.status === 'draft' && <p className="text-ink">draft · labels waiting for review</p>}
            <p>
              {system.fixture ? (
                creditFor(system)
              ) : (
                <>
                  {BODYPARTS3D_CREDIT_LEAD}{' '}
                  <a className="underline" href={BODYPARTS3D_LICENSE_URL} rel="license noopener">{BODYPARTS3D_LICENSE_NAME}</a>
                </>
              )}
            </p>
            <p>{releaseNoteFor(system)}</p>
            {!system.fixture && (
              <p>{BODYPARTS3D_REFERENCE_NOTE}{' '}
                <a className="underline" href={BODYPARTS3D_REFERENCE_URL} rel="noopener noreferrer">source details</a>
              </p>
            )}
            {budget && <p className="text-ink" data-testid="anatomy-budget-note">{budget}</p>}
            {ready && missingCount > 0 && (
              <p data-testid="anatomy-missing-count">
                {missingCount} listed structures were not found in the loaded model files.
              </p>
            )}
    </>
  );

  // The open system's structures, listed under its row in the body systems panel (one combined tree).
  const structuresTree = (
                    <section id="lab-panel-structures" className="mt-1 mb-2 space-y-2 pl-3" aria-labelledby="anatomy-list-heading">
          <h3 id="anatomy-list-heading" className="sr-only">structures</h3>
          {namesHidden ? (
            <p className="text-sm text-ink-soft" data-testid="anatomy-list-paused">
              the list is put away while a name is hidden, so it doesn't give the answer away. stop {recall ? 'name it' : 'the round'} to see it again.
            </p>
          ) : (<>
          <p className="text-sm text-ink-soft" aria-live="polite">
            {listedCount < shownCount
              ? `showing ${listedCount} of ${shownCount} structures`
              : shownCount === 1 ? '1 structure' : `${shownCount} structures`}
          </p>
          {namedGroups.length > 1 && !searching && (
            <button
              type="button"
              className={`${secondaryButton} self-start`}
              disabled={!ready}
              onClick={() => setFoldedGroups(allFolded ? new Set() : new Set(namedGroups))}
              data-testid="anatomy-fold-all"
            >
              {allFolded ? 'open all groups' : 'close all groups'}
            </button>
          )}
          <div className="lab-sheet space-y-4 lg:max-h-none lg:overflow-visible">
            {listedGroups.map((group) => (
              <div key={group.group ?? '—'}>
                {group.group && (
                  <h4 className="lab-cap">
                    {searching ? group.group : (
                      <button
                        type="button"
                        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 bg-transparent p-0 text-left"
                        aria-expanded={!group.folded}
                        disabled={!ready}
                        onClick={() => toggleGroup(group.group as string)}
                      >
                        <span>{group.group}</span>
                        <span aria-hidden="true">{group.total} {group.folded ? '▸' : '▾'}</span>
                      </button>
                    )}
                  </h4>
                )}
                {focusMode && group.group && !group.folded && (() => {
                  const ids = (groups.find((g) => g.group === group.group)?.items ?? []).filter((i) => foundSet.has(i.id)).map((i) => i.id);
                  const all = ids.length > 0 && ids.every((id) => pickSet.has(id));
                  return (
                    <button
                      type="button"
                      className="lab-btn mt-1"
                      aria-pressed={all}
                      disabled={!ready || ids.length === 0}
                      data-testid="anatomy-focus-group"
                      onClick={() => {
                        const next = toggleFocusGroup(picks, ids);
                        setPicks(next.ids);
                        setFocusFull(next.full);
                        setAnnounce(`${group.group}: ${next.ids.length} chosen.`);
                      }}
                    >
                      {all ? 'unchoose the group' : `choose all ${ids.length} in this group`}
                    </button>
                  );
                })()}
                <ul className="mt-1 space-y-1" hidden={group.folded}>
                  {group.items.map((item) => {
                    const inModel = foundSet.has(item.id);
                    const isHidden = hidden.has(item.id);
                    const isFaded = !isHidden && faded.has(item.id);
                    const loadNote = structureLoadNote(
                      item, foundSet, lazy, (id) => filesForLayer(system, id),
                      system.model.files ?? [], fileIntegratedForStatus, system.model.fileIds,
                    );
                    return (
                      <li
                        key={item.id}
                        ref={nextListFocusId.current === item.id ? nextListItemRef : undefined}
                        tabIndex={nextListFocusId.current === item.id ? -1 : undefined}
                        className="flex items-stretch gap-1"
                      >
                        {inModel && (
                          <button
                            type="button"
                            aria-label={`${isHidden ? 'show' : 'hide'} ${item.text}`}
                            disabled={!ready || revealedTarget === item.id}
                            onClick={() => changeVisibility((v) => hideStructure(v, item.id))}
                            className="lab-dot-btn"
                          >
                            <span className="lab-dot" data-on={!isHidden} aria-hidden="true" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-pressed={focusMode ? pickSet.has(item.id) : selected === item.id}
                          disabled={!ready || !inModel}
                          onClick={() => pickStructure(item.id)}
                          className="lab-row min-w-0 flex-1"
                        >
                          {focusMode && <span className="lab-tick" data-on={pickSet.has(item.id)} aria-hidden="true">{pickSet.has(item.id) ? '✓' : ''}</span>}
                          {item.text}
                          {focusMode && pickSet.has(item.id) && <span className="lab-state" aria-hidden="true">chosen</span>}
                          {!focusMode && selected === item.id && <span className="lab-state" aria-hidden="true">selected</span>}
                          {isHidden && inModel && <span> (hidden)</span>}
                          {isFaded && inModel && <span> {FADED_MARK}</span>}
                          {ready && !inModel && loadNote && <span> ({loadNote})</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {listedCount < openCount && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  nextListFocusId.current = openGroups.flatMap((group) => group.items)[listedCount]?.id ?? null;
                  setListLimit((current) => current + STRUCTURE_PAGE_SIZE);
                }}
              >
                show {Math.min(STRUCTURE_PAGE_SIZE, openCount - listedCount)} more structures
              </button>
            )}
          </div>
          </>)}
                    </section>
  );

  return (
    <div className="lab-page fixed inset-0 z-50 m-0 overflow-x-hidden overflow-y-auto print:static print:overflow-visible" onKeyDown={onLabKey} data-stage={stage} data-testid="anatomy-page">
      <LabFullPage />
      <p className="sr-only" aria-live="polite" data-testid="anatomy-announce">{announce}</p>

      <div ref={labRef} className="anatomy-lab" data-testid="anatomy-lab">
        <div className="lab-topbar lab-bar flex-wrap">
          <div className="flex min-w-0 items-center gap-3">
            {onExit && (
              <button type="button" className="lab-btn lab-round shrink-0" onClick={onExit} data-testid="anatomy-exit">
                <span aria-hidden="true">←</span>
                <span className="sr-only">leave the anatomy lab</span>
              </button>
            )}
            <div className="min-w-0">
              <p className="lab-title">anatomy lab</p>
            </div>
          </div>
          {/* Christian's logo artwork (brand v1.0), the Evening file: the lab's bars are dark in Light and Evening. */}
          <img
            src="/brand/v1/logo-full-dark-480.png"
            alt="cueory"
            className="lab-logo pointer-events-none absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 xl:block"
            width={96}
            height={24}
            loading="lazy"
            decoding="async"
          />
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {!namesHidden && (
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <label htmlFor="anatomy-search" className="sr-only">find a structure by name or source ID</label>
                <input
                  id="anatomy-search"
                  type="search"
                  value={query}
                  placeholder={`search ${system.structures.length} structures`}
                  onChange={(e) => {
                    nextListFocusId.current = null;
                    setListLimit(STRUCTURE_PAGE_SIZE);
                    setQuery(e.target.value);
                  }}
                  className="lab-field"
                  autoComplete="off"
                />
              </div>
            )}
            {/* Put away while a round runs, so nothing can draw or print the name being asked. */}
            {!round && (
              <>
                <button
                  type="button"
                  className="lab-btn shrink-0"
                  aria-expanded={moreOpen}
                  aria-controls="lab-more"
                  onClick={() => setMoreOpen((open) => !open)}
                >
                  more
                </button>
              </>
            )}
            <button
              type="button"
              className="lab-btn hidden shrink-0 lg:inline-flex"
              aria-pressed={sidesHidden}
              onClick={() => setSidesHidden((hidden) => !hidden)}
              data-testid="anatomy-focus"
            >
              model only
            </button>
            <button
              ref={keysButtonRef}
              type="button"
              className="lab-btn lab-round shrink-0"
              aria-expanded={keysOpen}
              aria-controls="anatomy-keys"
              onClick={() => setKeysOpen((open) => !open)}
            >
              <span aria-hidden="true">?</span>
              <span className="sr-only">keys</span>
            </button>
          </div>
        </div>
          {keysOpen && (
            <div
              id="anatomy-keys"
              role="region"
              aria-label="keys for the 3D view"
              className="lab-glass lab-solid absolute top-20 right-3 left-3 z-30 max-h-(--lab-sheet-height) space-y-2 overflow-y-auto p-4 text-sm text-ink sm:left-auto sm:w-(--lab-keys-width)"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setKeysOpen(false);
                  keysButtonRef.current?.focus();
                }
              }}
            >
              <p className="text-ink-soft">select the 3D view first (tap it, or press Tab until it is outlined), then:</p>
              <dl className="space-y-1">
                {[...KEY_MAP, ...SHORTCUT_KEY_MAP].map((row) => (
                  <div key={row.keys} className="flex gap-3">
                    <dt className="w-40 shrink-0"><kbd className="rounded-sm border border-line bg-page px-1.5 font-body text-ink">{row.keys}</kbd></dt>
                    <dd className="min-w-0">{row.does}</dd>
                  </div>
                ))}
              </dl>
              <div className="lab-divider space-y-1 pt-2 text-sm text-ink-soft" data-testid="anatomy-credits-help">{creditLines}</div>
              <button type="button" className={secondaryButton} onClick={() => { setKeysOpen(false); keysButtonRef.current?.focus(); }}>
                close keys
              </button>
            </div>
          )}

        <div ref={stageRef} className="relative flex flex-col lg:block lg:min-h-(--lab-stage-min) lg:flex-1" data-testid="anatomy-stage">
          <div ref={ringRef} className="lab-selring" aria-hidden="true" data-testid="anatomy-selection-ring" />
          <svg className="lab-leader hidden lg:block" aria-hidden="true" data-testid="anatomy-leader"><line ref={leaderRef} /></svg>
          <div className="relative h-(--lab-stage-height-small) lg:absolute lg:inset-0 lg:h-auto">
            <div className="lab-decor lab-pool bottom-16 left-1/2 h-12 w-1/3 -translate-x-1/2" aria-hidden="true" />
            <div className="lab-decor lab-ring bottom-15 left-1/2 hidden h-14 w-1/3 -translate-x-1/2 md:block" aria-hidden="true" />
            <div className="lab-decor lab-ring lab-ring-soft bottom-12 left-1/2 hidden h-20 w-1/2 -translate-x-1/2 md:block" aria-hidden="true" />
            <div className="lab-decor lab-ring lab-ring-faint bottom-8 left-1/2 hidden h-28 w-2/3 -translate-x-1/2 md:block" aria-hidden="true" />
            <div className={`${compareSystem ? 'grid h-full grid-cols-2 pt-2 lg:pr-(--lab-inspector-clear) lg:pl-(--lab-rail-clear)' : 'h-full pt-2'} ${round ? 'pb-8 lg:pb-(--lab-study-clear)' : 'pb-32 lg:pb-28'}`} data-testid="anatomy-views-row">
              <div className="relative h-full">
                <canvas
                  ref={canvasRef}
                  tabIndex={0}
                  role="img"
                  aria-label={`3D model: ${system.title}`}
                  aria-describedby="anatomy-lab-help"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onKeyDown={onCanvasKey}
                  className="lab-canvas touch-none"
                />
                <LabelOverlay setterRef={setPlacedRef} onMount={updateLabels} />
                {(phase === 'opening' || load.state === 'loading') && (
                  <div className="absolute inset-0 flex items-center justify-center bg-page">
                    <span className="text-sm text-ink-soft">
                      loading {system.title}
                      {modelBytes[system.key] !== undefined && formatDownloadSize(modelBytes[system.key]!) ? ` (${formatDownloadSize(modelBytes[system.key]!)})` : ''}…
                    </span>
                  </div>
                )}
                {load.state === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-page p-4 text-center">
                    <p role="alert" className="text-sm text-ink">could not load {system.title}. check the connection and try again.</p>
                    <button type="button" className={secondaryButton} onClick={() => setInitialRetry((count) => count + 1)}>
                      try loading again
                    </button>
                  </div>
                )}
              </div>
          {compareSystem && (
            <figure className="relative m-0 h-full" data-testid="anatomy-compare">
              <canvas
                ref={compareCanvasRef}
                role="img"
                aria-label={`compare: 3D model of ${compareSystem.title}, turned the same way`}
                className="lab-canvas pointer-events-none"
              />
              {compareState === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-page">
                  <span className="text-sm text-ink-soft">loading {compareSystem.title}…</span>
                </div>
              )}
              {compareState === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-page p-4 text-center">
                  <p role="alert" className="text-sm text-ink">could not load {compareSystem.title} to compare.</p>
                </div>
              )}
              <figcaption className="lab-cap absolute top-3 left-3">comparing with {compareSystem.title}: turns with the main view.</figcaption>
            </figure>
          )}
            </div>

            <div className="absolute inset-x-3 bottom-20 z-10 mx-auto flex max-w-xl flex-col gap-2" data-testid="anatomy-status">
          {bulkPrompt?.systemKey === system.key && (
            <div
              role="group"
              aria-label={bulkPrompt.kind === 'all' ? 'confirm loading every body layer' : 'confirm opening saved view'}
              className="lab-glass space-y-3 p-4"
              data-testid={bulkPrompt.kind === 'all' ? 'anatomy-bulk-confirm' : 'anatomy-saved-view-confirm'}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  finishBulkPrompt(false);
                }
              }}
            >
              <p role="status" className="text-sm text-ink">
                {bulkPrompt.kind === 'all'
                  ? `showing every layer would download ${bulkPrompt.files} more 3D model files.`
                  : `opening the saved view "${bulkPrompt.view.name}" would download ${bulkPrompt.files} uncached 3D model files.`}
                {' '}on a phone, this can slow the view or make it stop responding. choose whether to continue.
              </p>
              <div className="flex flex-wrap gap-2">
                <button ref={confirmBulkButtonRef} type="button" className={primaryButton} onClick={() => finishBulkPrompt(true)}>
                  {bulkPrompt.kind === 'all' ? 'load every layer' : 'load this saved view'}
                </button>
                <button type="button" className={secondaryButton} onClick={() => finishBulkPrompt(false)}>
                  keep current view
                </button>
              </div>
            </div>
          )}
              {pending.size > 0 && (
                <p role="status" className="lab-glass px-4 py-2 text-sm text-ink" data-testid="anatomy-layer-loading">
                  loading {[...pending].join(', ')}…
                </p>
              )}
              {layerError && (
                <div role="alert" className="lab-glass space-y-2 px-4 py-3 text-sm text-ink">
                  <p>
                    Could not load {layerError.layer}. <span className="text-ink-soft">{layerError.message}</span>
                  </p>
                  <button type="button" className={secondaryButton} onClick={layerError.retry}>
                    try {layerError.layer} again
                  </button>
                </div>
              )}
          {labelsOn && !quiz && !recall && visible.length > labelIds.length && (
            <p className="lab-stage-note text-sm" data-testid="anatomy-label-limit">
              with this many structures showing, the largest are labeled. select any structure to label it.
            </p>
          )}
          {labelNote.length > 0 && (
            <div className="lab-stage-note space-y-1 text-sm" data-testid="anatomy-label-note">
              {labelNote.map((note) => <p key={note}>{note}</p>)}
            </div>
          )}
            </div>

            {!round && (
            <div className="lab-glass absolute inset-x-0 bottom-3 z-10 mx-auto flex w-fit max-w-full items-center px-5 py-2" role="group" aria-label="bottom bar">
              <div className="w-56 max-w-full sm:w-72">
                <label htmlFor="anatomy-spread" className="sr-only">spread structures apart · {Math.round(spread * 100)}%</label>
                <input
                  id="anatomy-spread"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(spread * 100)}
                  disabled={!ready}
                  aria-valuetext={`${Math.round(spread * 100)}%`}
                  className="lab-slider"
                  onChange={(e) => changeSpread(Number(e.target.value) / 100)}
                />
              </div>
            </div>
            )}
          </div>

          {round && (
            <div className="lab-glass lab-solid relative mx-3 mt-3 p-4 lg:absolute lg:inset-x-auto lg:right-(--lab-inspector-clear) lg:bottom-3 lg:left-(--lab-rail-clear) lg:z-10 lg:m-0" data-testid="anatomy-round-stage">
              <StudyCells
                round={round}
                boxRef={studyCellsRef}
                official={studyTarget ? officialOf(studyTarget) : null}
                touch={touchKeys}
                onLetter={(key) => studyStep((round, id) => typeLetter(round, key, officialOf(id)))}
                onBackspace={() => studyStep((round, id) => roundBackspace(round, officialOf(id)))}
                onHint={() => studyStep((round, id) => hintLetter(round, officialOf(id)))}
                onShow={() => studyStep((round) => showAnswer(round))}
                onSkip={() => studyStep((round) => skipQuestion(round))}
                onNext={() => studyStep((round) => nextQuestion(round))}
                onAgain={againStudy}
              />
            </div>
          )}

          <div className="lab-bar flex flex-wrap gap-2 p-3 lg:hidden" role="group" aria-label="panels">
            {([['orientation', 'controls'], ['systems', 'body systems']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={secondaryButton}
                aria-expanded={panels[key]}
                aria-controls={`lab-panel-${key}`}
                onClick={() => setPanels((current) => ({ ...current, [key]: !current[key] }))}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={`contents lg:pointer-events-none lg:absolute lg:top-5 lg:bottom-5 lg:left-5 lg:z-10 lg:w-(--lab-rail-width) lg:flex-col lg:gap-3 ${sidesHidden ? 'lg:hidden' : 'lg:flex'}`} data-testid="anatomy-rail">

            <section id="lab-panel-systems" className={`mx-3 mb-3 hidden space-y-3 data-open:block lg:pointer-events-auto lg:m-0 ${treeMin ? 'lab-min lg:block lg:w-fit' : 'lab-glass p-4 lg:flex lg:max-h-full lg:min-h-0 lg:flex-col'}`} data-open={panels.systems || undefined} aria-labelledby="lab-systems-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="lab-systems-heading" className={treeMin ? 'sr-only' : 'lab-cap'}>body systems</h2>
                <button
                  type="button"
                  className="lab-btn lab-round shrink-0"
                  aria-expanded={!treeMin}
                  onClick={() => setTreeMin((min) => !min)}
                  data-testid="anatomy-tree-min"
                >
                  {/* Hidden, the box is a bone in a circle (Christian, 2026-11-27): an icon for this box, not decoration. */}
                  {treeMin ? <BoneIcon /> : <span aria-hidden="true">−</span>}
                  <span className="sr-only">{treeMin ? 'show the body systems box' : 'hide the body systems box'}</span>
                </button>
              </div>
              {/* The box's body is what scrolls (a scroller that ignores the pointer cannot be wheeled or dragged). */}
              <div className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1" hidden={treeMin} data-testid="anatomy-tree-body">
              {systems.length > 1 && (
                <div role="group" aria-label="body system" className="space-y-1">
                  {systems.map((s) => (
                    <Fragment key={s.key}>
                    <button
                      type="button"
                      aria-pressed={s.key === system.key}
                      onClick={() => pickSystem(s.key)}
                      className="lab-row"
                    >
                      <span className="lab-dot" aria-hidden="true" />
                      <span>{s.title}</span>
                      <span className="lab-state" aria-hidden="true">{s.key === system.key ? '▾' : '▸'}</span>
                    </button>
                    {s.key === system.key && structuresTree}
                    </Fragment>
                  ))}
                </div>
              )}
              {systems.length <= 1 && structuresTree}
          {layers.length > 1 && (
            <fieldset className="lab-divider min-w-0 space-y-3 border-x-0 border-b-0 p-0 pt-3">
              <legend className="lab-cap float-left w-full">layers, skin to bone</legend>
              <p className="lab-cap clear-both" data-testid="anatomy-layer-count">{layers.filter((layer) => layerShown(layer, hidden)).length} of {layers.length} showing</p>
              <div className="space-y-1">
                {layers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    className="lab-row"
                    aria-pressed={layerShown(layer, hidden)}
                    disabled={!ready || pending.has(layer.id)}
                    onClick={() => {
                      if (pending.has(layer.id)) return;
                      visibilityIntent.bump();
                      if (lazy && layerNeedsReveal(
                        layer, hidden, filesForLayer(system, layer.id), (url) => loaderRef.current?.isLoaded(url) ?? false,
                      )) reveal(layer);
                      else setHidden((h) => toggleLayer(h, layer));
                    }}
                  >
                    <span className="lab-dot" aria-hidden="true" />
                    <span>{layer.id} ({layer.ids.length}){pending.has(layer.id) ? ', loading' : ''}</span>
                    <span className="lab-state" aria-hidden="true">{layerShown(layer, hidden) ? 'on' : 'off'}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={!ready || !toPeel || pending.size > 0}
                  onClick={() => {
                    if (!toPeel || pending.size > 0) return;
                    visibilityIntent.bump();
                    if (peelPlan) {
                      reveal(peelPlan.show, peelPlan.hide);
                      return;
                    }
                    setHidden((h) => toggleLayer(h, toPeel));
                    setAnnounce(`peeled away ${toPeel.id}`);
                  }}
                >
                  peel a layer{toPeel ? `: ${toPeel.id}` : ''}
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={!ready || !toRestore || pending.size > 0}
                  onClick={() => {
                    if (!toRestore || pending.size > 0) return;
                    visibilityIntent.bump();
                    if (lazy) reveal(toRestore);
                    else setHidden((h) => toggleLayer(h, toRestore));
                    setAnnounce(`put back ${toRestore.id}`);
                  }}
                >
                  put a layer back{toRestore ? `: ${toRestore.id}` : ''}
                </button>
              </div>
              {layerGapNote && (
                <p className="text-sm text-ink-soft" data-testid="anatomy-layer-gaps">
                  {layerGapNote}
                </p>
              )}
              {system.key === WHOLE_BODY_KEY && (
                <p className="text-sm text-ink-soft" data-testid="anatomy-files">
                  the whole body starts with the outer layer only; each deeper layer downloads when you open it.
                  model files loaded: {filesLoaded} of {system.model.files?.length ?? 0}.
                </p>
              )}
            </fieldset>
          )}
                <div className="lab-divider space-y-1 pt-3 text-sm text-ink-soft" data-testid="anatomy-credits">{creditLines}</div>
              </div>
            </section>
          </div>

          <section
            id="lab-panel-orientation"
            className={`mx-3 mb-3 hidden data-open:block lg:absolute lg:right-5 lg:bottom-5 lg:z-10 lg:m-0 lg:block ${remoteMin ? 'lab-min lg:w-fit' : 'lab-glass p-4 lg:w-(--lab-inspector-width)'}`}
            data-open={panels.orientation || undefined}
            aria-labelledby="lab-orientation-heading"
            data-testid="anatomy-remote"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="lab-orientation-heading" className={remoteMin ? 'sr-only' : 'lab-cap'}>controls</h2>
              <button
                type="button"
                className="lab-btn lab-round shrink-0"
                aria-expanded={!remoteMin}
                onClick={() => setRemoteMin((min) => !min)}
                data-testid="anatomy-remote-min"
              >
                {/* Hidden, the box is a remote control in a circle (Christian, 2026-11-27). */}
                {remoteMin ? <RemoteIcon /> : <span aria-hidden="true">−</span>}
                <span className="sr-only">{remoteMin ? 'show the controls' : 'hide the controls'}</span>
              </button>
            </div>
            <div role="group" aria-label="view" hidden={remoteMin}>
              <div className="mt-3 flex justify-between gap-2" role="group" aria-label="preset views">
                {ORIENTATIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="flex flex-col items-center bg-transparent p-0 disabled:opacity-60"
                    aria-label={`${o.label} view`}
                    aria-pressed={orientation === o.id}
                    aria-keyshortcuts={NAV_VIEW_PRESETS.find((p) => p.id === o.id)?.key}
                    disabled={!ready}
                    onClick={() => showView(o.id)}
                  >
                    <span className="lab-thumb" aria-hidden="true">
                      {thumbs[o.id] && <img src={thumbs[o.id]} alt="" width={136} height={216} />}
                    </span>
                    <span className="lab-thumb-label" data-on={orientation === o.id} aria-hidden="true">{o.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                {/* undo · up · redo / left · play · right / zoom out · down · zoom in (Christian, 2026-11-27) */}
                <div className="grid w-fit shrink-0 grid-cols-3 gap-1">
                  <button
                    type="button"
                    className={`${iconButton} aria-disabled:opacity-60`}
                    aria-label="undo"
                    aria-disabled={!ready || !canUndo(history)}
                    aria-keyshortcuts="Control+Z Meta+Z"
                    onClick={() => { if (ready && canUndo(history)) undoVisibility(); }}
                  >
                    ↶
                  </button>
                  <button type="button" className={iconButton} aria-label="tilt up" disabled={!ready} onClick={() => turn(0, -STEP)}>↑</button>
                  <button
                    type="button"
                    className={`${iconButton} aria-disabled:opacity-60`}
                    aria-label="redo"
                    aria-disabled={!ready || !canRedo(history)}
                    aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
                    onClick={() => { if (ready && canRedo(history)) redoVisibility(); }}
                  >
                    ↷
                  </button>
                  <button type="button" className={iconButton} aria-label="turn left" disabled={!ready} onClick={() => turn(-STEP, 0)}>←</button>
                  <button
                    type="button"
                    className={`${iconButton} w-11 px-0`}
                    aria-pressed={spinning}
                    disabled={!ready}
                    onClick={toggleSpin}
                    data-testid="anatomy-spin"
                  >
                    <span aria-hidden="true">{spinning ? '❙❙' : '▶\uFE0E'}</span>
                    <span className="sr-only">turn the model by itself</span>
                  </button>
                  <button type="button" className={iconButton} aria-label="turn right" disabled={!ready} onClick={() => turn(STEP, 0)}>→</button>
                  <button type="button" className={iconButton} aria-label="zoom out" disabled={!ready} onClick={() => sceneRef.current?.zoom(1 / ZOOM_IN)}>−</button>
                  <button type="button" className={iconButton} aria-label="tilt down" disabled={!ready} onClick={() => turn(0, STEP)}>↓</button>
                  <button type="button" className={iconButton} aria-label="zoom in" disabled={!ready} onClick={() => sceneRef.current?.zoom(ZOOM_IN)}>+</button>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="lab-seg" role="group" aria-label="background">
                    {(['black', 'white'] as const).map((choice) => (
                      <button key={choice} type="button" aria-pressed={stage === choice} onClick={() => pickStage(choice)}>
                        {choice}
                      </button>
                    ))}
                  </div>
                  {/* Put away while a round runs, so nothing can draw the name being asked. */}
                  {!round && (
                    <button
                      type="button"
                      className={secondaryButton}
                      aria-pressed={labelsOn}
                      disabled={!ready || quiz !== null || namesHidden}
                      onClick={() => setLabelsOn((on) => !on)}
                    >
                      labels
                    </button>
                  )}
                  <button ref={showAllButtonRef} type="button" className={secondaryButton} disabled={!ready} onClick={() => showAll()}>show all</button>
                </div>
              </div>
            </div>
          </section>
          <div className={`contents lg:pointer-events-none lg:absolute lg:top-5 lg:right-5 lg:z-10 lg:w-(--lab-inspector-width) lg:flex-col lg:gap-3 ${remoteMin ? 'lg:bottom-(--lab-remote-clear-min)' : 'lg:bottom-(--lab-remote-clear)'} ${sidesHidden ? 'lg:hidden' : 'lg:flex'}`} data-testid="anatomy-inspector">
            {/* The scroller is only as tall as its cards, so the empty space beside the model still turns the model. */}
            <div className="contents lg:pointer-events-auto lg:flex lg:max-h-full lg:min-h-0 lg:flex-col lg:gap-3 lg:overflow-y-auto" role="group" aria-label="selected structure and study" tabIndex={0}>
          {!quiz && !namesHidden && !round && (
            <AnatomyFocusPanel
              on={focusMode}
              onToggle={() => { setFocusMode((on) => !on); setFocusFull(false); }}
              count={picks.length}
              href={picks.length > 0 ? labelItHref(picks, knownIds) : null}
              onClear={() => { setPicks([]); setFocusFull(false); setAnnounce('cleared. none chosen.'); }}
              full={focusFull}
            />
          )}
          {selectedName && !quiz && !namesHidden && (
            <section className="lab-glass mx-3 mb-3 p-4 lg:pointer-events-auto lg:m-0" aria-labelledby="anatomy-name-card">
              {/* Name and system only (Christian, 2026-11-27); the source id stays for screen readers and the flag form. */}
              <span className="sr-only" data-testid="anatomy-card-id">{selected}</span>
              <h2 id="anatomy-name-card" className="lab-name">{selectedName}</h2>
              {selectedStructure && (
                <dl data-testid="anatomy-card-rows">
                  {inspectorRows(selectedStructure, system.title, system.model.release, selectedStructure.group).filter((row) => row.label === 'system').map((row) => (
                    <div key={row.label} className="lab-kv"><dt className="lab-cap">{row.label}</dt><dd className="m-0 text-right">{row.value}</dd></div>
                  ))}
                </dl>
              )}
              {/* Icon buttons: each is named for screen readers and shows its name on hover or keyboard
                  focus; on a touch screen, where nothing hovers, the name is always written beside the icon. */}
              <div className="mt-3 flex flex-wrap gap-2">
                {!round && (<>
                <button type="button" className="lab-btn lab-round lab-tip" aria-label="isolate" onClick={() => { visibilityIntent.bump(); setHidden(onlyThis(system.structures.map((s) => s.id), selected!)); }}>
                  <CardIcon name="isolate" /><span className="lab-tip-text" aria-hidden="true">isolate</span>
                </button>
                <button type="button" className="lab-btn lab-round lab-tip" aria-label={hidden.has(selected!) ? 'show' : 'hide'} onClick={() => changeVisibility((v) => hideStructure(v, selected!))}>
                  <CardIcon name={hidden.has(selected!) ? 'show' : 'hide'} /><span className="lab-tip-text" aria-hidden="true">{hidden.has(selected!) ? 'show' : 'hide'}</span>
                </button>
                </>)}
                <a
                  href={flagMailto(site.contactEmail, window.location.pathname)}
                  data-game-flag
                  className="lab-btn lab-round lab-tip"
                  aria-label="flag or comment"
                 
                >
                  <CardIcon name="flag" /><span className="lab-tip-text" aria-hidden="true">flag or comment</span>
                </a>
                {!round && (<>
                <button
                  type="button"
                  className="lab-btn lab-round lab-tip"
                  aria-label={structureState({ hidden, faded }, selected!) === 'faded' ? 'unfade' : 'fade this'}
                  aria-pressed={structureState({ hidden, faded }, selected!) === 'faded'}
                  onClick={() => {
                    changeVisibility((v) => fadeStructure(v, selected!));
                    setAnnounce(faded.has(selected!) && !hidden.has(selected!) ? `${selectedName} shown in full.` : `${selectedName} faded.`);
                  }}
                >
                  <CardIcon name="fade" /><span className="lab-tip-text" aria-hidden="true">{structureState({ hidden, faded }, selected!) === 'faded' ? 'unfade' : 'fade this'}</span>
                </button>
                <button type="button" className="lab-btn lab-round lab-tip" aria-label="show nearby" disabled={!ready || !foundSet.has(selected!)} onClick={showNearby}>
                  <CardIcon name="nearby" /><span className="lab-tip-text" aria-hidden="true">show nearby</span>
                </button>
                </>)}
                {speechOn && (
                  <button type="button" className="lab-btn lab-round lab-tip" aria-label="say it" onClick={sayIt}><CardIcon name="say" /><span className="lab-tip-text" aria-hidden="true">say it</span></button>
                )}
                {!round && <button type="button" className="lab-btn lab-round lab-tip" aria-label="clear selection" onClick={() => setSelected(null)}><CardIcon name="clear" /><span className="lab-tip-text" aria-hidden="true">clear selection</span></button>}
              </div>
            </section>
          )}
          {selectedName && !quiz && !namesHidden && !round && selectedIndex && (
            <div role="group" className="lab-glass mx-3 mb-3 p-4 lg:pointer-events-auto lg:m-0" aria-labelledby="anatomy-index-heading" data-testid="anatomy-index">
              <h2 id="anatomy-index-heading" className="lab-cap">{indexHeading(selectedIndex)}</h2>
              <ul className="lab-index mt-2 space-y-1">
                {selectedIndex.items.map((item, position) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      ref={(node) => { indexItemRefs.current[position] = node; }}
                      aria-pressed={selected === item.id}
                      disabled={!ready || !foundSet.has(item.id)}
                      onClick={() => pickStructure(item.id)}
                      onKeyDown={(e) => {
                        const next = indexStep(e.key, position, selectedIndex.items.length);
                        if (next === null) return;
                        e.preventDefault();
                        indexItemRefs.current[next]?.focus();
                      }}
                      className="lab-row w-full"
                    >
                      <span>{item.text}</span>
                      <span className="lab-id">{item.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {round ? (
            <StudyRoundSide
              round={round}
              names={names}
              groupName={studyGroupRef.current?.name ?? ''}
              startedAt={studyStartRef.current}
              onClose={stopStudy}
              onFirstLetters={(on) => { studyStep((round) => setFirstLetters(round, on)); studyCellsRef.current?.focus(); }}
              onNearby={(on) => { studyStep((round) => setNearby(round, on)); studyCellsRef.current?.focus(); }}
              thumb={studyLocation?.url}
              viewWord={studyLocation?.word ?? null}
              dot={studyTarget ? (studyLocation?.marks.get(studyTarget) ?? null) : null}
            />
          ) : (
            selectedName && !quiz && !namesHidden && selectedIndex && (
              <StudyEntryPanel
                choice={studyChoice}
                onChoice={setStudyChoice}
                count={groupIds.length}
                disabled={!ready || groupIds.length === 0}
                onBegin={beginStudy}
                groupName={selectedIndex.group}
              />
            )
          )}
            </div>
          </div>
        </div>

        <div id="lab-more" ref={moreRef} hidden={!moreOpen} className="lab-bar space-y-3 border-t border-line p-4" data-testid="anatomy-more">
          <div className="flex items-center justify-between gap-3">
            <h2 className="lab-cap">more</h2>
            <button type="button" className={secondaryButton} onClick={() => setMoreOpen(false)} data-testid="anatomy-more-close">close</button>
          </div>
          <details open className="rounded-lg border border-line" data-testid="anatomy-tools">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm text-ink-soft">tools</summary>
            <div className="space-y-3 px-4 pb-4">
              <div className="space-y-1">
                <p id="anatomy-mode-heading" className="text-sm text-ink-soft">what a tap does</p>
                <div role="group" aria-labelledby="anatomy-mode-heading" className="flex flex-wrap gap-2">
                  {LAB_MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={secondaryButton}
                      aria-pressed={mode === m}
                      disabled={!ready}
                      onClick={() => {
                        setMode(m);
                        setAnnounce(`${modeLabel(m)}.`);
                      }}
                    >
                      {modeLabel(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p id="anatomy-history-heading" className="text-sm text-ink-soft">changes to what is shown</p>
                <div role="group" aria-labelledby="anatomy-history-heading" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${secondaryButton} aria-disabled:opacity-60`}
                    aria-disabled={!ready || !canUndo(history)}
                    aria-keyshortcuts="Control+Z Meta+Z"
                    onClick={() => { if (ready && canUndo(history)) undoVisibility(); }}
                  >
                    undo
                  </button>
                  <button
                    type="button"
                    className={`${secondaryButton} aria-disabled:opacity-60`}
                    aria-disabled={!ready || !canRedo(history)}
                    aria-keyshortcuts="Shift+Control+Z Shift+Meta+Z"
                    onClick={() => { if (ready && canRedo(history)) redoVisibility(); }}
                  >
                    redo
                  </button>
                  <button
                    ref={restoreAllButtonRef}
                    type="button"
                    className={secondaryButton}
                    disabled={!ready}
                    onClick={() => {
                      // Ask for consent before changing either hidden or faded when a phone needs more GLBs.
                      if (lazy) showAll(true);
                      else {
                        changeVisibility(restoreAll);
                        setAnnounce('restored all structures. undo brings the last view back.');
                      }
                    }}
                  >
                    restore all
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <p id="anatomy-views-heading" className="text-sm text-ink-soft">views</p>
                <div role="group" aria-labelledby="anatomy-views-heading" className="flex flex-wrap gap-2">
                  {VIEW_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={secondaryButton}
                      disabled={!ready}
                      onClick={() => {
                        // A chosen view stays put: the model stops turning by itself, as with the remote's views.
                        stopSpin();
                        sceneRef.current?.viewPreset(preset);
                        setAnnounce(`view: ${VIEW_WORDS[preset]}.`);
                      }}
                    >
                      {VIEW_WORDS[preset]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={!canFocus}
                    onClick={() => {
                      if (!selected || !sceneRef.current?.focusOn(selected)) return;
                      setAnnounce(`focused on ${names.get(selected) ?? selected}.`);
                    }}
                  >
                    focus on selected
                  </button>
                  <button type="button" className={secondaryButton} disabled={!ready} onClick={resetToHome}>reset view</button>
                </div>
              </div>

              {compareOptions.length > 0 && (
                <div className="space-y-1">
                  <label htmlFor="anatomy-compare-pick" className="block text-sm text-ink-soft">compare with…</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      id="anatomy-compare-pick"
                      className="min-h-11 w-full max-w-full min-w-0 rounded-md border border-control bg-page px-3 text-sm text-ink sm:w-auto"
                      value={compareSystem ? compareSystem.key : ''}
                      disabled={!ready}
                      onChange={(e) => setCompareKey(e.target.value)}
                    >
                      <option value="">nothing</option>
                      {compareOptions.map((s) => (
                        <option key={s.key} value={s.key}>{s.title}</option>
                      ))}
                    </select>
                    {compareSystem && (
                      <button type="button" className={secondaryButton} onClick={() => { setCompareKey(''); setAnnounce('closed the comparison.'); }}>
                        close comparison
                      </button>
                    )}
                  </div>
                </div>
              )}

              {studyReady && (
                <details className="rounded-md border border-line" data-testid="anatomy-saved-views">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-ink-soft">
                    saved views ({currentSavedViews.length})
                  </summary>
                  <div className="space-y-3 px-3 pb-3">
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(e) => { e.preventDefault(); saveView(); }}
                    >
                      <label className="flex-1 text-sm text-ink-soft" htmlFor="anatomy-view-name">
                        name this view
                        <input
                          id="anatomy-view-name"
                          type="text"
                          value={viewName}
                          maxLength={60}
                          autoComplete="off"
                          onChange={(e) => setViewName(e.target.value)}
                          className="mt-1 block min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink"
                        />
                      </label>
                      <button type="submit" className={secondaryButton} disabled={!ready || savingViewBusy(savingViews, system.key) || viewName.trim().length === 0 || spreadBlocksSaving(spread)}
                        aria-describedby={spreadBlocksSaving(spread) ? 'anatomy-save-spread-note' : undefined}>
                        save this view
                      </button>
                      {spreadBlocksSaving(spread) && <p id="anatomy-save-spread-note" className="w-full text-sm text-ink-soft">{SPREAD_SAVE_NOTE}</p>}
                    </form>
                    {currentSavedViews.length === 0 ? (
                      <p className="text-sm text-ink-soft">no saved views for {system.title} yet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {currentSavedViews.map((view) => (
                          <li key={view.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                            <span className="min-w-0 flex-1 break-words">{view.name}</span>
                            <button type="button" className={secondaryButton} disabled={!ready} onClick={() => openView(view)} aria-label={`open the view ${view.name}`}>
                              open
                            </button>
                            <button type="button" className={secondaryButton} onClick={() => deleteView(view)} aria-label={`delete the view ${view.name}`}>
                              delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              )}

              <div className="space-y-1">
                <p id="anatomy-posture-heading" className="text-sm text-ink-soft">posture</p>
                <div role="group" aria-labelledby="anatomy-posture-heading" className="flex flex-wrap gap-2">
                  {(['standing', 'lying'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={secondaryButton}
                      aria-pressed={posture === p}
                      disabled={!ready}
                      onClick={() => {
                        setPosture(p);
                        sceneRef.current?.setPosture(p);
                        // Both models need matching root rotations before the camera is copied.
                        const comparison = compareSceneRef.current;
                        if (comparison) {
                          comparison.setPosture(p);
                          if (sceneRef.current) comparison.applyCameraState(sceneRef.current.cameraState());
                        }
                        setAnnounce(p === 'lying' ? 'the model lies down, seen from above.' : 'the model stands, in the anterior view.');
                      }}
                    >
                      {p === 'lying' ? 'lying down' : 'standing'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p id="anatomy-numbered-recall-heading" className="text-sm text-ink-soft">recall: blank the names, number the dots</p>
                <div role="group" aria-labelledby="anatomy-numbered-recall-heading" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    aria-pressed={recallOn}
                    disabled={!ready || quiz !== null}
                    onClick={() => {
                      const on = !recallOn;
                      setRecallOn(on);
                      setRecallRevealed(false);
                      if (on) setLabelsOn(true);
                      setAnnounce(on ? 'labels show numbers instead of names. the legend lists the numbers.' : 'labels show names again.');
                    }}
                  >
                    recall mode
                  </button>
                  {recallOn && (
                    <button
                      type="button"
                      className={secondaryButton}
                      aria-pressed={recallRevealed}
                      disabled={!ready || quiz !== null}
                      onClick={() => {
                        setRecallRevealed((r) => !r);
                        setAnnounce(recallRevealed ? 'names hidden in the legend.' : 'names shown in the legend.');
                      }}
                    >
                      {recallRevealed ? 'hide names' : 'reveal'}
                    </button>
                  )}
                </div>
                {legend.length > 0 && (
                  <ol className="mt-2 columns-2 text-sm text-ink" aria-label="legend" data-testid="anatomy-legend">
                    {legend.map((row) => (
                      <li key={row.id} className="min-h-6">
                        {row.number}{row.name ? `: ${row.name}` : ''}
                      </li>
                    ))}
                  </ol>
                )}
                {recallOn && labelsOn && !quiz && legend.length === 0 && (
                  <p className="text-sm text-ink-soft">no labels on screen to number yet.</p>
                )}
              </div>
            </div>
          </details>
          <section className="space-y-3 rounded-lg border border-line p-4" aria-labelledby="anatomy-quiz-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="anatomy-quiz-heading" className="text-lg text-ink">find it</h2>
              <button type="button" className={secondaryButton} aria-pressed={quiz !== null} disabled={!ready || (quiz === null && quizPool.length === 0)} onClick={toggleQuiz}>
                {quiz ? 'stop the quiz' : 'start the quiz'}
              </button>
            </div>
            {quiz && (
              <div className="space-y-3">
                <div aria-live="polite" className="space-y-2">
                  {targetName ? (
                    <p className="text-ink">
                      find: <strong>{targetName}</strong>
                    </p>
                  ) : (
                    <p className="text-ink">round done: every structure prompt in this round has been visited.</p>
                  )}
                  {quiz.feedback?.kind === 'right' && (
                    <p className="text-ink" data-feedback="right"><span aria-hidden="true">✓ </span>right: {targetName}.</p>
                  )}
                  {quiz.feedback?.kind === 'wrong' && (
                    <p className="text-ink" data-feedback="wrong">
                      <span aria-hidden="true">✗ </span>not this one: you picked {names.get(quiz.feedback.picked) ?? quiz.feedback.picked}. try again, or choose show me.
                    </p>
                  )}
                  {quiz.feedback?.kind === 'shown' && <p className="text-ink" data-feedback="shown">here it is: {targetName}.</p>}
                </div>
                <p className="text-sm text-ink-soft">guided practice — use the named list or 3D view. this is not a scored assessment.</p>
                <div className="flex flex-wrap gap-2">
                  {quiz.target ? (
                    <>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={quiz.feedback?.kind === 'shown' || quiz.feedback?.kind === 'right'}
                        onClick={() => {
                          visibilityIntent.bump();
                          const revealed = revealQuiz(quiz);
                          setQuiz(revealed);
                          setSelected(quiz.target);
                          const missed = missToRecord(quiz, revealed);
                          if (missed) recordMiss(missed);
                          // The target may have been hidden by the student (or its layer peeled away): put it back.
                          const target = quiz.target;
                          if (!target) return;
                          const loader = loaderRef.current;
                          const plan = revealTargetPlan(
                            layers,
                            hidden,
                            target,
                            (id) => (lazy && system ? filesForLayer(system, id) : []),
                            (url) => loader?.isLoaded(url) ?? true,
                            foundSet,
                          );
                          if (plan.fetch) reveal(plan.fetch);
                          else setHidden((h) => {
                            const next = new Set(h);
                            for (const id of plan.unhide) next.delete(id);
                            return next;
                          });
                        }}
                      >
                        show me
                      </button>
                      <button
                        type="button"
                        className={primaryButton}
                        onClick={() => {
                          visibilityIntent.bump();
                          const next = nextQuiz(quiz, Math.random);
                          setSelected(null);
                          setQuiz(next);
                          // A learner may have hidden a future target during the round, or an earlier peel may still be finishing.
                          // Make that target visible before asking them to find it, superseding pending peels.
                          const target = next.target;
                          if (target) setHidden((current) => {
                            if (!current.has(target)) return current;
                            const shown = new Set(current);
                            shown.delete(target);
                            return shown;
                          });
                        }}
                      >
                        next
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={primaryButton}
                        disabled={quizPool.length === 0}
                        onClick={() => setQuiz(startQuiz(quizPool, Math.random))}
                      >
                        start again
                      </button>
                      {quizPool.length === 0 && (
                        <p className="text-sm text-ink-soft">show a structure to start another round.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
          <section className="space-y-3 rounded-lg border border-line p-4" aria-labelledby="anatomy-recall-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="anatomy-recall-heading" className="text-lg text-ink">name it</h2>
              <button
                type="button"
                className={secondaryButton}
                aria-pressed={recall !== null}
                disabled={!ready || (recall === null && visible.length === 0)}
                onClick={toggleRecall}
              >
                {recall ? 'stop name it' : 'start name it'}
              </button>
            </div>
            {!recall && (
              <p className="text-sm text-ink-soft">the lab highlights a structure; you pick or type its name.</p>
            )}
            {recall && (
              <div className="space-y-3">
                <div aria-live="polite" className="space-y-2">
                  {recall.target ? (
                    <p className="text-ink">which structure is highlighted? it is drawn solid, and the rest see-through.</p>
                  ) : (
                    <p className="text-ink">round done: every structure in this round has been asked.</p>
                  )}
                  {recall.feedback?.kind === 'right' && (
                    <p className="text-ink" data-feedback="right">
                      <span aria-hidden="true">✓ </span>right: {names.get(recall.target ?? '') ?? recall.target}.
                    </p>
                  )}
                  {recall.feedback?.kind === 'wrong' && (
                    <p className="text-ink" data-feedback="wrong">
                      <span aria-hidden="true">✗ </span>not this one: {recall.feedback.how === 'typed' ? 'you typed' : 'you picked'} {recall.feedback.answer}. try again, or choose show me.
                    </p>
                  )}
                  {recall.feedback?.kind === 'shown' && (
                    <p className="text-ink" data-feedback="shown">it is: {names.get(recall.target ?? '') ?? recall.target}.</p>
                  )}
                </div>
                {recall.target && (
                  <>
                    <button type="button" className={secondaryButton} aria-pressed={alone} onClick={toggleAlone}>
                      see it alone
                    </button>
                    {recall.choices.length > 0 && (
                      <fieldset className="space-y-2">
                        <legend className="text-sm text-ink-soft">pick its name</legend>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          {recall.choices.map((id) => {
                            const settled = recallSettled(recall);
                            const isTarget = settled && id === recall.target;
                            const isWrongPick = recall.feedback?.kind === 'wrong' && recall.feedback.how === 'picked'
                              && recall.feedback.answer === (names.get(id) ?? id);
                            return (
                              <button
                                key={id}
                                type="button"
                                className="min-h-11 rounded-md border border-control px-3 py-2 text-left text-sm text-ink disabled:opacity-60"
                                disabled={settled}
                                onClick={() => setRecall(answerRecallChoice(recall, id, recallCatalog))}
                              >
                                {isTarget && <span aria-hidden="true">✓ </span>}
                                {isWrongPick && <span aria-hidden="true">✗ </span>}
                                {names.get(id) ?? id}
                                {isTarget && <span className="sr-only"> (the answer)</span>}
                                {isWrongPick && <span className="sr-only"> (not this one)</span>}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        setRecall(answerRecallTyped(recall, typed, recallCatalog));
                      }}
                    >
                      <label className="block min-w-0 flex-1 text-sm text-ink" htmlFor="anatomy-recall-typed">
                        {recall.choices.length > 0 ? 'or type its name' : 'type its name'}
                        <input
                          id="anatomy-recall-typed"
                          type="text"
                          value={typed}
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={200}
                          disabled={recallSettled(recall)}
                          onChange={(event) => setTyped(event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-md border border-control bg-page px-3 text-ink"
                        />
                      </label>
                      <button type="submit" className={secondaryButton} disabled={recallSettled(recall) || typed.trim() === ''}>
                        check
                      </button>
                    </form>
                  </>
                )}
                <p className="text-sm text-ink-soft">
                  guided practice: a typed name must match the official name (capitals and punctuation don't matter). not a scored assessment.
                </p>
                <div className="flex flex-wrap gap-2">
                  {recall.target ? (
                    <>
                      <button
                        type="button"
                        className={secondaryButton}
                        disabled={recallSettled(recall)}
                        onClick={() => setRecall(revealRecall(recall))}
                      >
                        show me
                      </button>
                      <button
                        type="button"
                        className={primaryButton}
                        onClick={() => {
                          setTyped('');
                          setRecall(nextRecall(recall, recallCatalog, Math.random));
                        }}
                      >
                        next
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={primaryButton}
                      disabled={recall.pool.length === 0}
                      onClick={() => {
                        setTyped('');
                        setRecall(startRecall(recall.pool, recallCatalog, Math.random));
                      }}
                    >
                      start again
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
          {studyReady && (
            <details className="rounded-lg border border-line" data-testid="anatomy-review-queue">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm text-ink-soft">
                your review queue ({queued.length})
              </summary>
              <div className="space-y-3 px-4 pb-4">
                <p className="text-sm text-ink-soft">
                  structures you missed in find it. got it takes one off; find it asks about the ones in the loaded model.
                </p>
                {queued.length === 0 ? (
                  <p className="text-sm text-ink-soft">nothing to review for {system.title}.</p>
                ) : (
                  <ul className="space-y-1">
                    {queued.map((id) => (
                      <li key={id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                        <span className="min-w-0 flex-1 break-words">{names.get(id) ?? id}</span>
                        <button type="button" className={secondaryButton} onClick={() => clearMiss(id)} aria-label={`got it: ${names.get(id) ?? id}`}>
                          got it
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className={secondaryButton} disabled={!ready || quiz !== null || reviewPool.length === 0} onClick={startReviewQuiz}>
                  find it: review queue
                </button>
              </div>
            </details>
          )}
          <fieldset className="space-y-3 rounded-lg border border-line p-4">
            <legend className="px-1 text-sm text-ink-soft">export a picture</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EXPORT_SIZES) as ExportSize[]).map((size) => (
                <button key={size} type="button" className={secondaryButton} disabled={!ready || exporting !== null || recall !== null} onClick={() => exportPicture(size)}>
                  {EXPORT_SIZES[size].label}
                </button>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-6 shrink-0" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              transparent background
            </label>
            <p className="text-sm text-ink-soft" aria-live="polite">{exporting ? 'drawing the picture…' : exportNote}</p>
          </fieldset>
          <section className="space-y-3 rounded-lg border border-line p-4" aria-labelledby="anatomy-worksheet-tools">
            <h2 id="anatomy-worksheet-tools" className="text-lg text-ink">worksheet</h2>
            <p className="text-sm text-ink-soft">
              a picture of this view with numbers instead of names, and a numbered list to fill in. up to 12 structures.
            </p>
            <button
              type="button"
              className={secondaryButton}
              disabled={!ready || worksheetBusy || namesHidden || exporting !== null}
              onClick={() => void makeWorksheet()}
            >
              make a worksheet
            </button>
            <p className="text-sm text-ink-soft" aria-live="polite" data-testid="anatomy-worksheet-status">
              {worksheetBusy ? 'drawing the worksheet…' : worksheetNote}
            </p>
          </section>
        </div>

      </div>

          <p id="anatomy-lab-help" className="sr-only">
            Turn the model by dragging or with the arrow keys; zoom by pinching, scrolling or pressing plus and minus.
            Number keys 1 to 5 show the anterior, posterior, lateral, lateral opposite and top views; 0 resets the view.
            In navigate mode a tap selects a structure; in hide mode a tap hides it. The list of structures does the
            same as tapping in 3D. Control or Command plus Z undoes a change to what is shown; add Shift to redo.
          </p>

          {worksheet && worksheet.systemKey === system.key && (
            <section className="anatomy-worksheet space-y-4 rounded-lg border border-line bg-page p-4" aria-labelledby="anatomy-worksheet-heading">
              <h2 ref={worksheetHeadingRef} tabIndex={-1} id="anatomy-worksheet-heading" className="text-lg text-ink">
                worksheet: {worksheet.title}
              </h2>
              {drafts && system.status === 'draft' && (
                <p className="rounded-md border border-line px-3 py-2 text-sm text-ink">draft · labels waiting for review</p>
              )}
              <img
                src={worksheet.src}
                alt={`numbered picture of ${worksheet.title}. each number points to a structure; write its name on the matching line below.`}
                className="block h-auto w-full max-w-prose rounded-md border border-line"
                width={1080}
                height={1080}
              />
              {worksheet.note && <p className="text-sm text-ink-soft">{worksheet.note}</p>}
              <ol className="space-y-3" aria-label="names to fill in">
                {worksheet.rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-baseline gap-2 text-ink">
                    <span className="min-w-8">{row.number}.</span>
                    {answersShown ? (
                      <span>{row.name}</span>
                    ) : (
                      <>
                        <span className="anatomy-worksheet-blank min-w-0 flex-1 border-b border-ink" aria-hidden="true" />
                        <span className="sr-only">blank: write the name of structure {row.number}</span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              <div className="anatomy-worksheet-credit space-y-1 text-sm text-ink-soft" data-testid="anatomy-worksheet-credit">
                {worksheetCreditLines(system).map((line) => <p key={line}>{line}</p>)}
              </div>
              <div className="anatomy-worksheet-tools flex flex-wrap gap-2">
                <button type="button" className={plainButton} aria-pressed={answersShown} onClick={() => setAnswersShown((on) => !on)}>
                  show answers
                </button>
                <button type="button" className={plainPrimaryButton} onClick={() => printGame('anatomy-worksheet')}>
                  print worksheet
                </button>
                <a className={`${plainButton} inline-flex items-center`} href={worksheet.src} download={worksheet.fileName}>
                  save the picture
                </a>
                <button type="button" className={plainButton} onClick={() => setWorksheet(null)}>
                  close worksheet
                </button>
              </div>
            </section>
          )}
    </div>
  );
}

/** The selected structure card's icon buttons. Drawn with the text colour; each button carries its own name. */
function CardIcon({ name }: { name: 'isolate' | 'hide' | 'show' | 'flag' | 'fade' | 'nearby' | 'say' | 'clear' }) {
  const paths: Record<typeof name, ReactNode> = {
    // one thing in a frame
    isolate: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><circle cx="12" cy="12" r="3" /></>,
    // an eye, struck through
    hide: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.5" /><path d="M4 4l16 16" /></>,
    show: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.5" /></>,
    flag: <path d="M6 21V4M6 5h11l-2.5 3.5L17 12H6" />,
    // a circle, half filled
    fade: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></>,
    // one thing with its neighbours around it
    nearby: <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="6" r="1.5" /><circle cx="19" cy="6" r="1.5" /><circle cx="5" cy="18" r="1.5" /><circle cx="19" cy="18" r="1.5" /></>,
    // a speaker
    say: <><path d="M4 10v4h3l5 4V6l-5 4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
    clear: <path d="M6 6l12 12M18 6L6 18" />,
  };
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** The hidden controls box: a remote control. Drawn with the text colour; the button around it carries the name. */
function RemoteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7.5" y="2.5" width="9" height="19" rx="3" />
      <circle cx="12" cy="7.5" r="1.9" />
      <path d="M10.4 12.5h.01M13.6 12.5h.01M10.4 15.5h.01M13.6 15.5h.01M10.4 18.5h.01M13.6 18.5h.01" strokeWidth={2} />
    </svg>
  );
}

/** The hidden body systems box: a bone. Drawn with the text colour; the button around it carries the name. */
function BoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path transform="rotate(-45 12 12)" d="M7.2 9.6a2.4 2.4 0 1 0-3.4 2.4 2.4 2.4 0 1 0 3.4 2.4h9.6a2.4 2.4 0 1 0 3.4-2.4 2.4 2.4 0 1 0-3.4-2.4z" />
    </svg>
  );
}

/** While the lab is on screen it is the whole page: everything else on the page is hidden (anatomy-lab.css). */
function LabFullPage() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('lab-open');
    return () => root.classList.remove('lab-open');
  }, []);
  return null;
}

/**
 * The labels over the 3D view, with leader lines. It keeps its own state so following the camera every frame redraws
 * only the labels, never the structure list. Positions go through React's style property, which the browser applies
 * through the CSSOM (allowed by our content security policy; a style="" attribute in the HTML would not be).
 */
function LabelOverlay({
  setterRef,
  onMount,
}: {
  setterRef: MutableRefObject<((labels: OverlayLabel[]) => void) | null>;
  onMount: () => void;
}) {
  const [placed, setPlaced] = useState<OverlayLabel[]>(EMPTY_OVERLAY_LABELS);
  useEffect(() => {
    setterRef.current = setPlaced;
    onMount();
    return () => {
      setterRef.current = null;
    };
  }, [setterRef, onMount]);
  if (placed.length === 0) return null;
  return (
    // The names are in the structure list too, so screen readers skip this copy. A label whose structure is hidden
    // behind others from this side says "(behind)" and has a dashed line, box and hollow dot: never color alone.
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" data-testid="anatomy-labels" aria-hidden="true">
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        {placed.map((p) => (
          <g key={p.id} data-behind={p.behind ? '' : undefined}>
            <line
              x1={p.anchorX}
              y1={p.anchorY}
              x2={p.lineX}
              y2={p.lineY}
              className={p.behind ? 'stroke-ink-soft' : 'stroke-ink'}
              strokeWidth={1.5}
              strokeDasharray={p.behind ? '5 4' : undefined}
            />
            <circle
              cx={p.anchorX}
              cy={p.anchorY}
              r={3}
              className={p.behind ? 'fill-page stroke-ink-soft' : 'fill-ink'}
              strokeWidth={p.behind ? 1.5 : undefined}
            />
          </g>
        ))}
      </svg>
      {placed.map((p) => (
        <span
          key={p.id}
          data-behind={p.behind ? '' : undefined}
          className={`absolute flex flex-col justify-center rounded-md border bg-page px-2 text-sm leading-normal whitespace-nowrap text-ink ${p.behind ? 'border-dashed border-ink-soft' : 'border-line'}`}
          style={{ left: `${Math.round(p.x)}px`, top: `${Math.round(p.y)}px`, width: `${p.width}px`, height: `${p.height}px` }}
        >
          {p.lines.map((line, i) => (
            <span key={i} className="block">
              {line}
              {p.mark === 'inline' && i === p.lines.length - 1 && <span className="text-ink-soft"> {BEHIND_MARK}</span>}
            </span>
          ))}
          {p.mark === 'line' && <span className="block text-ink-soft">{BEHIND_MARK}</span>}
        </span>
      ))}
    </div>
  );
}
