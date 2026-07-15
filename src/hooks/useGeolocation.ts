"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PreciseGeolocationError,
  requestPreciseGeolocation,
} from "@/src/utils/preciseGeolocation";

export function useGeolocation() {
  const [isLocating, setIsLocating] = useState(false);
  const activeRequestRef = useRef<ReturnType<typeof requestPreciseGeolocation> | null>(null);
  const mountedRef = useRef(true);

  const cancelPosition = useCallback(() => {
    activeRequestRef.current?.cancel();
    activeRequestRef.current = null;
    if (mountedRef.current) setIsLocating(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current?.cancel();
      activeRequestRef.current = null;
    };
  }, []);

  const getPosition = useCallback(async (options?: {
    onAccuracyChange?: (accuracyMeters: number) => void;
  }) => {
    if (!navigator.geolocation) {
      throw new PreciseGeolocationError(
        "UNSUPPORTED",
        "A geolocalização não é suportada neste navegador."
      );
    }

    activeRequestRef.current?.cancel();
    const request = requestPreciseGeolocation(navigator.geolocation, options);
    activeRequestRef.current = request;
    setIsLocating(true);

    try {
      return await request.promise;
    } finally {
      if (activeRequestRef.current === request) {
        activeRequestRef.current = null;
        if (mountedRef.current) setIsLocating(false);
      }
    }
  }, []);

  return { getPosition, cancelPosition, isLocating };
}
