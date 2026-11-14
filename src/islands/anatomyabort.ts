/**
 * Lets a model request stop immediately on AbortSignal, even if asynchronous
 * decoding does not itself support cancellation. Any decoded model arriving
 * after abort is disposed instead of being inserted into a retired WebGL scene.
 *
 * The caller must also pass the signal to fetch() to cancel network traffic.
 */
export function awaitAbortable<T>(
  pending: Promise<T>,
  signal: AbortSignal,
  disposeLate: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const onAbort = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('The model load was canceled.', 'AbortError'));
    };
    // Observe both outcomes even after cancellation. A decoder may finish
    // after the UI has already moved to the retry state.
    void pending.then(
      (value) => {
        if (finished || signal.aborted) {
          try { disposeLate(value); } catch { /* Best-effort GPU cleanup. */ }
          onAbort();
          return;
        }
        finished = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
    else {
      signal.addEventListener('abort', onAbort, { once: true });
      // A late abort must not slip between checking and subscribing.
      if (signal.aborted) onAbort();
    }
  });
}
