/**
 * Resolves after the UI has had a chance to paint the current state (e.g. a button's
 * busy spinner). Await this before heavy synchronous JS work such as HD key derivation,
 * so a tap always shows feedback first instead of freezing on the old frame.
 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    const raf: ((cb: () => void) => unknown) | undefined = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame;
    if (typeof raf === "function") raf(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 16);
  });
}
