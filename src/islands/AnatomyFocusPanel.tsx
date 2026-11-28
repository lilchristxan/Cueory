/**
 * The "choose what to focus on" panel (Task 178). The student turns choosing on, ticks structures in the list or taps
 * them on the model, and one link takes the choice into label it. The set itself lives in anatomyfocus.ts; this only
 * draws it. Chosen structures say so in words and with a tick, never by colour alone.
 */
import { FOCUS_EMPTY_NOTE, focusCountWords } from './anatomyfocus';

export function AnatomyFocusPanel({
  on, onToggle, count, href, onClear, full,
}: {
  on: boolean;
  onToggle: () => void;
  count: number;
  /** The label it address for the set, or null while nothing is chosen. */
  href: string | null;
  onClear: () => void;
  full: boolean;
}) {
  return (
    <div role="group" className="lab-glass lab-solid mx-3 mb-3 space-y-3 p-4 lg:pointer-events-auto lg:m-0" aria-labelledby="anatomy-focus-heading" data-testid="anatomy-focus">
      <h2 id="anatomy-focus-heading" className="lab-cap">choose what to focus on</h2>
      <button type="button" className="lab-btn w-full" aria-pressed={on} onClick={onToggle} data-testid="anatomy-focus-toggle">
        {on ? 'choosing: on' : 'choose structures'}
      </button>
      {on && (
        <p className="text-sm text-ink-soft" data-testid="anatomy-focus-help">
          tick structures in the list, or tap them on the model. the ones you have not chosen fade.
        </p>
      )}
      {(on || count > 0) && (
        <>
          <p className="lab-stat" aria-live="polite" data-testid="anatomy-focus-count">
            <span className="lab-cap">focus</span> <span>{focusCountWords(count)}</span>
          </p>
          {full && <p className="text-sm text-ink-soft" role="status">that is the most you can choose at once.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="lab-btn" disabled={count === 0} onClick={onClear} data-testid="anatomy-focus-clear">clear</button>
            {href ? (
              <a href={href} className="lab-btn lab-btn-primary no-underline" data-testid="anatomy-focus-link">practise these in label it</a>
            ) : (
              <a role="link" aria-disabled="true" tabIndex={0} aria-describedby="anatomy-focus-why" className="lab-btn no-underline" data-testid="anatomy-focus-link" onClick={(e) => e.preventDefault()}>practise these in label it</a>
            )}
          </div>
          {!href && <p id="anatomy-focus-why" className="text-sm text-ink-soft" data-testid="anatomy-focus-why">{FOCUS_EMPTY_NOTE}</p>}
        </>
      )}
    </div>
  );
}
