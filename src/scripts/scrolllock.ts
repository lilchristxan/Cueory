/**
 * Locks the page behind a dialog (game results, the sign-up pop-up) against wheel, touch and programmatic scrolling.
 * `overflow: hidden` alone stops a wheel but not a scroll the page is asked for, nor a swipe in older iOS Safari, so
 * the body is also fixed in place at its current offset and put back exactly on unlock.
 */
export interface ScrollRoot {
  style: Pick<CSSStyleDeclaration, 'overflow' | 'overscrollBehavior'>;
}

export interface ScrollBody {
  style: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'right' | 'width' | 'overflow' | 'overscrollBehavior'>;
}

export interface ScrollView {
  readonly scrollX: number;
  readonly scrollY: number;
  scrollTo(x: number, y: number): void;
}

/** Prevents wheel and touch scrolling behind a dialog, including iOS, then restores the exact inline state. */
export function lockPageScroll(root: ScrollRoot, body: ScrollBody, view: ScrollView): () => void {
  const x = view.scrollX;
  const y = view.scrollY;
  const rootBefore = { overflow: root.style.overflow, overscrollBehavior: root.style.overscrollBehavior };
  const bodyBefore = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    overscrollBehavior: body.style.overscrollBehavior,
  };

  root.style.overflow = 'hidden';
  root.style.overscrollBehavior = 'none';
  body.style.position = 'fixed';
  body.style.top = `${-y}px`;
  body.style.left = `${-x}px`;
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    root.style.overflow = rootBefore.overflow;
    root.style.overscrollBehavior = rootBefore.overscrollBehavior;
    body.style.position = bodyBefore.position;
    body.style.top = bodyBefore.top;
    body.style.left = bodyBefore.left;
    body.style.right = bodyBefore.right;
    body.style.width = bodyBefore.width;
    body.style.overflow = bodyBefore.overflow;
    body.style.overscrollBehavior = bodyBefore.overscrollBehavior;
    view.scrollTo(x, y);
  };
}
