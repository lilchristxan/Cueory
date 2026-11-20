/**
 * Shows the focus ring on a control that a keyboard key just pressed (engine run 44460645965, group E8).
 *
 * A control focused by a mouse click does not match :focus-visible. Chromium and WebKit start matching once the
 * student presses a key on it; Firefox does not, so after a click and then Enter or Space the control has focus but
 * no ring. Call this from a click handler when the click came from the keyboard (event.detail is 0). It first asks for
 * the ring in place; if the browser ignores that for an element that is already focused, it focuses it again.
 */
export function showFocusRing(element: HTMLElement, active: Element | null = document.activeElement): void {
  if (active !== element || element.matches(':focus-visible')) return;
  element.focus({ focusVisible: true });
  if (element.matches(':focus-visible')) return;
  element.blur();
  element.focus({ focusVisible: true });
}
