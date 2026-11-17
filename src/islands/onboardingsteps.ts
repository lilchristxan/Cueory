/** The two existing optional setup answers, in the order shown. No new stored fields. */
export const ONBOARDING_FIELDS = ['course', 'examDate'] as const;
export type OnboardingStep = 0 | 1;
export type OnboardingField = (typeof ONBOARDING_FIELDS)[number];
export type OnboardingMove = { kind: 'question'; step: OnboardingStep } | { kind: 'finish' };

/** A forward move finishes only after the last question. */
export function nextOnboardingStep(step: OnboardingStep): OnboardingMove {
  const nextIndex = step + 1;
  return nextIndex < ONBOARDING_FIELDS.length
    ? { kind: 'question', step: nextIndex as OnboardingStep }
    : { kind: 'finish' };
}

/** The first question has no previous setup question (the Back link returns home). */
export function previousOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  return step === 0 ? null : ((step - 1) as OnboardingStep);
}

/** Skipping clears only the current answer. The island handles touched flags and persistence. */
export function skipOnboardingStep(step: OnboardingStep): { clear: OnboardingField; move: OnboardingMove } {
  return { clear: ONBOARDING_FIELDS[step], move: nextOnboardingStep(step) };
}

/**
 * Moves focus to the new question after it renders, unless the student has already moved focus somewhere else in the
 * meantime (a fast Tab or a click on "save my answers"). Focus that fell to the page body, or stayed on an element
 * that is gone or unchanged, still moves, so the new question is announced as before.
 */
export function focusAfterRender(
  target: () => { focus: () => void } | null | undefined,
  page: { active: () => Element | null; body: () => Element | null; schedule: (run: () => void) => void },
): void {
  const before = page.active();
  page.schedule(() => {
    if (movedOn(before, page.active(), page.body())) return;
    target()?.focus();
  });
}

/** True when focus now sits on a different, still-present element than when the step changed. */
export function movedOn(before: Element | null, now: Element | null, body: Element | null): boolean {
  if (!now || now === body || now === before) return false;
  return now.isConnected;
}
