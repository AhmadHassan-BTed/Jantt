import { useState, useRef, useCallback } from "react";

export function useToast() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isToastError, setIsToastError] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, isErr = false) => {
    setToastMessage(msg);
    setIsToastError(isErr);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  return {
    toastMessage,
    isToastError,
    showToast
  };
}
