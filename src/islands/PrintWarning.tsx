import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  /** Shown (as an alert) when "print anyway" could not record the day; the dialog stays open. */
  error?: string;
  /** "finish the game first": closes the dialog and goes on to the game. */
  onFinish: () => void;
  /** "print anyway": the caller records the forfeit, then opens the sheet. */
  onPrint: () => void;
  /** Esc or the backdrop: closes the dialog and changes nothing. */
  onCancel: () => void;
}

const BUTTON = 'inline-flex min-h-11 min-w-24 items-center justify-center rounded-pill border-2 px-6 font-bold';

/**
 * The warning before printing a game that is not finished (Christian, 2026-11-25). A native modal dialog: the browser
 * traps focus, closes it on Esc and puts focus back on the button that opened it. "finish the game first" has the
 * focus; nothing is recorded unless "print anyway" is pressed.
 */
export default function PrintWarning({ open, error, onFinish, onPrint, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const finish = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      finish.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="print-warning-heading"
      aria-describedby="print-warning-body"
      data-testid="print-warning"
      className="m-auto w-(--sheet-dialog-width) rounded-xl border border-line bg-page p-6 text-ink backdrop:bg-ink/40"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <h2 id="print-warning-heading" className="text-2xl">print before you finish?</h2>
      <p id="print-warning-body" className="mt-3 text-base">
        the printed copy shows today&apos;s answers. if you print now, today&apos;s game will be marked wrong and incomplete. finish the game first to keep your result.
      </p>
      {error && <p role="alert" className="mt-4 text-base font-bold" data-testid="print-warning-error">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button ref={finish} type="button" className={`${BUTTON} border-button bg-button text-on-button hover:border-button-hover hover:bg-button-hover`} onClick={onFinish}>
          finish the game first
        </button>
        <button type="button" className={`${BUTTON} border-ink bg-transparent text-ink hover:bg-surface`} onClick={onPrint}>
          print anyway
        </button>
      </div>
    </dialog>
  );
}
