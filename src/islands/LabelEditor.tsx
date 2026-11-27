import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { LabelSet } from './labelit';
import {
  addLabel, boxFromDrag, deleteLabel, fitSize, isOwnPicture, MAX_LABELS, moveLabel, ownImage, redo, renameLabel, resizeLabel, select,
  setBox, startEdit, studyProblem, undo, withPicture, type Box, type EditState,
} from './labeledit';

interface Props {
  /** The set to start from. */
  set: LabelSet;
  /** Cueory's own set for this page, to go back to. */
  original: LabelSet;
  onDone: (set: LabelSet) => void;
  onCancel: () => void;
}

const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  className: 'size-5',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
const toolButton = 'press inline-flex size-(--tap-min) shrink-0 items-center justify-center rounded-pill border border-line bg-page text-ink disabled:opacity-40';
const primaryButton = 'press inline-flex min-h-(--tap-min) w-full items-center justify-center rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover disabled:opacity-50';
const secondaryButton = 'press inline-flex min-h-(--tap-min) w-full items-center justify-center rounded-pill border border-control px-6 py-3 text-ink';

type Drag =
  | { kind: 'draw'; ax: number; ay: number; box: Box }
  | { kind: 'move'; id: string; dx: number; dy: number; box: Box }
  | { kind: 'resize'; id: string; box: Box };

/**
 * The "make" side of label it (Christian, 2026-11-26): the student covers the labels on a picture, names each cover,
 * and may use a picture of their own. Covers can be drawn, moved and resized by mouse or touch, and every one of those
 * also works without dragging: "add a cover" places one, arrow keys move the selected cover, Shift with the arrows
 * resizes it, and Delete removes it. Nothing is saved or sent: the set lives in the page until the student leaves.
 */
