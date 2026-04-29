// Realtime subscriptions on busy tables can fire many events in a tight burst
// (e.g., a campaign sending 10 emails in 5 seconds). Without debounce, each
// event triggers a full reload(), thrashing the network and the UI. This
// helper coalesces calls within `delayMs` into a single tail call.
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): { (...args: Args): void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}
