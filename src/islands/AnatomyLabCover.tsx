/**
 * The anatomy lab's cover (Task 178): the one button that opens it. Shared by the small island the page loads
 * (`AnatomyLabOpen.tsx`) and the lab itself (`AnatomyLab.tsx`), so the two never drift apart.
 */
export default function AnatomyLabCover({ onOpen, busy = false, error = false, note = 'loads the 3D viewer, then one body system at a time.' }: { onOpen: () => void; busy?: boolean; error?: boolean; note?: string }) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onOpen}
        aria-busy={busy || undefined}
        disabled={busy}
        className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-5 py-3 text-ink hover:bg-button-hover hover:text-on-button disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3L21 8.5V15.5L12 21L3 15.5V8.5L12 3Z" />
          <path d="M12 3V21M3 8.5L12 14L21 8.5" />
        </svg>
        {busy ? 'opening the anatomy lab…' : 'open the anatomy lab'}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-ink">the anatomy lab could not open. check the connection and try again.</p>
      ) : (
        <p className="text-sm text-ink-soft" data-testid="anatomy-cover-note">{note}</p>
      )}
    </div>
  );
}
