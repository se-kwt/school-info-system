"use client";

import { useCallback, useRef, useState } from "react";

export function useSubmitGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, run };
}