export default function LabelEditor({ set, original, onDone, onCancel }: Props) {
  const [state, setState] = useState<EditState>(() => startEdit(set));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [problem, setProblem] = useState('');
  const picture = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // Opening the editor replaces the board, so the keyboard focus moves to the editor's first tool.
  useEffect(() => addButton.current?.focus(), []);
  const listId = useId();
  const labels = state.set.labels;
  const blocked = studyProblem(state.set);

  /** Where a pointer is on the picture, in percent. */
  const at = (e: ReactPointerEvent) => {
    const rect = picture.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const onPictureDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || labels.length >= MAX_LABELS) return;
    const p = at(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setState((s) => select(s, null));
    setDrag({ kind: 'draw', ax: p.x, ay: p.y, box: boxFromDrag(p.x, p.y, p.x, p.y) });
  };
  const onCoverDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string, resize: boolean) => {
    e.stopPropagation();
    const label = labels.find((l) => l.id === id)!;
    const p = at(e);
    picture.current!.setPointerCapture(e.pointerId);
    setState((s) => select(s, id));
    setDrag(resize ? { kind: 'resize', id, box: label } : { kind: 'move', id, dx: p.x - label.x, dy: p.y - label.y, box: label });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const p = at(e);
    if (drag.kind === 'draw') setDrag({ ...drag, box: boxFromDrag(drag.ax, drag.ay, p.x, p.y) });
    else if (drag.kind === 'move') setDrag({ ...drag, box: { ...drag.box, x: p.x - drag.dx, y: p.y - drag.dy } });
    else setDrag({ ...drag, box: { ...drag.box, w: p.x - drag.box.x, h: p.y - drag.box.y } });
  };
  const onUp = () => {
    if (!drag) return;
    // A tap on the empty picture (no real drag) draws nothing.
    if (drag.kind === 'draw') {
      if (drag.box.w > 4.5 || drag.box.h > 4.5) setState((s) => addLabel(s, drag.box));
    } else setState((s) => setBox(s, drag.id, drag.box));
    setDrag(null);
  };

  const onCoverKey = (e: ReactKeyboardEvent, id: string) => {
    const step = 1;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = arrows[e.key];
    if (move) {
      e.preventDefault();
      setState((s) => (e.shiftKey ? resizeLabel(s, id, move[0], move[1]) : moveLabel(s, id, move[0], move[1])));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setState((s) => deleteLabel(s, id));
      // The cover is gone, so its focus goes to the tools instead of being lost.
      addButton.current?.focus();
    }
  };

  const choosePicture = async (file: File | undefined) => {
    setProblem('');
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setProblem('that file is not a picture this page can use. choose a JPEG, PNG or WebP picture.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const size = fitSize(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
      bitmap.close();
      const src = canvas.toDataURL('image/jpeg', 0.85);
      if (!isOwnPicture(src)) {
        setProblem('that picture is too large for this page, even after it was made smaller. try a smaller one.');
        return;
      }
      setState((s) => withPicture(s, ownImage(src, size.width, size.height)));
    } catch {
      setProblem('that picture could not be opened. try another one.');
    }
  };

  // Undo and redo from the keyboard, when the focus is not in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      setState((s) => (e.shiftKey ? redo(s) : undo(s)));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const shown = (id: string, box: Box): Box => (drag && drag.kind !== 'draw' && drag.id === id ? drag.box : box);
  const place = (box: Box) => ({ left: `${box.x}%`, top: `${box.y}%`, width: `${Math.max(box.w, 0)}%`, height: `${Math.max(box.h, 0)}%` });
  const ownPicture = isOwnPicture(state.set.image.src);

  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="label-editor">
      <div className="rounded-2xl border border-line bg-page p-4 shadow-card lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="cover tools">
          <button ref={addButton} type="button" className={toolButton} aria-label="add a cover" title="add a cover" disabled={labels.length >= MAX_LABELS} onClick={() => setState((s) => addLabel(s))}>
            <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" className={toolButton} aria-label="undo" title="undo" disabled={state.past.length === 0} onClick={() => {
            if (state.past.length <= 1) addButton.current?.focus();
            setState(undo);
          }}>
            <svg {...iconProps}><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
          </button>
          <button type="button" className={toolButton} aria-label="redo" title="redo" disabled={state.future.length === 0} onClick={() => {
            if (state.future.length <= 1) addButton.current?.focus();
            setState(redo);
          }}>
            <svg {...iconProps}><path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></svg>
          </button>
          <button
            type="button"
            className={toolButton}
            aria-label="delete the selected cover"
            title="delete the selected cover"
            disabled={!state.selected}
            onClick={() => {
              setState((s) => (s.selected ? deleteLabel(s, s.selected) : s));
              addButton.current?.focus();
            }}
          >
            <svg {...iconProps}><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>
          </button>
        </div>

        <div
          ref={picture}
          className="relative mt-3 touch-none overflow-hidden rounded-xl bg-surface select-none"
          onPointerDown={onPictureDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDrag(null)}
          data-testid="label-editor-picture"
        >
          <img
            src={state.set.image.src}
            alt={state.set.image.alt}
            width={state.set.image.width}
            height={state.set.image.height}
            draggable={false}
            className="pointer-events-none block h-auto w-full"
          />
          {labels.map((label, i) => {
            const selected = state.selected === label.id;
            return (
              <button
                key={label.id}
                type="button"
                aria-label={`cover ${i + 1}${label.text ? `: ${label.text}` : ', no words yet'}`}
                aria-pressed={selected}
                aria-describedby={`${listId}-help`}
                style={place(shown(label.id, label))}
                onPointerDown={(e) => onCoverDown(e, label.id, false)}
                onKeyDown={(e) => onCoverKey(e, label.id)}
                onFocus={() => setState((s) => select(s, label.id))}
                data-testid="label-editor-cover"
                className={`absolute flex items-center justify-center rounded-md text-sm font-bold text-on-button ${selected ? 'bg-highlight outline-2 outline-offset-2 outline-ink outline-dashed' : 'bg-button'}`}
              >
                {i + 1}
                {selected && (
                  <span
                    aria-hidden="true"
                    onPointerDown={(e) => onCoverDown(e as unknown as ReactPointerEvent<HTMLButtonElement>, label.id, true)}
                    className="absolute -end-2 -bottom-2 size-5 cursor-nwse-resize rounded-pill border-2 border-ink bg-page"
                    data-testid="label-editor-resize"
                  />
                )}
              </button>
            );
          })}
          {drag?.kind === 'draw' && <span aria-hidden="true" style={place(drag.box)} className="pointer-events-none absolute rounded-md border-2 border-dashed border-ink" />}
        </div>
        <p id={`${listId}-help`} className="mt-3 text-sm text-ink-soft">
          drag on the picture to cover a label, or use “add a cover”. tap a cover to move it or pull its corner to resize it. with
          a keyboard: arrow keys move the selected cover, shift with the arrows resizes it, delete removes it.
        </p>
        <p className="mt-1 text-sm text-ink-soft">{state.set.image.credit}</p>
      </div>

      <div className="rounded-2xl border border-line bg-page p-4 shadow-card">
        <h2 className="text-sm font-bold text-ink-soft">covered labels ({labels.length})</h2>
        {labels.length === 0 && <p className="mt-3 text-sm text-ink-soft">no covers yet.</p>}
        <ol className="mt-3 space-y-2">
          {labels.map((label, i) => (
            <li key={label.id} className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface text-sm font-bold">{i + 1}</span>
              <input
                type="text"
                value={label.text}
                aria-label={`words under cover ${i + 1}`}
                placeholder="what is under it?"
                onChange={(e) => {
                  // Read the field now: the event is gone by the time the state update runs.
                  const text = e.currentTarget.value;
                  setState((s) => renameLabel(s, label.id, text));
                }}
                onFocus={() => setState((s) => select(s, label.id))}
                autoComplete="off"
                className={`min-h-(--tap-min) min-w-0 flex-1 rounded-xl border bg-page px-3 text-ink ${state.selected === label.id ? 'border-ink' : 'border-line'}`}
              />
            </li>
          ))}
        </ol>

        <p role="alert" className="mt-3 text-sm text-ink" data-testid="label-editor-problem">
          {problem && <><span className="font-bold">problem:</span> {problem}</>}
        </p>
        <button type="button" className={`mt-2 ${primaryButton}`} disabled={blocked !== null} aria-describedby={`${listId}-blocked`} onClick={() => onDone(state.set)}>
          start studying
        </button>
        <p id={`${listId}-blocked`} className="mt-2 text-sm text-ink-soft">{blocked ?? 'your covers stay until you leave this page.'}</p>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="choose your own picture"
          onChange={(e) => {
            void choosePicture(e.currentTarget.files?.[0]);
            e.currentTarget.value = '';
          }}
        />
        <button type="button" className={`mt-3 ${secondaryButton}`} onClick={() => fileInput.current?.click()}>
          use my own picture
        </button>
        {(ownPicture || state.set !== original) && (
          <button
            type="button"
            className={`mt-3 ${secondaryButton}`}
            onClick={() => {
              setState((s) => ({ ...startEdit(original), past: [...s.past, s.set] }));
              addButton.current?.focus();
            }}
          >
            back to cueory's drawing
          </button>
        )}
        <button type="button" className="mt-3 inline-flex min-h-(--tap-min) w-full items-center justify-center text-sm text-ink-soft underline" onClick={onCancel}>
          cancel
        </button>
        <p className="mt-2 text-sm text-ink-soft">your own picture is never uploaded. use only pictures you are allowed to use.</p>
      </div>
    </div>
  );
}
