import { useState, useRef, useCallback, useEffect, useMemo } from "react";

export interface ToastItem {
  id: number;
  message: string;
  isError: boolean;
}

/** At most this many toasts are on screen; older ones are dropped first. */
const MAX_VISIBLE_TOASTS = 3;
const SUCCESS_TTL_MS = 3500;
/** Errors stay longer so they can be read (and can always be dismissed manually). */
const ERROR_TTL_MS = 8000;

/**
 * Small notification queue.
 * `showToast(message, isError)` keeps its historical signature; several toasts can now be
 * visible at once instead of the next call silently overwriting the previous one.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<number, number>());
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => (prev.some((t) => t.id === id) ? prev.filter((t) => t.id !== id) : prev));
  }, []);

  const showToast = useCallback(
    (msg: string, isErr = false) => {
      const id = nextIdRef.current++;
      setToasts((prev) => {
        // Collapse an identical message that is still visible (e.g. repeated sync errors).
        const withoutDuplicate = prev.filter((t) => t.message !== msg);
        return [...withoutDuplicate, { id, message: msg, isError: isErr }].slice(-MAX_VISIBLE_TOASTS);
      });
      timersRef.current.set(
        id,
        window.setTimeout(() => dismissToast(id), isErr ? ERROR_TTL_MS : SUCCESS_TTL_MS)
      );
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const latest = toasts.length > 0 ? toasts[toasts.length - 1] : null;

  return useMemo(
    () => ({
      toasts,
      dismissToast,
      showToast,
      /** @deprecated Use `toasts`; kept for backward compatibility (latest message only). */
      toastMessage: latest ? latest.message : null,
      /** @deprecated Use `toasts`; kept for backward compatibility. */
      isToastError: latest ? latest.isError : false
    }),
    [toasts, dismissToast, showToast, latest]
  );
}
